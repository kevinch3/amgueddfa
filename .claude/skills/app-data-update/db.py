"""Run SQL against the live Supabase database through the Management API.

  python3 -I .claude/skills/app-data-update/db.py query "select …"         # read-only
  python3 -I .claude/skills/app-data-update/db.py exec  file.sql            # writes, as the admin
  python3 -I .claude/skills/app-data-update/db.py facts batch.json [--dry-run]

`exec` wraps the file in one `do $amg$ … $amg$` block (atomic) whose first line sets
the JWT claims to the admin, so is_admin(), auth.uid() and reviewer_id work as
in the admin panel. `facts` turns a batch file into admin_add_facts calls:

  {"contributor": "<profile uuid>", "festival": "chubut",
   "fuente": "Meirion Griffiths (sin confirmar)",          # optional, on every fact
   "years": {"1945": [["venue", "Galpón del ferrocarril, Dolavon"], ["other", "Ganador: …"]]}}

A row may carry its own fuente as a third element, which wins over the batch one, so facts
from several sources (a video moment each, a clipping) still share one lote:
   ["start_date", "2019-10-18", "Video del archivo, cartel (0:05): https://www.youtube.com/watch?v=…&t=5s"]

Run from the repo root (reads .env there). Never prints secrets.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ADMIN = '347c144e-6c6e-4d6a-9bf9-14505a624a9d'  # Kevin Roberts


def env() -> dict[str, str]:
    out = {}
    for line in Path('.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"\'')
    return out


def run(sql: str, read_only: bool) -> object:
    e = env()
    ref = e['PUBLIC_SUPABASE_URL'].split('//', 1)[1].split('.', 1)[0]
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{ref}/database/query',
        data=json.dumps({'query': sql, 'read_only': read_only}).encode(),
        headers={'Authorization': f"Bearer {e['SUPABASE_ACCESS_TOKEN']}",
                 'Content-Type': 'application/json', 'User-Agent': 'amgueddfa-cli'},
        method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b'[]')
    except urllib.error.HTTPError as err:
        sys.exit(f'HTTP {err.code}: {err.read().decode()[:2000]}')


def as_admin(body: str) -> str:
    claims = json.dumps({'sub': ADMIN, 'role': 'authenticated'})
    return f"do $amg$ begin\nperform set_config('request.jwt.claims', '{claims}', true);\n{body}\nend $amg$;"


def lit(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def facts_sql(batch: dict) -> str:
    lote = str(uuid.uuid4())  # one batch = one lote, as the "Cargar datos" tab does
    lines = []
    for year, rows in batch['years'].items():
        facts = []
        for row in rows:
            field, value = row[0], row[1]
            f = {'field': field, 'lote': lote}
            if field == 'competencia':
                f.update(value)  # {"numero": …, "descripcion": …, "categoria"?, "idioma"?}
            else:
                f['value'] = value
            fuente = row[2] if len(row) > 2 and row[2] else batch.get('fuente')
            if fuente:
                f['fuente'] = fuente
            facts.append(f)
        lines.append(f"perform public.admin_add_facts({lit(batch['contributor'])}, {lit(batch['festival'])}, "
                     f"{int(year)}, {lit(json.dumps(facts, ensure_ascii=False))}::jsonb);")
    return as_admin('\n'.join(lines))


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        sys.exit(__doc__)
    cmd, arg = argv[0], argv[1]
    if cmd == 'query':
        print(json.dumps(run(arg, True), ensure_ascii=False, indent=1))
    elif cmd == 'exec':
        print(json.dumps(run(as_admin(Path(arg).read_text()), False), ensure_ascii=False))
    elif cmd == 'facts':
        sql = facts_sql(json.loads(Path(arg).read_text()))
        if '--dry-run' in argv:
            print(sql)
        else:
            print(json.dumps(run(sql, False), ensure_ascii=False))
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
