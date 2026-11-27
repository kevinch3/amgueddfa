import type { APIRoute } from 'astro';
import { festivals, items, pageUrls } from '../../../lib/catalog';
import { t } from '../../../lib/i18n';
import { itemMarkdown } from '../../../lib/markdown';
import { url } from '../../../lib/paths';
import { absUrl, rightsText, TRANSCRIPTION_LICENSE } from '../../../lib/seo';
import { ocrFor } from '../../../lib/ocr';
import { transcriptionDoc } from '../../../lib/transcripciones';
import type { Item } from '../../../lib/types';

/** Markdown twin of every public document page (/item/<id>.md). Restricted and hidden documents get none. */
export function getStaticPaths() {
  return items().filter((i) => !i.restricted).map((item) => ({ params: { id: item.id }, props: { item } }));
}

export const GET: APIRoute = ({ props }) => {
  const { item } = props as { item: Item };
  const fest = festivals().find((f) => f.slug === item.festival)!;
  const body = itemMarkdown({
    id: item.id, title: item.title, festivalName: fest.name, festival: item.festival, year: item.year,
    category: t(`categorias.${item.category}`), url: absUrl(url(`item/${item.id}/`)),
    editionUrl: item.year !== null ? absUrl(url(`${item.festival}/${item.year}/`)) : null,
    rights: rightsText(item.rights), source: item.source_label || null, sourceUrl: item.source_url,
    note: item.note_public ?? '', images: pageUrls(item).map(absUrl),
    transcription: transcriptionDoc(item.id)?.text ?? null, transcriptionLicense: TRANSCRIPTION_LICENSE,
    ocr: item.text_excerpt ? null : ocrFor(item.id)?.pages ?? null,
  });
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
