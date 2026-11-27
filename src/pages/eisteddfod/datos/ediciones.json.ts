import { isPublic } from '../../../lib/visibilidad';
import approvedRaw from '../../../../data/approved/contributions.json';
import editionsRaw from '../../../../data/approved/editions.json';
import { editionCover, editionItems, editionState, editionYears, festivals } from '../../../lib/catalog';
import { forEdition, sortFacts, type Contribution } from '../../../lib/contrib';
import { url } from '../../../lib/paths';
import { absUrl, editionFacts, factRecord } from '../../../lib/seo';
import { transcriptionDoc } from '../../../lib/transcripciones';

/** Open data: every edition in range (and documented not-held years before it) with its state, cover and approved facts. */
export function GET(): Response {
  const approved = approvedRaw as Contribution[];
  const status = new Map((editionsRaw as { coleccion: string; year: number; status: 'held' | 'not_held' | 'unknown' }[])
    .map((e) => [`${e.coleccion}:${e.year}`, e.status]));
  const ediciones = festivals().flatMap((f) => {
    const notHeld = [...status].filter(([k, v]) => v === 'not_held' && k.startsWith(`${f.slug}:`)).map(([k]) => Number(k.split(':')[1]));
    return editionYears(f.slug, notHeld).map((year) => {
      const cover = editionCover(f.slug, year);
      const facts = editionFacts(approved, f.slug, year, status.get(`${f.slug}:${year}`) ?? null);
      return {
        eisteddfod: f.slug,
        nombre: f.name,
        ano: year,
        url: absUrl(url(`${f.slug}/${year}/`, 'es')),
        estado: editionState(f.slug, year),
        // true / false when known; null when nobody has said (not a guess).
        realizada: facts.held ?? null,
        tapa: cover ? absUrl(cover.page) : null,
        // Some public document of this edition has a transcription.
        tiene_transcripcion: editionItems(f.slug, year).some((i) => isPublic(i) && transcriptionDoc(i.id) !== null),
        documentos: editionItems(f.slug, year).filter((i) => isPublic(i)).length + forEdition(approved, f.slug, year, 'upload').length,
        datos: sortFacts(forEdition(approved, f.slug, year, 'fact')).map(factRecord),
      };
    });
  });
  const body = { sitio: absUrl('/'), descripcion: 'Ediciones de los Eisteddfodau de la Patagonia (Chubut, Juventud, Mimosa, Trevelin): estado del archivo, tapa y datos aprobados.', generado: new Date().toISOString(), ediciones };
  return new Response(JSON.stringify(body, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
