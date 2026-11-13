-- Amgueddfa Eisteddfod y Wladfa: core schema.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 3 and 30)
);
create unique index profiles_display_name_ci on public.profiles (lower(display_name));

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('upload', 'fact', 'tag', 'transcription', 'memory')),
  festival text check (festival in ('chubut', 'juventud', 'mimosa', 'trevelin')),
  year integer check (year between 1850 and 2200),
  item_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid references public.profiles (id) on delete set null,
  review_note text,
  confirm_count integer not null default 0, -- reserved for future peer review
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index contributions_user_created on public.contributions (user_id, created_at);
create index contributions_status_created on public.contributions (status, created_at);
create index contributions_edition on public.contributions (festival, year) where status = 'approved';

create table public.badges (
  slug text primary key,
  festival text check (festival in ('chubut', 'juventud', 'mimosa', 'trevelin')),
  sort integer not null default 0
);
insert into public.badges (slug, festival, sort) values
  ('primer-aporte', null, 10),
  ('archivista-chubut', 'chubut', 20),
  ('archivista-juventud', 'juventud', 21),
  ('archivista-mimosa', 'mimosa', 22),
  ('archivista-trevelin', 'trevelin', 23),
  ('cazador-de-programas', null, 30),
  ('bardo', null, 40),
  ('ojo-de-lince', null, 50);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null references public.badges (slug),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge)
);

create table public.editions (
  festival text not null check (festival in ('chubut', 'juventud', 'mimosa', 'trevelin')),
  year integer not null,
  status text not null default 'unknown' check (status in ('unknown', 'held', 'not_held')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (festival, year)
);

create table public.released_items (
  item_id text primary key,
  released_by uuid references public.profiles (id) on delete set null,
  released_at timestamptz not null default now()
);
