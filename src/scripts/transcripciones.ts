import { approvedNotes, approvedTranscriptions, byLine, mergeApproved, type Contribution, type Kind } from '../lib/contrib';
import type { LiveResult } from '../lib/live';

/** Quote + byline per row (transcriptions, notes), the markup the static build renders. */
export function renderQuotes(mount: HTMLElement, list: Contribution[]): void {
  mount.replaceChildren();
  if (!list.length) return;
  const ul = document.createElement('ul');
  ul.className = 'recuerdos';
  for (const c of list) {
    const li = document.createElement('li');
    const q = document.createElement('blockquote');
    q.textContent = String(c.payload?.text ?? '');
    li.append(q);
    const by = byLine(c);
    if (by) {
      const p = document.createElement('p');
      p.className = 'muted small';
      p.textContent = by;
      li.append(p);
    }
    ul.append(li);
  }
  mount.append(ul);
}

/** Rows baked into the page by the last export. */
function readStatic(id: string): Contribution[] {
  try {
    const v = JSON.parse(document.getElementById(id)?.textContent ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Item page: one list of approved rows of one type, last export merged with live rows. */
async function hydrate(mountId: string, type: Kind, load: (item: string) => Promise<LiveResult<Contribution[]>>): Promise<void> {
  const mount = document.getElementById(mountId);
  const item = mount?.dataset.item;
  if (!mount || !item) return;
  const live = await load(item);
  if (live.offline) return; // the static build already shows the exported ones
  const all = mergeApproved(readStatic(`${mountId}-data`), live.data).filter((c) => c.type === type && c.item_id === item);
  renderQuotes(mount, all);
  const section = mount.closest<HTMLElement>('[data-transcripciones]');
  if (section) section.hidden = all.length === 0;
}

if (typeof document !== 'undefined') {
  void hydrate('transcripciones', 'transcription', approvedTranscriptions);
  void hydrate('notas', 'note', approvedNotes);
}
