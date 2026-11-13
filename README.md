# Amgueddfa Eisteddfod y Wladfa

Museo digital de los programas, bases, preliminares y resultados de los eisteddfodau de
la Patagonia galesa: Eisteddfod del Chubut, de la Juventud, Mimosa y de Trevelin.

El sitio muestra, festival por festival y año por año, qué material tenemos y qué nos
falta. Cualquiera puede mirar; quien inicia sesión con su correo puede aportar: subir un
programa que falta, sumar un dato (jurados, ganadores, sede), transcribir, corregir
etiquetas o dejar un recuerdo. Cada aporte pasa por revisión antes de publicarse.

- Sitio estático hecho con [Astro](https://astro.build), publicado en GitHub Pages en
  `https://amgueddfa.kevinroberts.ar/`.
- Datos en vivo (sesión, aportes, puntos, insignias) en [Supabase](https://supabase.com).
  Si Supabase no responde, las páginas siguen mostrando el contenido estático.

## Estructura

| Ruta | Qué hay |
| --- | --- |
| `scripts/build_catalog.py` | Arma el catálogo desde el archivo (corre solo en tu máquina). |
| `src/data/catalog.json` | Catálogo generado, versionado en git. |
| `public/media/<id>/` | Miniaturas y páginas en WebP (nunca de ítems restringidos). |
| `data/approved/*.json` | Copia de los aportes aprobados y del estado de las ediciones. |
| `data/restricted_extra.txt` | Ids que se restringen además de `resultados`. |
| `supabase/migrations/` | Esquema, RLS y funciones de la base. |
| `.github/workflows/` | `deploy`, `keepalive` y `export`. |

## Desarrollo

Necesitás Node 22, Python 3 con Pillow y `pdftoppm` (poppler-utils). `soffice` es
opcional: si está, los documentos de Office se convierten a páginas.

```sh
npm ci
npm run dev                         # http://localhost:4321/
npx vitest run                      # tests JS (incluye el build estático y la base con PGlite)
python3 -m pytest tests -q          # tests del catálogo
```

Para los datos en vivo creá un `.env` (nunca se commitea):

```sh
PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<clave anon>
SUPABASE_SERVICE_ROLE_KEY=<clave service_role>   # solo para scripts locales
```

## Reconstruir el catálogo

El archivo vive en la carpeta padre del repo (`../`) y no se sube nunca. Solo esta
máquina lo tiene, así que el catálogo se arma acá y se commitea; CI solo construye y
publica el sitio.

```sh
python3 -m scripts.build_catalog              # escanea ../, escribe src/data/catalog.json y public/media/
python3 -m scripts.build_catalog --only <id>  # regenera las derivadas de un ítem
python3 -m scripts.push_restricted            # sube .restricted/ al bucket privado (usa .env)
npx vitest run tests-js/build.test.ts         # chequea el build y que no se filtren datos personales
```

Después revisá que `public/media/` siga por debajo de 100 MB y commiteá el resultado.

Los ítems restringidos (categoría `resultados` y los ids de `data/restricted_extra.txt`)
dejan sus derivadas en `.restricted/`, que está en `.gitignore`. Un admin los puede
liberar desde `/admin`.

### Cuarentena

El archivo tiene una carpeta `../.cuarentena/` con imágenes que se descargaron mal
(todas iguales a un mismo flyer). Como empieza con punto, el escaneo la ignora. Las 98
ya se volvieron a bajar desde su `source_url` y están en su carpeta; la cuarentena
queda solo como registro (`../.cuarentena/LEEME_refetch_list.txt`).

## Respaldar los aportes en el archivo

Los originales que sube la gente quedan solo en el bucket privado `uploads` de
Supabase. Para que no se pierdan si el proyecto gratuito se pausa o se borra, y para
que entren al catálogo como cualquier otro documento, bajalos al archivo de vez en
cuando:

```sh
python3 -m scripts.sync_uploads --dry-run   # muestra qué agregaría
python3 -m scripts.sync_uploads             # baja los aportes aprobados a ../ (usa .env)
python3 -m scripts.build_catalog            # y reconstruí el catálogo
```

Cada aporte aprobado va a `../<Festival>/<Año>/<Categoría>/Aporte_<id>.<ext>` con una
fila en `SOURCES.tsv` cuyo origen es «Aporte de <nombre>, <fecha>». Es idempotente: si
los mismos bytes ya están en el archivo (mismo id), no lo vuelve a bajar.

## Hacer admin a una cuenta

La persona primero tiene que iniciar sesión una vez en el sitio (así se crea su perfil).
Después, en el editor SQL de Supabase o con `psql`:

```sh
psql "$DATABASE_URL" -v email=persona@ejemplo.com -f scripts/make_admin.sql
```

En el editor SQL, reemplazá `:'email'` por el correo entre comillas simples. No
commitees correos reales.

## Exportar aportes aprobados

Las páginas leen los aportes aprobados en vivo. Además, `export.yml` corre cada lunes
(o a mano desde Actions), escribe `data/approved/contributions.json` y
`data/approved/editions.json`, commitea si hubo cambios y dispara el deploy, así los
datos y recuerdos quedan en el HTML estático (y los ven los buscadores). Para correrlo
local:

```sh
node --env-file=.env scripts/export_approved.mjs
```

La exportación sale ordenada y sin `user_id`, correos ni rutas de almacenamiento; solo
el nombre público de quien aportó.

## Publicación

- **Variables del repo** (Settings → Secrets and variables → Actions → Variables):
  `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`. La clave anon es pública por
  diseño; la RLS protege los datos.
- **Secreto del repo:** `SUPABASE_SERVICE_ROLE_KEY`, que usa solo `export.yml`.
- **Pages:** Settings → Pages → Source: GitHub Actions. `deploy.yml` corre en cada push
  a `main`.
- **Keepalive:** `keepalive.yml` hace una lectura diaria para que el proyecto gratuito
  de Supabase no se pause. GitHub desactiva los cron de repos sin actividad por 60
  días; si pasa, reactivalos desde la pestaña Actions.

- **Ingreso por correo:** se puede entrar con un código de 6 dígitos o con el enlace
  del correo. Sin SMTP propio, Supabase manda sus plantillas por defecto («Confirm
  signup» y «Magic Link»), que traen solo un enlace: ese enlace ahora inicia sesión
  (flujo PKCE, vuelve a `/ingresar/`). Solo funciona en el mismo navegador donde se
  pidió el correo. En Supabase → Authentication → URL Configuration poné
  `https://amgueddfa.kevinroberts.ar` como Site URL y agregá
  `https://amgueddfa.kevinroberts.ar/ingresar/**` (y `http://localhost:4321/ingresar/**`
  para desarrollo) en Redirect URLs; si no, el enlace cae en la portada.
- **Plantillas con código:** con SMTP propio (Resend, ver abajo), en Supabase →
  Authentication → Email Templates pegá `supabase/templates/magic_link.html` en
  «Magic Link» y `supabase/templates/confirmation.html` en «Confirm signup», con el
  asunto «Tu código para ingresar al Amgueddfa». Las dos usan `{{ .Token }}` y así
  llega el código de 6 dígitos. (`supabase/config.toml` ya las declara para el entorno
  local.)
- **Contacto del pie:** la dirección se muestra como imagen (`public/contacto.png`) y,
  a quien inició sesión, como enlace. No la escribas como texto en las páginas ni en
  `es-AR.json`; el test de build lo chequea.

### SMTP propio

El envío de correos que trae Supabase tiene un límite muy bajo (unos pocos por hora) y
los códigos de ingreso dejarían de llegar apenas haya movimiento. Antes del
lanzamiento configurá un SMTP propio (por ejemplo, el plan gratuito de Resend) en
Supabase → Authentication → SMTP Settings, con un remitente del dominio del proyecto,
y ajustá el límite de correos en Authentication → Rate Limits.
