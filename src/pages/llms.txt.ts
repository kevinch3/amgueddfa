import { festivals, firstMaterialYear } from '../lib/catalog';
import { absUrl } from '../lib/seo';

/** A plain-text guide to the site for language models and other bots (llms.txt). */
export function GET(): Response {
  const fests = festivals().map((f) => {
    const since = firstMaterialYear(f.slug);
    return `- [${f.name}](${absUrl(`${f.slug}/`)})${since ? `: material desde ${since}` : ''}`;
  });
  const text = `# Amgueddfa Eisteddfod y Wladfa

> Museo digital de los Eisteddfodau de la Patagonia (Argentina): programas, bases, resultados, fotos y datos de cada edición, aportados y revisados por la comunidad. Todo el contenido es abierto y se puede leer y reutilizar.

El sitio está en castellano (con títulos en galés). Cada edición tiene una página por año, por ejemplo ${absUrl('chubut/1937/')}, con sus documentos, los datos aprobados (fecha, lugar, ganadores de la silla y la corona, competencias) con su fuente, y recuerdos.

## Eisteddfodau

${fests.join('\n')}

## Datos abiertos

- [Ediciones](${absUrl('datos/ediciones.json')}): todas las ediciones con estado del archivo, tapa y datos aprobados (con fuente y quién los aportó).
- [Documentos](${absUrl('datos/documentos.json')}): todos los documentos públicos con título, eisteddfod, año, categoría, miniatura e imágenes de cada página.
- [Mapa del sitio](${absUrl('sitemap.xml')})

## Notas

- Los documentos restringidos por pedido de las asociaciones no se publican ni se listan.
- Las páginas de cada año también llevan datos estructurados schema.org (Event); las de cada documento, ArchiveComponent.
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
