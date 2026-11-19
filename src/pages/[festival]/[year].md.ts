import type { APIRoute } from 'astro';
import approvedRaw from '../../../data/approved/contributions.json';
import { editionItems, editionState, editionStatus, festivals, yearRange } from '../../lib/catalog';
import { factDisplay, forEdition, sortFacts, type Contribution } from '../../lib/contrib';
import { t } from '../../lib/i18n';
import { editionMarkdown } from '../../lib/markdown';
import { url } from '../../lib/paths';
import { absUrl } from '../../lib/seo';
import { byTitle, stateLabel } from '../../lib/site';
import { transcriptionDoc } from '../../lib/transcripciones';
import type { FestivalSlug } from '../../lib/types';

/** Markdown twin of every year page (/chubut/1937.md): same years, same data. */
export function getStaticPaths() {
  return festivals().flatMap((f) => {
    const [a, b] = yearRange(f.slug);
    return Array.from({ length: b - a + 1 }, (_, k) => ({ params: { festival: f.slug, year: String(a + k) } }));
  });
}

export const GET: APIRoute = ({ params }) => {
  const slug = params.festival as FestivalSlug;
  const year = Number(params.year);
  const fest = festivals().find((f) => f.slug === slug)!;
  const approved = approvedRaw as Contribution[];
  const status = editionStatus(slug, year);
  const state = editionState(slug, year);
  const facts = sortFacts(forEdition(approved, slug, year, 'fact')).map((c) => {
    const { label, value } = factDisplay(c);
    const fuente = String(c.payload?.fuente ?? '').trim();
    return { label, value, fuente: fuente ? `fuente: ${fuente}` : null, by: c.display_name ? `aportó ${c.display_name}` : '' };
  });
  const docs = editionItems(slug, year).filter((i) => !i.restricted).sort(byTitle).map((i) => ({
    title: i.title, category: t(`categorias.${i.category}`), url: absUrl(url(`item/${i.id}/`)), transcribed: transcriptionDoc(i.id) !== null,
  }));
  const body = editionMarkdown({
    name: fest.name, festival: slug, year, url: absUrl(url(`${slug}/${year}/`)), status, estado: state,
    stateText: stateLabel(state, status), facts, docs, uploads: forEdition(approved, slug, year, 'upload').length, dataUrl: absUrl('datos/ediciones.json'),
  });
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
