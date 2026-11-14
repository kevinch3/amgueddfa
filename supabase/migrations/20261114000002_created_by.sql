-- Who actually inserted a row. Facts an admin publishes for someone else
-- (admin_add_facts) have created_by = the admin, so they no longer use up the
-- credited person's 30-per-24h limit. Filled from the session; contributors
-- cannot set it (it is not in their column-level insert grant).
alter table public.contributions add column created_by uuid default auth.uid();

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
         and (created_by is null or created_by = new.user_id)
         and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'daily_limit' using errcode = 'P0001';
  end if;
  return new;
end
$$;

revoke execute on function public.limit_daily() from public, anon, authenticated;
