import { isPublic } from '../../../lib/visibilidad';
import { derechosDe } from '../../../lib/derechos';
import { festivals, items, pageUrls, thumbUrl } from '../../../lib/catalog';
import { url } from '../../../lib/paths';
import { absUrl, rightsText, TRANSCRIPTION_LICENSE } from '../../../lib/seo';
import { transcriptionDoc } from '../../../lib/transcripciones';

/** Open data: every public document of the archive (restricted ones are never listed). */
export function GET(): Response {
  const names = Object.fromEntries(festivals().map((f) => [f.slug, f.name]));
  const documentos = items().filter((i) => isPublic(i)).map((i) => {
    const thumb = thumbUrl(i);
    const transcrito = transcriptionDoc(i.id) !== null;
    const d = derechosDe(i);
    return {
      id: i.id,
      titulo: i.title,
      eisteddfod: i.coleccion,
      nombre_eisteddfod: names[i.coleccion],
      ano: i.fecha.year,
      categoria: i.tipo,
      tipo: i.formato,
      url: absUrl(url(`item/${i.id}/`, 'es')),
      miniatura: thumb ? absUrl(thumb) : null,
      paginas: pageUrls(i).map(absUrl),
      fuente: i.source_label || null,
      fuente_url: i.source_url,
      // The document's own rights (never empty); its transcription is the site's, under CC BY-SA.
      derechos: rightsText(i.rights),
      // Its licence code (lib/derechos.ts) and where it comes from: the document, its source or its collection.
      licencia: d?.licencia ?? 'sin-declarar',
      titular_derechos: d?.titular ?? null,
      licencia_origen: d?.origen ?? null,
      sin_texto: Boolean(i.no_text),
      tiene_transcripcion: transcrito,
      ...(transcrito ? { licencia_transcripcion: TRANSCRIPTION_LICENSE } : {}),
    };
  });
  const body = { sitio: absUrl('/'), descripcion: 'Documentos públicos del archivo (programas, bases, resultados y otros papeles de los Eisteddfodau de la Patagonia).', generado: new Date().toISOString(), documentos };
  return new Response(JSON.stringify(body, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
