-- Live curated data (issue #27).
--
-- 1. admin_correct_item: an admin's correction of a catalog item (title,
--    category, year, festival, rights, caption, no_text, hidden) is an approved
--    tag, public at once through public_contributions. The site applies it with
--    one rule at build time and live (src/lib/tags.ts, scripts/catalog/overlay.py).
-- 2. transcriptions: the standardized transcriptions (programas and winners
--    lists), edited in the site by admins, with a history of every change.
--    src/data/transcripciones and src/data/ganadores become the export snapshot.

-- 1 -------------------------------------------------------------------------

create function public.admin_correct_item(
  p_item text,
  p_festival text,
  p_year integer,
  p_payload jsonb
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  k text;
  v jsonb;
  cid uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if coalesce(p_item, '') !~ '^[0-9a-f]{12}$' then
    raise exception 'invalid_value' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or p_payload = '{}'::jsonb then
    raise exception 'invalid_value' using errcode = 'P0001';
  end if;
  for k, v in select key, value from jsonb_each(p_payload) loop
    if not (
      (k = 'title' and jsonb_typeof(v) = 'string' and char_length(btrim(v #>> '{}')) between 1 and 300)
      or (k = 'category' and v #>> '{}' in ('programa', 'programa-del-dia', 'preliminares', 'bases', 'resultados', 'otros'))
      or (k = 'festival' and v #>> '{}' in ('chubut', 'juventud', 'mimosa', 'trevelin'))
      or (k = 'year' and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between 1850 and 2200
          and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric))
      or (k in ('rights', 'caption') and jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= 2000)
      or (k in ('no_text', 'hidden') and jsonb_typeof(v) = 'boolean')
    ) then
      raise exception 'invalid_value' using errcode = 'P0001', detail = k;
    end if;
  end loop;

  -- Approved on insert, no points: an admin's own curation is not a contribution to score.
  insert into public.contributions (user_id, type, festival, year, item_id, payload, status,
                                    reviewer_id, reviewed_at, points_awarded)
    values (auth.uid(), 'tag', p_festival, p_year, p_item, p_payload, 'approved',
            auth.uid(), now(), 0)
    returning id into cid;
  return cid;
end
$$;

revoke execute on function public.admin_correct_item(text, text, integer, jsonb) from public, anon;
grant execute on function public.admin_correct_item(text, text, integer, jsonb) to authenticated;

-- 2 -------------------------------------------------------------------------

create table public.transcriptions (
  -- The document's first catalog item; the file name of its snapshot.
  id text primary key check (id ~ '^[0-9a-f]{12}$'),
  -- Every catalog item the document covers, id first.
  items text[] not null check (cardinality(items) between 1 and 200 and items[1] = id),
  kind text not null check (kind in ('programa', 'ganadores')),
  festival text check (festival in ('chubut', 'juventud', 'mimosa', 'trevelin')),
  text text not null check (char_length(text) between 1 and 100000),
  public boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- Winners are published for whole adult festivals only (src/lib/ganadores.ts
  -- PUBLIC_WINNERS); Mimosa and Juventud lists name children and stay private.
  constraint transcriptions_private_winners
    check (kind <> 'ganadores' or not public or coalesce(festival in ('chubut', 'trevelin'), false))
);
create index transcriptions_items on public.transcriptions using gin (items);

create table public.transcription_history (
  id bigint generated always as identity primary key,
  transcription_id text not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  items text[] not null,
  kind text not null,
  festival text,
  text text not null,
  public boolean not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index transcription_history_doc on public.transcription_history (transcription_id, changed_at desc);

-- Every version, kept: the row as it is after an insert or update, and as it
-- was before a delete.
create function public.log_transcription() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  r public.transcriptions;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  insert into public.transcription_history (transcription_id, op, items, kind, festival, text, public, changed_by)
    values (r.id, lower(tg_op), r.items, r.kind, r.festival, r.text, r.public, auth.uid());
  return null;
end
$$;
revoke execute on function public.log_transcription() from public, anon, authenticated;

create trigger log_transcription
  after insert or update or delete on public.transcriptions
  for each row execute function public.log_transcription();

alter table public.transcriptions enable row level security;
alter table public.transcription_history enable row level security;
revoke all on public.transcriptions, public.transcription_history from anon, authenticated;

-- Admins read everything (private lists included); writes only through the functions below.
grant select on public.transcriptions, public.transcription_history to authenticated;
create policy transcriptions_select_admin on public.transcriptions
  for select to authenticated using (public.is_admin());
create policy transcription_history_select_admin on public.transcription_history
  for select to authenticated using (public.is_admin());

-- What everyone reads: public documents, without who edited them.
create view public.public_transcriptions as
  select id, items, kind, festival, text, updated_at
  from public.transcriptions
  where public;
revoke all on public.public_transcriptions from anon, authenticated;
grant select on public.public_transcriptions to anon, authenticated;

-- Create or replace one document. An item belongs to one document of a kind,
-- so a list that overlaps another document of that kind is refused.
create function public.admin_save_transcription(
  p_id text,
  p_items text[],
  p_kind text,
  p_festival text,
  p_text text,
  p_public boolean
) returns timestamptz
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  ids text[];
  other text;
  t timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  -- the id first, then the other items in the order given, once each
  select array_agg(x order by ord) into ids
    from (select x, min(o) as ord
            from unnest(array[p_id] || coalesce(p_items, '{}')) with ordinality as u(x, o)
           where x is not null and btrim(x) <> ''
           group by x) s;
  if exists (select 1 from unnest(ids) x where x !~ '^[0-9a-f]{12}$') then
    raise exception 'invalid_value' using errcode = 'P0001', detail = 'items';
  end if;
  if char_length(btrim(coalesce(p_text, ''))) = 0 then
    raise exception 'invalid_value' using errcode = 'P0001', detail = 'text';
  end if;

  perform pg_advisory_xact_lock(hashtext('transcriptions:' || coalesce(p_kind, '')));
  select id into other from public.transcriptions
   where kind = p_kind and id <> p_id and items && ids
   limit 1;
  if other is not null then
    raise exception 'item_in_other_document' using errcode = 'P0001', detail = other;
  end if;

  insert into public.transcriptions (id, items, kind, festival, text, public, updated_by, updated_at)
    values (p_id, ids, p_kind, p_festival, p_text, coalesce(p_public, true), auth.uid(), now())
    on conflict (id) do update
      set items = excluded.items, kind = excluded.kind, festival = excluded.festival,
          text = excluded.text, public = excluded.public,
          updated_by = excluded.updated_by, updated_at = excluded.updated_at
    returning updated_at into t;
  return t;
end
$$;

create function public.admin_delete_transcription(p_id text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  delete from public.transcriptions where id = p_id;
end
$$;

revoke execute on function public.admin_save_transcription(text, text[], text, text, text, boolean) from public, anon;
revoke execute on function public.admin_delete_transcription(text) from public, anon;
grant execute on function public.admin_save_transcription(text, text[], text, text, text, boolean) to authenticated;
grant execute on function public.admin_delete_transcription(text) to authenticated;
