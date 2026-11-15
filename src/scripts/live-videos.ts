/**
 * Live video corrections on edition pages: video reports approved after this
 * page was built (newer than <meta name="amg-tags-at">) hide or move videos at
 * once. One small query; nothing changes when there are none or offline.
 */
import { t } from '../lib/i18n';
import { liveQuery } from '../lib/live';
import type { TagLike } from '../lib/tags';
import { videoDiff, videoThumb, videoUrl, type Video } from '../lib/videos';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Same markup as components/VideoList.astro (the badge only on highlights). */
export function videoCard(v: Video, badge: boolean): HTMLLIElement {
  const li = el('li', 'video');
  Object.assign(li.dataset, { video: v.id, title: v.title, channel: v.channel, kind: v.kind });
  const a = el('a');
  a.href = videoUrl(v.id);
  a.rel = 'noopener';
  a.target = '_blank';
  const frame = el('span', 'vframe');
  const img = el('img');
  img.src = videoThumb(v.id);
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 320;
  img.height = 180;
  frame.append(img);
  a.append(frame);
  if (badge) a.append(el('span', 'badge', t(`videos.tipos.${v.kind}`)));
  a.append(el('span', 't', v.title), el('span', 'muted small', v.channel));
  li.append(a);
  return li;
}

/** Remove and add cards, then fix the count, the lists' visibility and the section's. */
export function applyVideoDiff(sec: HTMLElement, diff: { remove: string[]; add: Video[] }): void {
  for (const id of diff.remove) sec.querySelector(`li[data-video="${CSS.escape(id)}"]`)?.remove();
  const tops = sec.querySelector<HTMLElement>('[data-videos-lista="destacados"]');
  const acts = sec.querySelector<HTMLElement>('[data-videos-lista="actuaciones"]');
  for (const v of diff.add) {
    const top = v.kind !== 'actuacion';
    (top ? tops : acts)?.append(videoCard(v, top));
  }
  const nTop = tops?.querySelectorAll('li[data-video]').length ?? 0;
  const nAct = acts?.querySelectorAll('li[data-video]').length ?? 0;
  if (tops) tops.hidden = nTop === 0;
  const more = acts?.closest<HTMLElement>('details');
  if (more) more.hidden = nAct === 0;
  const summary = sec.querySelector('[data-videos-actuaciones]');
  if (summary) summary.textContent = t('videos.actuaciones', { n: nAct });
  const n = sec.querySelector('[data-videos-n]');
  if (n) n.textContent = String(nTop + nAct);
  sec.hidden = nTop + nAct === 0;
}

async function run(): Promise<void> {
  const sec = document.querySelector<HTMLElement>('[data-videos]');
  if (!sec) return;
  const festival = sec.dataset.festival ?? '';
  const year = Number(sec.dataset.year);
  const since = document.querySelector<HTMLMetaElement>('meta[name="amg-tags-at"]')?.content || '';
  const live = await liveQuery<TagLike[]>(
    (c) => {
      let q = c.from('public_contributions').select('type, festival, year, item_id, payload, reviewed_at, created_at')
        .eq('type', 'report').eq('payload->>objetivo', 'video');
      if (since) q = q.gt('reviewed_at', since);
      return q.order('reviewed_at', { ascending: true }).limit(2000);
    },
    [],
  );
  if (live.offline || !live.data.length) return;
  const shown = [...sec.querySelectorAll<HTMLElement>('li[data-video]')].map((li) => li.dataset.video ?? '');
  const diff = videoDiff(festival, year, shown, live.data);
  if (diff.remove.length || diff.add.length) applyVideoDiff(sec, diff);
}

if (typeof document !== 'undefined') void run();
