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
| `media/<id>/` | Miniaturas y páginas en WebP (nunca de ítems restringidos). No va a git: se sube al bucket R2 que sirve `amgueddfa-media.kevinroberts.ar`. |
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

## Idiomas

El sitio está en siete idiomas. El castellano (`es-AR`) va sin prefijo; los demás
cuelgan de su propio prefijo, con todas las páginas:

| Prefijo | Idioma | Archivo |
| --- | --- | --- |
| `/` | Castellano (Argentina) | `src/i18n/es-AR.json` |
| `/cy/` | Galés de la Wladfa (`cy-AR`) | `src/i18n/cy-AR.json` |
| `/en/` | Inglés británico | `src/i18n/en-GB.json` |
| `/zh/` | Chino simplificado | `src/i18n/zh-Hans.json` |
| `/it/` | Italiano | `src/i18n/it.json` |
| `/fr/` | Francés | `src/i18n/fr.json` |
| `/sv/` | Sueco | `src/i18n/sv.json` |

- **Las páginas fuente son solo las castellanas.** Astro arma `/cy/…`, `/en/…`, etc. a
  partir de ellas (`i18n.fallback` con `fallbackType: 'rewrite'` en `astro.config.mjs`), y
  `src/middleware.ts` fija el idioma de cada página antes de dibujarla. Por eso `t()`,
  `url()` y los formatos de fecha y número no reciben el idioma: lo leen del idioma actual
  (`src/lib/i18n.ts`). En el navegador sale del `<html lang>`, y cada página baja solo el
  archivo de su idioma. El build dibuja una página por vez (`build.concurrency: 1`); no lo
  subas, porque el idioma actual es compartido.
- **Para cambiar un texto**, editá la misma clave en los siete archivos. Si agregás una
  clave, tiene que estar en todos: `tests-js/i18n.test.ts` chequea que las claves y los
  `{marcadores}` coincidan y que ninguna oración quede sin traducir.
- **Los documentos no se traducen**: títulos, transcripciones, recuerdos y datos aportados
  se muestran en su idioma original, y el pie lo aclara. Los datos abiertos
  (`/datos/*.json`), `llms.txt` y el `sitemap.xml` son uno solo para todo el sitio; el
  sitemap lista cada página en los siete idiomas y cada página nombra sus versiones con
  `hreflang`.
- **Páginas legales**: las traducciones avisan que, si difieren, vale el texto en
  castellano, y enlazan a él.
- **Galés en el navegador**: Chrome no trae datos de galés, así que las fechas, el «ddoe» y
  los nombres de países saldrían en inglés. `src/i18n/cldr/cy.json` los trae, sacados del
  ICU completo de Node, y solo se baja en las páginas en galés de un navegador sin galés.
  Si actualizás Node, regeneralo con `node scripts/cldr_fallback.mjs` (un test avisa si
  quedó viejo).
- **Ingreso por correo**: el enlace del correo siempre vuelve a `/ingresar/` (la única
  dirección que Supabase permite, ver «Ingreso por correo» abajo) con `?lang=cy` u otro
  idioma, y esa página reenvía a `/cy/ingresar/` sin perder el código. No hace falta
  agregar direcciones en Supabase.
- **404**: GitHub Pages responde toda dirección que falta con `/404.html` (castellano); si
  la dirección es de otro idioma, salta a `/cy/404/` y vuelve a poner la dirección pedida
  en la barra.

## Accesibilidad

El objetivo es **WCAG 2.2 nivel AA** (W3C). Con eso también se cubren las pautas de la Ley
26.653 de la Argentina (Disposición ONTI 6/2019, sobre WCAG 2.0, que obliga solo al Estado y
a quien recibe fondos públicos) y la norma europea EN 301 549. La declaración está en
`/accesibilidad/` (en los siete idiomas), enlazada desde el pie de cada página.

- **Estado: parcialmente conforme.** La navegación, los formularios y los textos del sitio
  cumplen; lo que falta está listado en la declaración (escaneos sin texto completo, pasajes
  en galés sin marcar dentro de las transcripciones, subtítulos de YouTube).
- **Cómo se evaluó** (16/11/2026): axe-core 4.10 con las reglas de WCAG 2.0 a 2.2 A y AA
  en cada tipo de página y en varios idiomas, con el fondo de papel en su tono más oscuro
  para medir el contraste, y además con alto contraste, texto al 200 %, espaciado amplio,
  reflujo a 320 px y teclado. Sin errores. Falta que lo prueben personas con lectores de
  pantalla.
