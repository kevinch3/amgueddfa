-- Where a contributor is: a public country and a private timezone, both optional.

-- ISO 3166-1 alpha-2 ("AR"), or a GB nation ("GB-WLS") so Welsh contributors can say Gales.
alter table public.profiles
  add column country text
    constraint profiles_country_code check (country is null or country ~ '^[A-Z]{2}(-[A-Z]{3})?$'),
  add column timezone text
    constraint profiles_timezone_length check (timezone is null or char_length(timezone) <= 64);

-- Set (or clear, with null / '') the caller's country and timezone.
create function public.set_profile_place(country text, timezone text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  c text := nullif(upper(btrim(coalesce(country, ''))), '');
  tz text := nullif(btrim(coalesce(timezone, '')), '');
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if c is not null and c !~ '^[A-Z]{2}(-[A-Z]{3})?$' then
    raise exception 'invalid_country' using errcode = 'P0001';
  end if;
  if tz is not null and (char_length(tz) > 64
      or not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = tz)) then
    raise exception 'invalid_timezone' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, country, timezone) values (uid, c, tz)
    on conflict (id) do update set country = excluded.country, timezone = excluded.timezone;
end
$$;

revoke execute on function public.set_profile_place(text, text) from public, anon;
grant execute on function public.set_profile_place(text, text) to authenticated;

-- The country is public; the timezone never leaves the profiles table.
-- New columns go last so create-or-replace keeps the views (and their grants).
create or replace view public.public_profiles as
  select display_name, points, country
  from public.profiles
  where display_name is not null;

create or replace view public.leaderboard as
  select p.display_name,
         p.points,
         coalesce(
           (select jsonb_object_agg(x.festival, x.pts)
              from (select c.festival, sum(c.points_awarded)::int as pts
                      from public.contributions c
                     where c.user_id = p.id and c.status = 'approved' and c.festival is not null
                     group by c.festival) x),
           '{}'::jsonb) as festival_points,
         p.country
  from public.profiles p
  where p.display_name is not null and p.points > 0
  order by p.points desc, p.display_name;
