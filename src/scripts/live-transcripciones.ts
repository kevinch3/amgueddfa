/**
 * Live transcriptions: the static page shows the build's snapshot
 * (src/data/transcripciones, src/data/ganadores); this replaces it with the
 * text in the database when an admin has edited it since. Each rendered
 * transcription carries its document id and a hash of the built text
 * (components/Transcripcion.astro), so only changed documents are redrawn.
 * Offline, nothing changes.
 */
import { textHash } from '../lib/docmd';
import { liveQuery } from '../lib/live';
import { transcriptionRuns } from '../lib/transcripciones';

type LiveDoc = { id: string; items: string[]; kind: string; text: string };

/** Same markup as components/Transcripcion.astro. */
export function renderTranscription(box: HTMLElement, text: string): void {
  const out: HTMLElement[] = [];
  for (const r of transcriptionRuns(text)) {
    if (r.kind === 'list') {
      const ul = document.createElement('ul');
      ul.className = 'tr-lista';
      for (const i of r.items) {
        const li = document.createElement('li');
        if (i.n) {
          const n = document.createElement('span');
          n.className = 'tr-n';
          n.textContent = `${i.n}.`;
          li.append(n);
        }
        li.append(` ${i.text}`);
        ul.append(li);
      }
      out.push(ul);
    } else {
      const tag = r.block.type === 'section' ? 'h3' : r.block.type === 'group' ? 'h4' : 'p';
      const h = document.createElement(tag);
      h.textContent = r.block.text;
      out.push(h);
    }
  }
  box.replaceChildren(...out);
}

/** Redraw `box` with `doc` unless the build already shows that text. */
function show(box: HTMLElement, doc: LiveDoc): void {
  const h = textHash(doc.text);
  if (box.dataset.doc === doc.id && box.dataset.docHash === h) return;
  renderTranscription(box, doc.text);
  box.dataset.doc = doc.id;
  box.dataset.docHash = h;
}

/** Item page: the programa transcription of this item, whichever document holds it now. */
async function itemPage(section: HTMLElement): Promise<void> {
  const item = section.dataset.trItem!;
  const box = section.querySelector<HTMLElement>('.transcripcion[data-doc]');
  if (!box) return;
  const live = await liveQuery<LiveDoc[]>(
    (c) => c.from('public_transcriptions').select('id, items, kind, text').eq('kind', 'programa').contains('items', [item]).limit(1),
    [],
  );
  if (live.offline) return;
  const doc = live.data[0];
  if (!doc) {
    section.hidden = true; // withdrawn or made private since the build
    return;
  }
  show(box, doc);
  section.hidden = false;
  // The list of sibling images is the build's; a changed document drops it rather than show a stale one.
  if (doc.items.join(' ') !== (section.dataset.trItems ?? '')) section.querySelector('[data-tr-siblings]')?.remove();
}

/** Edition page: every transcription and winners list shown. */
async function editionPage(boxes: HTMLElement[]): Promise<void> {
  const ids = [...new Set(boxes.map((b) => b.dataset.doc!))];
  const live = await liveQuery<LiveDoc[]>((c) => c.from('public_transcriptions').select('id, items, kind, text').in('id', ids), []);
  if (live.offline) return;
  const byId = new Map(live.data.map((d) => [d.id, d]));
  for (const box of boxes) {
    const doc = byId.get(box.dataset.doc!);
    if (doc) show(box, doc);
    else (box.closest<HTMLElement>('details') ?? box).hidden = true;
  }
}

if (typeof document !== 'undefined') {
  const section = document.querySelector<HTMLElement>('[data-tr-item]');
  if (section) void itemPage(section);
  else {
    const boxes = [...document.querySelectorAll<HTMLElement>('.transcripcion[data-doc]')].filter((b) => b.dataset.doc);
    if (boxes.length) void editionPage(boxes);
  }
}
