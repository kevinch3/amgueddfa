-- Functions callable through supabase.rpc, plus triggers.
-- All security definer with a pinned search_path; admin checks happen inside.

-- New auth user -> empty profile row.
create function public.handle_new_user() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Daily cap: at most 30 contributions per user in a rolling 24 h.
create function public.limit_daily() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- serialise concurrent inserts by the same user so the count is exact
  perform pg_advisory_xact_lock(hashtext('limit_daily:' || new.user_id::text));
  if (select count(*) from public.contributions
       where user_id = new.user_id
         and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'daily_limit' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger limit_daily
  before insert on public.contributions
  for each row execute function public.limit_daily();

-- Display name: 3-30 chars, unique case-insensitively.
create function public.set_display_name(name text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  clean text := btrim(name);
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if clean is null or char_length(clean) < 3 or char_length(clean) > 30 then
    raise exception 'invalid_display_name' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles
              where lower(display_name) = lower(clean) and id <> uid) then
    raise exception 'display_name_taken' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, display_name) values (uid, clean)
    on conflict (id) do update set display_name = excluded.display_name;
exception
  when unique_violation then
    raise exception 'display_name_taken' using errcode = 'P0001';
end
$$;

-- Insert any badges the user has newly earned. Internal helper.
create function public.award_badges(uid uuid, c public.contributions, fills_gap boolean)
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
       where user_id = uid and status = 'approved' and type = 'tag') >= 50 then
    insert into public.user_badges (user_id, badge) values (uid, 'ojo-de-lince')
      on conflict do nothing;
  end if;
end
$$;

-- Approve a pending contribution: status, points (exactly once), badges, editions.
create function public.approve_contribution(
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

create function public.reject_contribution(cid uuid, note text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  st text;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  select status into st from public.contributions where id = cid for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if st <> 'pending' then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;
  update public.contributions
     set status = 'rejected',
         reviewer_id = auth.uid(),
         reviewed_at = now(),
         review_note = note
   where id = cid;
end
$$;

-- Mark a restricted item as released. The admin browser copies the derivatives
-- from the `restricted` bucket to `media`.
create function public.release_item(item_id text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  insert into public.released_items (item_id, released_by)
    values (release_item.item_id, auth.uid())
    on conflict on constraint released_items_pkey do nothing;
end
$$;

create function public.set_role(uid uuid, role text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if set_role.role not in ('user', 'admin') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;
  update public.profiles p set role = set_role.role where p.id = set_role.uid;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end
$$;

-- Execute rights: internal helpers for nobody; the rest for signed-in users only.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.limit_daily() from public, anon, authenticated;
revoke execute on function public.award_badges(uuid, public.contributions, boolean)
  from public, anon, authenticated;

revoke execute on function public.set_display_name(text) from public, anon;
revoke execute on function public.approve_contribution(uuid, boolean, jsonb) from public, anon;
revoke execute on function public.reject_contribution(uuid, text) from public, anon;
revoke execute on function public.release_item(text) from public, anon;
revoke execute on function public.set_role(uuid, text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;
grant execute on function public.approve_contribution(uuid, boolean, jsonb) to authenticated;
grant execute on function public.reject_contribution(uuid, text) to authenticated;
grant execute on function public.release_item(text) to authenticated;
grant execute on function public.set_role(uuid, text) to authenticated;
