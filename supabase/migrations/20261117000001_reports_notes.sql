-- Reports ("Informar un error": what is wrong with a video or document, and the
-- fix) and notes (more information about a document). Approving a report with
-- a structured fix hides or moves the thing it is about; the site applies that
-- from public_contributions, at build time and live.

alter table public.contributions drop constraint contributions_type_check;
alter table public.contributions add constraint contributions_type_check
  check (type in ('upload', 'fact', 'tag', 'transcription', 'memory', 'report', 'note'));

-- Points: a report 10, a note 5.
create or replace function public.approve_contribution(
  cid uuid,
  fills_gap boolean,
  payload_override jsonb default null
) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c public.contributions;
  pts integer;
  v text;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;

  select * into c from public.contributions where id = cid for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if c.status <> 'pending' then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;

  pts := case c.type
    when 'upload' then case when coalesce(approve_contribution.fills_gap, false) then 50 else 20 end
    when 'fact' then 10
    when 'transcription' then 15
    when 'tag' then 2
    when 'memory' then 5
    when 'report' then 10
    when 'note' then 5
    else 0
  end;

  update public.contributions
     set status = 'approved',
         reviewer_id = auth.uid(),
         reviewed_at = now(),
         payload = payload || coalesce(payload_override, '{}'::jsonb),
         points_awarded = pts
   where id = cid
  returning * into c;

  update public.profiles set points = points + pts where id = c.user_id;

  if c.type = 'fact' and c.payload ->> 'field' = 'edicion_realizada' then
    if c.festival is null or c.year is null then
      raise exception 'edition_required' using errcode = 'P0001';
    end if;
    v := lower(btrim(c.payload ->> 'value'));
    if v in ('si', 'sí', 'yes', 'true', '1', 'held') then
      v := 'held';
    elsif v in ('no', 'false', '0', 'not_held') then
      v := 'not_held';
    else
      raise exception 'invalid_value' using errcode = 'P0001';
    end if;
    insert into public.editions (festival, year, status, updated_at)
      values (c.festival, c.year, v, now())
      on conflict (festival, year) do update
        set status = excluded.status, updated_at = excluded.updated_at;
  end if;

  perform public.award_badges(c.user_id, c, coalesce(approve_contribution.fills_gap, false));
  return pts;
end
$$;

-- Ojo de lince: 50 approved tags and reports together.
create or replace function public.award_badges(uid uuid, c public.contributions, fills_gap boolean)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.contributions
       where user_id = uid and status = 'approved') >= 1 then
    insert into public.user_badges (user_id, badge) values (uid, 'primer-aporte')
      on conflict do nothing;
  end if;

  if c.festival is not null and (select count(*) from public.contributions
       where user_id = uid and status = 'approved' and festival = c.festival) >= 10 then
    insert into public.user_badges (user_id, badge) values (uid, 'archivista-' || c.festival)
      on conflict do nothing;
  end if;

  if c.type = 'upload' and fills_gap and c.payload ->> 'category' = 'programa' then
    insert into public.user_badges (user_id, badge) values (uid, 'cazador-de-programas')
      on conflict do nothing;
  end if;

  if (select count(*) from public.contributions
       where user_id = uid and status = 'approved' and type = 'memory') >= 5 then
    insert into public.user_badges (user_id, badge) values (uid, 'bardo')
      on conflict do nothing;
  end if;

  if (select count(*) from public.contributions
       where user_id = uid and status = 'approved' and type in ('tag', 'report')) >= 50 then
    insert into public.user_badges (user_id, badge) values (uid, 'ojo-de-lince')
      on conflict do nothing;
  end if;
end
$$;

-- A report's explanation (payload.texto) may name people or carry hearsay: it
-- stays in the table for admins and never reaches the public view or the export.
create or replace view public.public_contributions as
  select c.id,
         c.type,
         c.festival,
         c.year,
         c.item_id,
         case
           when c.type = 'upload' then c.payload - 'storage_path'
           when c.type = 'report' then c.payload - 'texto'
           else c.payload
         end as payload,
         c.created_at,
         c.reviewed_at,
         p.display_name
  from public.contributions c
  join public.profiles p on p.id = c.user_id
  where c.status = 'approved';

revoke all on public.public_contributions from anon, authenticated;
grant select on public.public_contributions to anon, authenticated;
