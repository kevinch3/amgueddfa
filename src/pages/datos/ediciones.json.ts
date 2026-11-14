import approvedRaw from '../../../data/approved/contributions.json';
import editionsRaw from '../../../data/approved/editions.json';
import { editionCover, editionItems, editionState, festivals, yearRange } from '../../lib/catalog';
import { forEdition, sortFacts, type Contribution } from '../../lib/contrib';
import { absUrl, editionFacts, factRecord } from '../../lib/seo';

/** Open data: every edition in range with its state, cover and approved facts. */
export function GET(): Response {
  const approved = approvedRaw as Contribution[];
  const notHeld = new Set((editionsRaw as { festival: string; year: number; status: string }[])
    .filter((e) => e.status === 'not_held').map((e) => `${e.festival}:${e.year}`));
  const ediciones = festivals().flatMap((f) => {
    const [first, last] = yearRange(f.slug);
    return Array.from({ length: last - first + 1 }, (_, k) => {
      const year = first + k;
      const cover = editionCover(f.slug, year);
      const facts = editionFacts(approved, f.slug, year);
      return {
        eisteddfod: f.slug,
        nombre: f.name,
        ano: year,
        url: absUrl(`${f.slug}/${year}/`),
        estado: editionState(f.slug, year),
        realizada: !(facts.notHeld || notHeld.has(`${f.slug}:${year}`)),
        tapa: cover ? absUrl(cover.page) : null,
        documentos: editionItems(f.slug, year).filter((i) => !i.restricted).length + forEdition(approved, f.slug, year, 'upload').length,
        datos: sortFacts(forEdition(approved, f.slug, year, 'fact')).map(factRecord),
      };
    });
  });
  const body = { sitio: absUrl('/'), descripcion: 'Ediciones de los Eisteddfodau de la Patagonia (Chubut, Juventud, Mimosa, Trevelin): estado del archivo, tapa y datos aprobados.', generado: new Date().toISOString(), ediciones };
  return new Response(JSON.stringify(body, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
