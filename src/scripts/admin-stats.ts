// Admin "Estadísticas": sign-ins per day (last 90 days) and by weekday × hour,
// in the admin's timezone. Page views, countries and referrers live in Cloudflare.
import { fecha, userTimeZone } from '../lib/dates';
import { t } from '../lib/i18n';
import { liveQuery } from '../lib/live';
import { perDay, weekHourGrid, type HourCount } from '../lib/stats';
import { el } from './ui';

const DAYS = 90;
export const CF_DASHBOARD = 'https://dash.cloudflare.com/?to=/:account/web-analytics';

async function loadStats(days: number) {
  return liveQuery<HourCount[]>(async (c) => {
    const { data, error } = await c.rpc('admin_signin_stats', { days });
    return { data: (data ?? []) as HourCount[], error };
  }, [], 8000);
}

/** Share of the maximum as a 0–100 percentage (0 when everything is 0). */
const pct = (n: number, max: number) => (max ? Math.round((n / max) * 100) : 0);

function dayBars(days: { day: string; n: number }[]): HTMLElement {
  const max = Math.max(0, ...days.map((d) => d.n));
  const row = el('div', { class: 'stats-bars', role: 'img', 'aria-label': t('admin.stats.titulo_dias') });
  for (const d of days) {
    const label = `${fecha(`${d.day}T12:00:00Z`, 'UTC')}: ${d.n}`;
    const bar = el('span', { class: 'stats-bar', title: label });
    bar.style.setProperty('--h', `${pct(d.n, max)}%`);
    row.append(bar);
  }
  return row;
}

function weekTable(grid: number[][]): HTMLElement {
  const names = t('admin.stats.dias_semana').split(',');
  const max = Math.max(0, ...grid.flat());
  const table = el('table', { class: 'stats-grid' });
  table.append(el('caption', { class: 'sr-only' }, t('admin.stats.titulo_semana')));
  const head = el('tr');
  head.append(el('th', { scope: 'col' }));
  for (let h = 0; h < 24; h++) head.append(el('th', { scope: 'col' }, String(h)));
  table.append(el('thead'), el('tbody'));
  table.tHead!.append(head);
  grid.forEach((hours, w) => {
    const tr = el('tr');
    tr.append(el('th', { scope: 'row' }, names[w] ?? String(w)));
    for (const n of hours) {
      const td = el('td', { title: String(n) }, n ? String(n) : '');
      td.style.setProperty('--a', `${pct(n, max)}%`);
      tr.append(td);
    }
    table.tBodies[0].append(tr);
  });
  return table;
}

export async function renderStats(root: HTMLElement): Promise<void> {
  root.replaceChildren(el('p', { class: 'muted' }, t('admin.cargando')));
  const res = await loadStats(DAYS);
  const tz = userTimeZone();
  const link = el('p', { class: 'small' });
  link.append(el('a', { href: CF_DASHBOARD, rel: 'noopener', target: '_blank' }, t('admin.stats.visitas_enlace')));
  const visits = el('p', { class: 'muted small' }, t('admin.stats.visitas'));
  if (res.offline) {
    root.replaceChildren(el('p', { class: 'contrib-msg', role: 'alert' }, t('admin.stats.error')), visits, link);
    return;
  }
  const rows = res.data;
  if (!rows.length) {
    root.replaceChildren(el('p', { class: 'muted' }, t('admin.stats.sin_datos')), visits, link);
    return;
  }
  root.replaceChildren(
    el('h2', {}, t('admin.stats.titulo_dias')),
    el('p', { class: 'muted small' }, t('admin.stats.desde', { fecha: fecha(rows[0].hour, tz) })),
    dayBars(perDay(rows, tz, DAYS, new Date())),
    el('h2', {}, t('admin.stats.titulo_semana')),
    el('div', { class: 'stats-grid-wrap' }),
    visits,
    link,
  );
  root.querySelector('.stats-grid-wrap')!.append(weekTable(weekHourGrid(rows, tz)));
}
