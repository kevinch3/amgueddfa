-- Sign-ins per hour, for the admin "Estadísticas" tab.
-- Only the count is kept: no user id, no email, nothing that says who signed in.
-- Counting starts with this migration (auth.users only holds each user's latest sign-in).

create table public.signin_hours (
  hour timestamptz primary key,
  n integer not null default 0
);
alter table public.signin_hours enable row level security;
revoke all on table public.signin_hours from public, anon, authenticated;

-- auth.users.last_sign_in_at changes on every real sign-in (not on token refresh).
create function public.count_signin() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.last_sign_in_at is null or new.last_sign_in_at is not distinct from old.last_sign_in_at then
    return new;
  end if;
  insert into public.signin_hours (hour, n)
  values (date_trunc('hour', new.last_sign_in_at), 1)
  on conflict (hour) do update set n = public.signin_hours.n + 1;
  return new;
end
$$;

create trigger count_signin
  after update of last_sign_in_at on auth.users
  for each row execute function public.count_signin();

revoke execute on function public.count_signin() from public, anon, authenticated;

-- Hourly counts for the last `days` days (1–366), admins only.
create function public.admin_signin_stats(days int default 90)
returns table (hour timestamptz, n int)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  d int := least(greatest(coalesce(days, 90), 1), 366);
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  return query
    select s.hour, s.n
    from public.signin_hours s
    where s.hour >= now() - make_interval(days => d)
    order by s.hour;
end
$$;

revoke execute on function public.admin_signin_stats(int) from public, anon;
grant execute on function public.admin_signin_stats(int) to authenticated;
