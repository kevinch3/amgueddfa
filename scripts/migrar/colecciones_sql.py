"""One-off (2026-11-27): writes supabase/migrations/20261127000001_colecciones.sql and
docs/renombre-rollback.sql from the latest definitions of the functions they change.

  python3 scripts/migrar/colecciones_sql.py   # from the repo root
"""
import re, json
from pathlib import Path
M = Path('supabase/migrations')
MIGRATION = '20261127000001_colecciones.sql'
files = sorted(f for f in M.glob('*.sql') if f.name < MIGRATION)

def latest(name):
    found = None
    for f in files:
        s = f.read_text()
        for m in re.finditer(rf'create (or replace )?function public\.{name}\b', s):
            end = s.index('\n$$;', m.start()) + 4
            found = s[m.start():end]
    assert found, name
    return found

def sub(body):
    body = body.replace('p_festival', 'p_coleccion').replace('festival_points', 'coleccion_points')
    body = re.sub(r'\bfestival\b', 'coleccion', body)
    body = body.replace("payload ->> 'category'", "payload ->> 'tipo'")
    body = re.sub(r'^create (or replace )?function', 'create function', body)
    return body

cols = json.loads(Path('src/data/colecciones.json').read_text())['colecciones']
out = []
w = out.append
w('''-- One vocabulary (docs/superpowers/specs/2026-11-27-reglas-de-datos-design.md, steps 4-5;
-- maintainer, 2026-11-27): the collection list becomes a table, `festival` becomes
-- `coleccion` everywhere, and payload keys `category` become `tipo` (a tag's
-- `festival` key, `coleccion`). Applied in one go with the site that uses the new
-- names (runbook: docs/renombre-runbook.md).

-- 1. The museum's collections (src/data/colecciones.json; a test keeps both in step).
create table public.colecciones (
  id text primary key check (id ~ '^[a-z][a-z0-9-]*$'),
  grupo text not null,
  ganadores_publicos boolean not null default false,
  texto_de_videos boolean not null default false
);
insert into public.colecciones (id, grupo, ganadores_publicos, texto_de_videos) values''')
w(',\n'.join(f"  ('{c['id']}', '{c['grupo']}', {str(c['ganadores_publicos']).lower()}, {str(c['texto_de_videos']).lower()})" for c in cols) + ';')
w('''alter table public.colecciones enable row level security;
create policy "colecciones: anyone reads" on public.colecciones for select using (true);
revoke all on public.colecciones from anon, authenticated;
grant select on public.colecciones to anon, authenticated;

-- 2. The fixed lists of festivals give way to the table.
do $$
declare r record;
begin
  for r in select conrelid::regclass as t, conname from pg_constraint
           where contype = 'c' and pg_get_constraintdef(oid) ~ 'festival'
             and conrelid in ('public.contributions'::regclass, 'public.badges'::regclass,
                              'public.editions'::regclass, 'public.transcriptions'::regclass) loop
    execute format('alter table %s drop constraint %I', r.t, r.conname);
  end loop;
end
$$;

alter table public.contributions rename column festival to coleccion;
alter table public.badges rename column festival to coleccion;
alter table public.editions rename column festival to coleccion;
alter table public.transcriptions rename column festival to coleccion;
alter table public.transcription_history rename column festival to coleccion;

alter table public.contributions add constraint contributions_coleccion_fkey foreign key (coleccion) references public.colecciones (id);
alter table public.badges add constraint badges_coleccion_fkey foreign key (coleccion) references public.colecciones (id);
alter table public.editions add constraint editions_coleccion_fkey foreign key (coleccion) references public.colecciones (id);
alter table public.transcriptions add constraint transcriptions_coleccion_fkey foreign key (coleccion) references public.colecciones (id);

-- Winners lists are public only for collections that publish them (was a check on two names).
create function public.check_ganadores_publicos() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'ganadores' and new.public
     and not exists (select 1 from public.colecciones where id = new.coleccion and ganadores_publicos) then
    -- Same name as the check it replaces: the admin maps it to its message (src/lib/curation.ts).
    raise exception 'transcriptions_private_winners' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger check_ganadores_publicos
  before insert or update on public.transcriptions
  for each row execute function public.check_ganadores_publicos();
revoke execute on function public.check_ganadores_publicos() from public, anon, authenticated;

-- 3. Views keep their grants; only the column names change.
alter view public.public_contributions rename column festival to coleccion;
alter view public.leaderboard rename column festival_points to coleccion_points;
alter view public.public_transcriptions rename column festival to coleccion;

-- 4. Stored payloads: an upload's or a tag's `category` is its `tipo`; a tag's `festival` its `coleccion`;
--    the same inside a report's proposed fix (`arreglo`).
update public.contributions
   set payload = (payload - 'category') || jsonb_build_object('tipo', payload -> 'category')
 where payload ? 'category';
update public.contributions
   set payload = (payload - 'festival') || jsonb_build_object('coleccion', payload -> 'festival')
 where payload ? 'festival';
update public.contributions
   set payload = jsonb_set(payload, '{arreglo}',
         ((payload -> 'arreglo') - 'category' - 'festival')
         || jsonb_strip_nulls(jsonb_build_object('tipo', payload -> 'arreglo' -> 'category',
                                                 'coleccion', payload -> 'arreglo' -> 'festival')))
 where jsonb_typeof(payload -> 'arreglo') = 'object' and (payload -> 'arreglo') ?| array['category', 'festival'];

-- 5. Functions that name the column, a payload key or a parameter (same bodies, new names).''')

