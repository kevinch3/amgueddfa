-- Row-level security, grants and the public read views.
-- Supabase grants all on public tables to anon/authenticated by default, so
-- start from nothing and grant back only what each role needs.

create function public.is_admin() returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

alter table public.profiles enable row level security;
alter table public.contributions enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.editions enable row level security;
alter table public.released_items enable row level security;

revoke all on public.profiles, public.contributions, public.badges, public.user_badges,
  public.editions, public.released_items from anon, authenticated;

-- profiles: own full row or admin; everyone else goes through public_profiles.
-- No direct insert/update/delete: set_display_name(), set_role() and the signup trigger.
grant select on public.profiles to authenticated;
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- contributions: insert own pending rows (only the user-supplied columns);
-- read own, approved, or everything when admin. Status changes only through functions.
grant select on public.contributions to authenticated;
grant insert (user_id, type, festival, year, item_id, payload, status)
  on public.contributions to authenticated;
create policy contributions_insert_own_pending on public.contributions
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy contributions_select on public.contributions
  for select to authenticated
  using (user_id = auth.uid() or status = 'approved' or public.is_admin());

-- reference / public data
grant select on public.badges to anon, authenticated;
create policy badges_select_all on public.badges for select using (true);

grant select on public.editions to anon, authenticated;
create policy editions_select_all on public.editions for select using (true);

grant select on public.released_items to anon, authenticated;
create policy released_items_select_all on public.released_items for select using (true);

grant select on public.user_badges to authenticated;
create policy user_badges_select_own_or_admin on public.user_badges
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Public views. They run with the owner's rights (bypassing RLS on purpose)
-- and expose only display names, never user ids or emails.
create view public.public_profiles as
  select display_name, points
  from public.profiles
  where display_name is not null;

create view public.public_contributions as
  select c.id,
         c.type,
         c.festival,
         c.year,
         c.item_id,
         case when c.type = 'upload' then c.payload - 'storage_path' else c.payload end as payload,
         c.created_at,
         c.reviewed_at,
         p.display_name
  from public.contributions c
  join public.profiles p on p.id = c.user_id
  where c.status = 'approved';

create view public.public_user_badges as
  select p.display_name, ub.badge, ub.awarded_at
  from public.user_badges ub
  join public.profiles p on p.id = ub.user_id
  where p.display_name is not null;

create view public.leaderboard as
  select p.display_name,
         p.points,
         coalesce(
           (select jsonb_object_agg(x.festival, x.pts)
              from (select c.festival, sum(c.points_awarded)::int as pts
                      from public.contributions c
                     where c.user_id = p.id and c.status = 'approved' and c.festival is not null
                     group by c.festival) x),
           '{}'::jsonb) as festival_points
  from public.profiles p
  where p.display_name is not null and p.points > 0
  order by p.points desc, p.display_name;

revoke all on public.public_profiles, public.public_contributions, public.public_user_badges,
  public.leaderboard from anon, authenticated;
grant select on public.public_profiles, public.public_contributions, public.public_user_badges,
  public.leaderboard to anon, authenticated;
