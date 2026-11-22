-- Video transcript corrections: a collaborator proposes line-by-line changes
-- (payload.cambios); the maintainer approves all or some of them. 2 points per
-- change kept, at most 30. An approved row can later be withdrawn or have its
-- changes re-anchored by the maintainer.

alter table public.contributions drop constraint contributions_type_check;
alter table public.contributions add constraint contributions_type_check
  check (type in ('upload', 'fact', 'tag', 'transcription', 'memory', 'report', 'note', 'video_text'));

-- Scored on the changes kept after any partial-approval override is merged.
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
    when 'video_text' then least(2 * coalesce(jsonb_array_length((c.payload || coalesce(payload_override, '{}'::jsonb)) -> 'cambios'), 0), 30)
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

create or replace function public.admin_withdraw_contribution(cid uuid, note text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c public.contributions;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select * into c from public.contributions where id = cid for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if c.status <> 'approved' then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;
  if c.type <> 'video_text' then
    raise exception 'wrong_type' using errcode = 'P0001';
  end if;

  update public.contributions
     set status = 'rejected',
         review_note = note,
         reviewed_at = now(),
         reviewer_id = auth.uid(),
         points_awarded = 0
   where id = cid;
  update public.profiles set points = points - coalesce(c.points_awarded, 0) where id = c.user_id;
end
$$;

create or replace function public.admin_set_video_text_changes(cid uuid, cambios jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c public.contributions;
  item jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select * into c from public.contributions where id = cid for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if c.status <> 'approved' then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;
  if c.type <> 'video_text' then
    raise exception 'wrong_type' using errcode = 'P0001';
  end if;

  if cambios is null or jsonb_typeof(cambios) <> 'array'
     or jsonb_array_length(cambios) not between 1 and 200 then
    raise exception 'invalid' using errcode = 'P0001';
  end if;
  for item in select * from jsonb_array_elements(cambios) loop
    if jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item -> 't') is distinct from 'number'
       or (item ->> 't')::numeric < 0
       or (item ? 'texto' and (jsonb_typeof(item -> 'texto') <> 'string'
            or char_length(item ->> 'texto') not between 1 and 500)) then
      raise exception 'invalid' using errcode = 'P0001';
    end if;
  end loop;

  update public.contributions
     set payload = jsonb_set(payload, '{cambios}', cambios)
   where id = cid;
end
$$;

grant execute on function public.admin_withdraw_contribution(uuid, text) to authenticated;
grant execute on function public.admin_set_video_text_changes(uuid, jsonb) to authenticated;
