import { festivals, firstMaterialYear } from '../lib/catalog';
import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO } from '../lib/i18n';
import { url } from '../lib/paths';
import { absUrl } from '../lib/seo';
import { DOCUMENTOS, MODELO_RECONSTRUCCION, SITIO, VIDEOS } from '../lib/creditos';

/** A plain-text guide to the site for language models and other bots (llms.txt). */
export function GET(): Response {
  const fests = festivals().map((f) => {
    const since = firstMaterialYear(f.slug);
    return `- [${f.name}](${absUrl(`${f.slug}/`)})${since ? `: material desde ${since}` : ''}`;
  });
  const versions = LOCALES.filter((l) => l !== DEFAULT_LOCALE)
    .map((l) => `${LOCALE_INFO[l].name} (${LOCALE_INFO[l].tag}): ${absUrl(url('/', l))}`)
    .join('; ');
  const text = `# Amgueddfa Eisteddfod y Wladfa

> Museo digital de los Eisteddfodau de la Patagonia (Argentina): programas, bases, resultados, fotos y datos de cada edición, aportados y revisados por la comunidad. Todo el contenido es abierto y se puede leer y reutilizar.

El sitio está en castellano (con títulos en galés), y cada página también está traducida en ${versions}. Los documentos, las transcripciones y los aportes se muestran siempre en su idioma original. Cada edición tiene una página por año, por ejemplo ${absUrl('chubut/1937/')}, con sus documentos, los datos aprobados (fecha, lugar, ganadores de la silla y la corona, competencias) con su fuente, y recuerdos.

## Eisteddfodau

${fests.join('\n')}

## Datos abiertos

- [Ediciones](${absUrl('datos/ediciones.json')}): todas las ediciones con estado del archivo, tapa y datos aprobados (con fuente y quién los aportó). Dos campos distintos: \`realizada\` dice si la edición se hizo (\`true\`, \`false\`, o \`null\` cuando no se sabe: no es lo mismo que «no se hizo»); \`estado\` dice cuánto material se conserva en el archivo (\`full\` programa completo confirmado, \`some\` algo de material, \`none\` nada todavía). Que falte material no significa que la edición no se haya hecho. \`tiene_transcripcion\` indica si algún documento de la edición está transcrito.
- [Documentos](${absUrl('datos/documentos.json')}): todos los documentos públicos con título, eisteddfod, año, categoría, miniatura e imágenes de cada página. \`derechos\` es siempre explícito: las imágenes y escaneos siguen siendo de sus titulares; las transcripciones y los datos del sitio son CC BY-SA 4.0 (\`licencia_transcripcion\`).
- Cada página de año y de documento tiene una versión en Markdown con los mismos datos (y la transcripción, si la hay): ${absUrl('chubut/1937.md')}, ${absUrl('item/')}<id>.md. La página la anuncia con \`<link rel="alternate" type="text/markdown">\`.
- [Buscar](${absUrl('buscar/')}): búsqueda en títulos, transcripciones, datos y texto automático (también \`?q=…\`, p. ej. ${absUrl('buscar/?q=Cadair')}).
- [Mapa del sitio](${absUrl('sitemap.xml')})

## Herramientas para agentes (WebMCP)

Cada página registra herramientas WebMCP (\`document.modelContext\`) en los navegadores que lo soportan: \`get_page_info\`, \`search_documents\`, \`list_editions\`, \`get_edition\`, \`open_page\`, \`set_language\` y \`set_reading_settings\`. Ninguna escribe en el archivo. Los formularios para aportar un dato o un recuerdo (${absUrl('contribuir')}) son herramientas declarativas (\`toolname\` \`add_edition_fact\` y \`share_memory\`): el agente los completa y la persona los envía.

## De dónde salen los textos

- Videos de Chubut y Trevelin: texto reconstruido a partir de los subtítulos de YouTube, Whisper (castellano) y el modelo de galés de la Universidad de Bangor (${VIDEOS[0].href}), más la letra de lo que se canta cuando la tenemos. Cada línea sale de lo que se escuchó en alguna fuente; ${MODELO_RECONSTRUCCION} (Anthropic) elige y corrige, y reglas propias comprueban cada respuesta. Cada archivo de texto indica la fuente de cada línea (\`fuentes\`).
- Documentos: transcripciones hechas por personas; aparte, texto automático sin revisar (${DOCUMENTOS.map((x) => x.nombre).join(', ')}).
- Herramientas, recursos y licencias: ${absUrl('creditos/')} (${[...VIDEOS, ...SITIO].map((x) => x.nombre).join(', ')}).

## Accesibilidad

Objetivo: WCAG 2.2 nivel AA. Declaración, estado y ajustes de lectura: ${absUrl('accesibilidad/')}

## Notas

- Los documentos restringidos por pedido de las asociaciones no se publican ni se listan.
- Las páginas de cada año llevan datos estructurados schema.org: Event solo cuando la edición está confirmada y tiene fecha y lugar aprobados; si no, CollectionPage. Las de cada documento, ArchiveComponent; todas con BreadcrumbList.
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
