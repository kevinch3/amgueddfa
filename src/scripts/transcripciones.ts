import { approvedTranscriptions, byLine, mergeApproved, type Contribution } from '../lib/contrib';

/** Quote + byline per transcription, the markup the static build renders. */
export function renderTranscriptions(mount: HTMLElement, list: Contribution[]): void {
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

/** Item page: approved contributor transcriptions, last export merged with live rows. */
function readStatic(): Contribution[] {
  try {
    const v = JSON.parse(document.getElementById('transcripciones-data')?.textContent ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function hydrate(): Promise<void> {
  const mount = document.getElementById('transcripciones');
  const item = mount?.dataset.item;
  if (!mount || !item) return;
  const live = await approvedTranscriptions(item);
  if (live.offline) return; // the static build already shows the exported ones
  const all = mergeApproved(readStatic(), live.data).filter((c) => c.type === 'transcription' && c.item_id === item);
  renderTranscriptions(mount, all);
  const section = mount.closest<HTMLElement>('[data-transcripciones]');
  if (section) section.hidden = all.length === 0;
}

if (typeof document !== 'undefined') void hydrate();