- **Logo del W3C.** El W3C deja que un sitio muestre el logo de conformidad AA como
  declaración propia (no lo certifica), pero después de una evaluación a fondo con
  personas y con la fecha, la versión, el nivel y el alcance a la vista. Por eso
  `CLAIM` en `src/lib/accesibilidad.ts` está en `null` y el pie muestra solo «Accesibilidad:
  buscamos cumplir WCAG 2.2 nivel AA». Para declarar conformidad: resolver o dejar fuera
  del alcance lo que falta, hacer la prueba con personas, copiar
  `https://www.w3.org/WAI/WCAG22/wcag2.2AA.svg` a `public/wcag2.2AA.svg` (el W3C permite
  copias locales con su mismo texto alternativo y enlace) y poner la fecha en `CLAIM`. El
  test de build exige el archivo cuando hay declaración.
- **Ajustes de lectura**: tamaño del texto, contraste alto, espaciado, letra sin serifa,
  menos animaciones y enlaces subrayados, en el botón «Aa» de la cabecera y en
  `/accesibilidad/`. Se guardan en `localStorage` (`amg:lectura`, listado en `/cookies/`) y
  un script en línea al principio del `<head>` los aplica antes de pintar la página. El
  sitio también respeta `prefers-contrast`, `prefers-reduced-motion` y `forced-colors`.
- **Idioma de las partes** (WCAG 3.1.2): en las versiones traducidas, los títulos, textos,
  transcripciones y aportes llevan `lang="es"`; `contentLang()` en `src/lib/i18n.ts`.

## Navegadores con agentes (WebMCP)

