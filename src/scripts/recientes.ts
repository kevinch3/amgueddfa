import type { Contribution } from '../lib/contrib';
import { latestApproved } from '../lib/game';
import { t } from '../lib/i18n';
import { liveQuery } from '../lib/live';
import { url } from '../lib/paths';
import { el } from './ui';

const LIMIT = 10;
const COLS = 'id, type, festival, year, item_id, created_at, reviewed_at, display_name'; // no payload: never shown here

function readStatic(): Contribution[] {
  const s = document.getElementById('recientes-data');
  if (!s?.textContent) return [];
  try {
    const v = JSON.parse(s.textContent);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function fecha(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

/**
 * One line per approved contribution: who, what, which edition. No payload
 * text is shown, so nothing a reviewer has not seen in context reaches the home page.
 */
export function renderRecent(mount: HTMLElement, list: Contribution[], offline: boolean): void {
  mount.replaceChildren();
  if (list.length) {
    const ul = el('ul', { class: 'recientes-lista' });
    for (const c of list) {
      const li = el('li');
      if (c.display_name) li.append(el('a', { href: url(`perfil?u=${encodeURIComponent(c.display_name)}`) }, c.display_name));
      else li.append(t('recientes.alguien'));
      li.append(' ', t(`recientes.acciones.${c.type}`));
      if (c.festival && c.year) {
        const ed = `${t(`festivales.${c.festival}`)} ${c.year}`;
        const a = el('a', { href: url(`${c.festival}/${c.year}/`) }, ed);
        li.append(' ', t('recientes.del'), ' ', a);
      } else if (c.item_id && /^[0-9a-f]{12}$/.test(c.item_id)) {
        li.append(' (', el('a', { href: url(`item/${c.item_id}/`) }, t('perfil.documento')), ')');
      }
      const when = c.reviewed_at ?? c.created_at;
      const f = fecha(when);
      if (f) li.append(' ', el('time', { class: 'muted small', datetime: when! }, f));
      ul.append(li);
    }
    const more = el('p', { class: 'small' });
    more.append(el('a', { href: url('ranking') }, t('recientes.ver_ranking')));
    mount.append(ul, more);
  } else if (!offline) {
    mount.append(el('p', { class: 'muted' }, t('recientes.vacio')));
  }
  if (offline) mount.append(el('p', { class: 'muted small' }, t('estado.sin_conexion')));
}

async function hydrate(): Promise<void> {
  const mount = document.getElementById('recientes');
  if (!mount) return;
  const live = await liveQuery<Contribution[]>(
    (c) => c.from('public_contributions').select(COLS).order('reviewed_at', { ascending: false, nullsFirst: false }).limit(LIMIT),
    [],
  );
  renderRecent(mount, latestApproved(readStatic(), live.data, LIMIT), live.offline);
}

if (typeof document !== 'undefined') void hydrate();