renamed_params = {
  'admin_add_facts': ('(uuid, text, integer, jsonb)', ['authenticated']),
  'admin_correct_item': ('(text, text, integer, jsonb)', ['authenticated']),
  'admin_save_transcription': ('(text, text[], text, text, text, boolean)', ['authenticated']),
  'video_text_valid': ('(text, jsonb)', []),
}
same_sig = ['award_badges', 'approve_contribution', 'log_transcription', 'check_video_text', 'admin_set_video_text_changes']
for name, (sig, grants) in renamed_params.items():
    body = sub(latest(name))
    if name == 'admin_correct_item':
        body = body.replace("(k = 'category' and", "(k = 'tipo' and")
        body = body.replace("v #>> '{}' in ('chubut', 'juventud', 'mimosa', 'trevelin')", "v #>> '{}' in (select id from public.colecciones)")
    if name == 'video_text_valid':
        body = body.replace("if p_coleccion is null or p_coleccion not in ('chubut', 'trevelin') then",
                            "if p_coleccion is null or not exists (select 1 from public.colecciones where id = p_coleccion and texto_de_videos) then")
        body = body.replace('language plpgsql immutable', 'language plpgsql stable')
    w(f'\ndrop function public.{name}{sig};')
    w(body)
    w(f'revoke execute on function public.{name}{sig} from public, anon{"" if grants else ", authenticated"};')
    for g in grants:
        w(f'grant execute on function public.{name}{sig} to {g};')
for name in same_sig:
    body = sub(latest(name)).replace('create function', 'create or replace function', 1)
    w('\n' + body)
Path('supabase/migrations/20261127000001_colecciones.sql').write_text('\n'.join(out) + '\n')


# ---- rollback: the schema and rows as they were before this migration (docs/renombre-runbook.md)
rb = []
r = rb.append
r("""-- Rollback of 20261127000001_colecciones.sql: run only if the switch-over fails (docs/renombre-runbook.md).
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
 where jsonb_typeof(payload -> 'arreglo') = 'object' and (payload -> 'arreglo') ?| array['tipo', 'coleccion'];""")
for name, (sig, grants) in renamed_params.items():
    r(f'\ndrop function public.{name}{sig};')
    r(re.sub(r'^create (or replace )?function', 'create function', latest(name)))
    r(f'revoke execute on function public.{name}{sig} from public, anon{"" if grants else ", authenticated"};')
    for g in grants:
        r(f'grant execute on function public.{name}{sig} to {g};')
for name in same_sig:
    r('\n' + re.sub(r'^create (or replace )?function', 'create or replace function', latest(name)))
r('\ndrop table public.colecciones;')
Path('docs/renombre-rollback.sql').write_text('\n'.join(rb) + '\n')