Cada página registra herramientas [WebMCP](https://webmachinelearning.github.io/webmcp/)
(`document.modelContext`) para el asistente de IA del navegador, en
`src/scripts/webmcp.ts` (la lógica, sin DOM, en `src/lib/agent-tools.ts`):
`get_page_info`, `search_documents`, `list_editions`, `get_edition`, `open_page`,
`set_language` y `set_reading_settings`. Leen los datos abiertos (`/datos/*.json`) y
ninguna escribe en el archivo.

Los formularios para aportar un dato y un recuerdo (`/contribuir/`) son herramientas
declarativas (`toolname="add_edition_fact"` y `"share_memory"`, sin `toolautosubmit`): el
agente los completa y la persona los envía; al enviar, el agente recibe lo que dice la
página (`agentReply()` en `src/lib/webmcp.ts`). La subida de archivos queda afuera.

WebMCP es un borrador de un Community Group del W3C y en Chrome está en *origin trial*
(Chrome 149+). Para activarlo en el sitio publicado, registrá el dominio en
<https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241> y guardá
el token como variable de repositorio `PUBLIC_WEBMCP_OT_TOKEN` (el build agrega el
`<meta http-equiv="origin-trial">` solo si existe). Para probar en local: Chrome con
`chrome://flags/#enable-webmcp-testing` (o `--enable-features=WebMCP`). Sin el token o
sin soporte, el script no hace nada.

Para otras automatizaciones: cada página enlaza los datos abiertos
(`<link rel="alternate" type="application/json">`) y `llms.txt` (`rel="help"`), los
campos de formulario tienen `name`, etiqueta y `autocomplete` donde corresponde, y los
controles se pueden encontrar por su rol y su nombre accesible.

## Reconstruir el catálogo

El archivo vive en la carpeta padre del repo (`../`) y no se sube nunca. Solo esta
máquina lo tiene, así que el catálogo se arma acá y se commitea; CI solo construye y
publica el sitio.

```sh
python3 -m scripts.build_catalog              # escanea ../, escribe src/data/catalog.json y media/, y sube media/ a R2
python3 -m scripts.build_catalog --only <id>  # regenera las derivadas de un ítem (y solo sube ese ítem)
python3 -m scripts.push_restricted            # sube .restricted/ al bucket privado (usa .env)
npx vitest run tests-js/build.test.ts         # chequea el build y que no se filtren datos personales
```

La subida usa `rclone` con el remoto `r2` de `~/.config/rclone/rclone.conf` (otro destino:
`MEDIA_REMOTE=remoto:bucket/media`); solo manda lo que cambió, y una corrida completa
borra del bucket lo que ya no es público. `--no-upload` la saltea. Después commiteá
`src/data/catalog.json`. El sitio arma las URLs con `siteMedia()` (`src/lib/paths.ts`);
`PUBLIC_MEDIA_BASE=""` las vuelve a servir desde `/media/` del propio sitio.

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
el nombre público de quien aportó. De los errores informados («Informar un error») sale
solo el arreglo, nunca la explicación.

Un error informado y aprobado oculta o mueve el video o documento al momento (en vivo) y
en cada build (desde la exportación). Va por id, así que volver a correr
`python3 -m scripts.export_videos` o `scripts.build_catalog` no lo deshace: no hace falta
tocar `VIDEOS.tsv` ni el archivo. Un documento oculto conserva su página, con un aviso.

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

- **Ingreso por correo:** se entra con el enlace del correo (o con un código de 6
  números, si la plantilla lo trae). Sin SMTP propio, Supabase manda sus plantillas por defecto («Confirm
  signup» y «Magic Link»), que traen solo un enlace: ese enlace ahora inicia sesión
  (flujo PKCE, vuelve a `/ingresar/`). Solo funciona en el mismo navegador donde se
  pidió el correo. En Supabase → Authentication → URL Configuration poné
  `https://amgueddfa.kevinroberts.ar` como Site URL y agregá
  `https://amgueddfa.kevinroberts.ar/ingresar/**` (y `http://localhost:4321/ingresar/**`
  para desarrollo) en Redirect URLs; si no, el enlace cae en la portada.
- **Plantillas con código:** con SMTP propio (Resend, ver abajo), en Supabase →
  Authentication → Email Templates pegá `supabase/templates/magic_link.html` en
  «Magic Link» y `supabase/templates/confirmation.html` en «Confirm signup», con el
  asunto «Amgueddfa Eisteddfod y Wladfa» (igual en todos los idiomas). Las dos usan
  `{{ .Token }}` y así llega el código de 6 números. (`supabase/config.toml` ya las
  declara para el entorno local.) El cuerpo sale en el idioma de la cuenta: el sitio
  guarda `lang` en los metadatos del usuario (`user_metadata`, que la plantilla lee como
  `{{ .Data.lang }}`) al crear la cuenta y cada vez que alguien la usa desde otro idioma;
  sin `lang`, sale en castellano. Los textos son las claves `correo.*` de
  `src/i18n/*.json`: si los cambiás, corré `node scripts/email_templates.mjs` y volvé a
  pegar las plantillas (un test avisa si quedaron viejas). Conviene mandarse un correo de
  prueba en cada idioma después de pegarlas.
- **Contacto del pie:** la dirección se muestra como imagen (`public/contacto.png`) y,
  a quien inició sesión, como enlace. No la escribas como texto en las páginas ni en
  `es-AR.json`; el test de build lo chequea.

### SMTP propio

El envío de correos que trae Supabase tiene un límite muy bajo (unos pocos por hora) y
los códigos de ingreso dejarían de llegar apenas haya movimiento. Antes del
lanzamiento configurá un SMTP propio (por ejemplo, el plan gratuito de Resend) en
Supabase → Authentication → SMTP Settings, con un remitente del dominio del proyecto,
y ajustá el límite de correos en Authentication → Rate Limits.

### Código de 6 números

Mientras no haya SMTP propio (Resend), Supabase manda sus correos por defecto, que sólo traen un enlace; la página de ingreso esconde el campo del código detrás de “¿Te llegó un código de 6 números?”. Cuando el SMTP esté configurado y pegues `supabase/templates/*.html` en Supabase, agregá la variable de repositorio `PUBLIC_AUTH_CODE=1` para mostrar el campo del código de entrada.

### Analítica (Cloudflare Web Analytics)

El sitio cuenta visitas con Cloudflare Web Analytics, que no usa cookies ni guarda nada en el navegador. Para activarla:

1. En el panel de Cloudflare → **Analytics & Logs → Web Analytics**, agregá el sitio `amgueddfa.kevinroberts.ar` (como sitio sin proxy: el dominio apunta a GitHub Pages) y copiá el *token* del fragmento de JavaScript.
2. Guardalo como variable de repositorio `PUBLIC_CF_ANALYTICS_TOKEN` (`gh variable set PUBLIC_CF_ANALYTICS_TOKEN`) y, para probar en local, en `.env`.

Sin la variable, el build no incluye ni el token ni el script. Con ella, el script se carga en el navegador sólo si la persona no desactivó el conteo en `/cookies` y su navegador no envía *Do Not Track* ni *Global Privacy Control*. `/admin` nunca lo carga. Las visitas, países y sitios de origen se ven en el panel de Cloudflare; los ingresos por hora, en `/admin` → Estadísticas.
