-- Rollback of 20261127000001_colecciones.sql: run only if the switch-over fails (docs/renombre-runbook.md).
-- Restores the old names, checks, payload keys and function definitions; drops the collections table.
drop trigger check_ganadores_publicos on public.transcriptions;
drop function public.check_ganadores_publicos();
alter table public.contributions drop constraint contributions_coleccion_fkey;
alter table public.badges drop constraint badges_coleccion_fkey;
alter table public.editions drop constraint editions_coleccion_fkey;
alter table public.transcriptions drop constraint transcriptions_coleccion_fkey;
alter table public.contributions rename column coleccion to festival;
alter table public.badges rename column coleccion to festival;
alter table public.editions rename column coleccion to festival;
alter table public.transcriptions rename column coleccion to festival;
alter table public.transcription_history rename column coleccion to festival;
alter table public.contributions add check (festival in ('chubut', 'juventud', 'mimosa', 'trevelin'));
alter table public.badges add check (festival in ('chubut', 'juventud', 'mimosa', 'trevelin'));
alter table public.editions add check (festival in ('chubut', 'juventud', 'mimosa', 'trevelin'));
alter table public.transcriptions add check (festival in ('chubut', 'juventud', 'mimosa', 'trevelin'));
alter table public.transcriptions add constraint transcriptions_private_winners
  check (kind <> 'ganadores' or not public or coalesce(festival in ('chubut', 'trevelin'), false));
alter view public.public_contributions rename column coleccion to festival;
alter view public.leaderboard rename column coleccion_points to festival_points;
alter view public.public_transcriptions rename column coleccion to festival;
update public.contributions
   set payload = (payload - 'tipo') || jsonb_build_object('category', payload -> 'tipo')
 where payload ? 'tipo';
update public.contributions
   set payload = (payload - 'coleccion') || jsonb_build_object('festival', payload -> 'coleccion')
 where payload ? 'coleccion';
update public.contributions
   set payload = jsonb_set(payload, '{arreglo}',
         ((payload -> 'arreglo') - 'tipo' - 'coleccion')
         || jsonb_strip_nulls(jsonb_build_object('category', payload -> 'arreglo' -> 'tipo',
                                                 'festival', payload -> 'arreglo' -> 'coleccion')))
 where jsonb_typeof(payload -> 'arreglo') = 'object' and (payload -> 'arreglo') ?| array['tipo', 'coleccion'];

drop function public.admin_add_facts(uuid, text, integer, jsonb);
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
  c public.contributions;
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
      returning * into c;
    select * into c from public.contributions where id = c.id;
    if c.status = 'approved' then
      total := total + coalesce(c.points_awarded, 0);
    else
      total := total + public.approve_contribution(c.id, false, null);
    end if;
  end loop;
  return total;
end
$$;
revoke execute on function public.admin_add_facts(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.admin_add_facts(uuid, text, integer, jsonb) to authenticated;

drop function public.admin_correct_item(text, text, integer, jsonb);
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

drop function public.admin_save_transcription(text, text[], text, text, text, boolean);
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
revoke execute on function public.admin_save_transcription(text, text[], text, text, text, boolean) from public, anon;
grant execute on function public.admin_save_transcription(text, text[], text, text, text, boolean) to authenticated;

drop function public.video_text_valid(text, jsonb);
create function public.video_text_valid(p_festival text, p jsonb)
returns boolean
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  c jsonb;
  linea boolean;
begin
  -- One test per IF: SQL does not promise to evaluate OR left to right, and a cast or a length must not see a wrong type.
  if p_festival is null or p_festival not in ('chubut', 'trevelin') then
    return false;
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'video') is distinct from 'object' then
    return false;
  end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('video', 'base', 'cambios')) then
    return false;
  end if;
  if exists (select 1 from jsonb_object_keys(p -> 'video') k where k not in ('id', 'title')) then
    return false;
  end if;
  if jsonb_typeof(p -> 'video' -> 'id') is distinct from 'string' then
    return false;
  end if;
  if (p -> 'video' ->> 'id') !~ '^[A-Za-z0-9_-]{6,20}$' then
    return false;
  end if;
  if p -> 'video' ? 'title' and jsonb_typeof(p -> 'video' -> 'title') <> 'string' then
    return false;
  end if;
  if char_length(p -> 'video' ->> 'title') > 300 then
    return false;
  end if;
  if p ? 'base' and jsonb_typeof(p -> 'base') <> 'string' then
    return false;
  end if;
  if char_length(p ->> 'base') > 40 then
    return false;
  end if;
  if jsonb_typeof(p -> 'cambios') is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(p -> 'cambios') not between 1 and 200 then
    return false;
  end if;
  for c in select value from jsonb_array_elements(p -> 'cambios') loop
    if jsonb_typeof(c) <> 'object' then
      return false;
    end if;
    if exists (select 1 from jsonb_object_keys(c) k where k not in ('t', 'antes', 'texto', 'idioma', 'quitar')) then
      return false;
    end if;
    if jsonb_typeof(c -> 't') is distinct from 'number' then
      return false;
    end if;
    if (c ->> 't')::numeric < 0 then
      return false;
    end if;
    linea := c ? 'antes';
    if linea then
      if jsonb_typeof(c -> 'antes') <> 'string' then
        return false;
      end if;
      if public.js_trim(c ->> 'antes') = '' or char_length(c ->> 'antes') > 2000 then
        return false;
      end if;
    end if;
    if c ? 'texto' then
      if jsonb_typeof(c -> 'texto') <> 'string' then
        return false;
      end if;
      if public.js_trim(c ->> 'texto') = '' or char_length(c ->> 'texto') > 500 then
        return false;
      end if;
    end if;
    if c ? 'idioma' and (jsonb_typeof(c -> 'idioma') <> 'string' or (c ->> 'idioma') not in ('es', 'cy')) then
      return false;
    end if;
    if c ? 'quitar' and jsonb_typeof(c -> 'quitar') <> 'boolean' then
      return false;
    end if;
    if (c -> 'quitar') = 'true'::jsonb then
      if not linea then
        return false; -- a removal needs the line it removes
      end if;
    elsif not (c ? 'texto' or (linea and c ? 'idioma')) then
      return false; -- changes nothing (an add needs words)
    end if;
  end loop;
  -- Every change is an object with a number `t` by now, so the cast is safe.
  if exists (
    select 1 from jsonb_array_elements(p -> 'cambios') x
     group by (x ->> 't')::numeric, x -> 'antes'
    having count(*) > 1
  ) then
    return false; -- two changes to the same line
  end if;
  return true;
end
$$;
revoke execute on function public.video_text_valid(text, jsonb) from public, anon, authenticated;

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
  -- A partial approval stores the payload with the kept changes: it must still be a valid correction.
  if c.type = 'video_text'
     and not public.video_text_valid(c.festival, c.payload || coalesce(payload_override, '{}'::jsonb)) then
    raise exception 'invalid' using errcode = 'P0001';
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

create or replace function public.log_transcription() returns trigger
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

create or replace function public.check_video_text() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.video_text_valid(new.festival, new.payload) then
    raise exception 'invalid' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create or replace function public.admin_set_video_text_changes(cid uuid, cambios jsonb)
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

  -- The same check as a new contribution: the row with these changes must be one validation could have built.
  if cambios is null or not public.video_text_valid(c.festival, jsonb_set(c.payload, '{cambios}', cambios)) then
    raise exception 'invalid' using errcode = 'P0001';
  end if;

  update public.contributions
     set payload = jsonb_set(payload, '{cambios}', cambios)
   where id = cid;
end
$$;

drop table public.colecciones;
