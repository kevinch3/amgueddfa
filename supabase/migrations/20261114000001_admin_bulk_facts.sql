-- Bulk facts: admins publish several facts at once, credited to anyone, and
-- are not held to the 30-per-24h limit (they transcribe whole sources).

-- Same limit as before, except for admins.
create or replace function public.limit_daily() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() then
    return new;
  end if;
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

-- Publish facts for `target` in one transaction: each is inserted as a pending
-- fact and approved through approve_contribution, so points, badges and the
-- edition status behave exactly as a normal approval. Returns total points.
create function public.admin_add_facts(
  target uuid,
  p_festival text,
  p_year integer,
  facts jsonb
) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  f jsonb;
  cid uuid;
  total integer := 0;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if p_festival is null or p_year is null then
    raise exception 'edition_required' using errcode = 'P0001';
  end if;
  if jsonb_typeof(facts) <> 'array' or jsonb_array_length(facts) < 1 or jsonb_array_length(facts) > 50 then
    raise exception 'invalid_value' using errcode = 'P0001';
  end if;

  for f in select value from jsonb_array_elements(facts) loop
    if jsonb_typeof(f) <> 'object' or coalesce(f ->> 'field', '') = '' then
      raise exception 'invalid_value' using errcode = 'P0001';
    end if;
    insert into public.contributions (user_id, type, festival, year, item_id, payload, status)
      values (target, 'fact', p_festival, p_year, null, f, 'pending')
      returning id into cid;
    total := total + public.approve_contribution(cid, false, null);
  end loop;
  return total;
end
$$;

revoke execute on function public.limit_daily() from public, anon, authenticated;
revoke execute on function public.admin_add_facts(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.admin_add_facts(uuid, text, integer, jsonb) to authenticated;
