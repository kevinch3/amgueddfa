/**
 * Footer "Último cambio: hace 3 horas". The build bakes the last commit date in
 * data-at; here it moves forward to the newest approved contribution or edition
 * change, so activity shows without a rebuild. Offline, the baked date stays.
 */
import { liveQuery } from '../lib/live';
import { fechaHora, relativa } from '../lib/dates';
import { t } from '../lib/i18n';
import { latest } from '../lib/ultimo-cambio';

type Row = Record<string, string | null>;

function newest(table: string, col: string) {
  return liveQuery<Row[]>((c) => c.from(table).select(col).not(col, 'is', null).order(col, { ascending: false }).limit(1), []).then(
    (r) => r.data[0]?.[col] ?? null,
  );
}

function render(el: HTMLElement, iso: string | null): void {
  const cuando = relativa(iso);
  if (!iso || !cuando) return;
  el.textContent = t('pie.ultimo_cambio', { cuando });
  el.title = fechaHora(iso);
  el.hidden = false;
}

async function run(): Promise<void> {
  const el = document.getElementById('ultimo-cambio');
  if (!el) return;
  const built = el.dataset.at || null;
  render(el, latest([built]));
  const [contrib, edition] = await Promise.all([newest('public_contributions', 'reviewed_at'), newest('editions', 'updated_at')]);
  render(el, latest([built, contrib, edition]));
}

if (typeof document !== 'undefined') void run();
