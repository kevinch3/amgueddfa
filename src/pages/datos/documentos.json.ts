import { festivals, items, pageUrls, thumbUrl } from '../../lib/catalog';
import { absUrl } from '../../lib/seo';

/** Open data: every public document of the archive (restricted ones are never listed). */
export function GET(): Response {
  const names = Object.fromEntries(festivals().map((f) => [f.slug, f.name]));
  const documentos = items().filter((i) => !i.restricted).map((i) => {
    const thumb = thumbUrl(i);
    return {
      id: i.id,
      titulo: i.title,
      eisteddfod: i.festival,
      nombre_eisteddfod: names[i.festival],
      ano: i.year,
      categoria: i.category,
      tipo: i.kind,
      url: absUrl(`item/${i.id}/`),
      miniatura: thumb ? absUrl(thumb) : null,
      paginas: pageUrls(i).map(absUrl),
      fuente: i.source_label || null,
      fuente_url: i.source_url,
    };
  });
  const body = { sitio: absUrl('/'), descripcion: 'Documentos públicos del archivo (programas, bases, resultados y otros papeles de los Eisteddfodau de la Patagonia).', generado: new Date().toISOString(), documentos };
  return new Response(JSON.stringify(body, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
