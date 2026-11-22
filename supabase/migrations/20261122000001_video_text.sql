-- Video transcript corrections: a collaborator proposes line-by-line changes
-- (payload.cambios); the maintainer approves all or some of them. 2 points per
-- change kept, at most 30. An approved row can later be withdrawn or have its
-- changes re-anchored by the maintainer. Every stored payload is checked by
-- video_text_valid, the database's copy of validateVideoText (src/lib/contrib.ts).

alter table public.contributions drop constraint contributions_type_check;
alter table public.contributions add constraint contributions_type_check
  check (type in ('upload', 'fact', 'tag', 'transcription', 'memory', 'report', 'note', 'video_text'));

-- What JavaScript's String.prototype.trim() takes off, so a blank here is a blank in the browser (validateVideoText trims
-- each line and its words; the admin's form trims a withdrawal's reason): tabs, line breaks (U+2028 and U+2029 too),
-- every kind of space (Unicode Zs, from U+0020 to the ideographic U+3000) and the BOM. trim() keeps a zero-width space
-- (U+200B), a joiner or a soft hyphen, and so does this.
create function public.js_trim(s text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select btrim(s, E'\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF')
$$;

-- Whether a video_text payload is one validateVideoText (src/lib/contrib.ts) could have built, for a video of that
-- festival: Chubut or Trevelin; only the keys it builds (the payload's video, base and cambios; the video's id and title;
-- a change's t, antes, texto, idioma and quitar), since approval publishes the payload as it is, and submit() adds
-- nothing to a transcript correction (a lote groups facts sent together; a storage_path is an upload's); payload.video.id
-- a video id; 1 to 200 changes, each an object with `t` a number not below 0; `antes` (the line it targets) a non-blank
-- string of at most 2,000 characters; `texto` a non-blank string of at most 500; `idioma` es or cy; `quitar` a boolean;
-- each change doing something (an add, with no `antes`, writes words; a removal needs its line); and no two changes to
-- the same line (the same `t` and `antes`; two adds at the same `t`), as validate() refuses (video_repetido). The trigger
-- below keeps any other payload out of the table (an insert crafted through the API never reaches the queue), and the
-- two admin paths that change `cambios` check what they would store.
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

-- No video_text row is stored (inserted, approved, re-anchored) unless video_text_valid accepts it.
create function public.check_video_text() returns trigger
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

create trigger check_video_text
  before insert or update of type, festival, payload on public.contributions
  for each row when (new.type = 'video_text')
  execute function public.check_video_text();

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
  -- Its author reads the reason on their profile: there is always one.
  if coalesce(btrim(note, E' \t\n\r\u000B\u000C\u00A0'), '') = '' then
    raise exception 'note_required' using errcode = 'P0001';
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

-- Execute rights, as in 20261113000003_functions.sql: the checks for nobody (the trigger and the definer functions
-- run them as their owner); the admin RPCs for signed-in users only (each checks for an admin itself).
revoke execute on function public.js_trim(text) from public, anon, authenticated;
revoke execute on function public.video_text_valid(text, jsonb) from public, anon, authenticated;
revoke execute on function public.check_video_text() from public, anon, authenticated;
revoke execute on function public.admin_withdraw_contribution(uuid, text) from public, anon;
revoke execute on function public.admin_set_video_text_changes(uuid, jsonb) from public, anon;
grant execute on function public.admin_withdraw_contribution(uuid, text) to authenticated;
grant execute on function public.admin_set_video_text_changes(uuid, jsonb) to authenticated;
