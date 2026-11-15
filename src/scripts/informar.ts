/**
 * "Informar un error" (a report: what is wrong, why, and the fix) and
 * "Agregar información" (a note on a document). The forms are shared by the
 * video dialog on edition pages (wired here) and the document box (tarea.ts).
 */
import { PROBLEMAS, REPORT_MAX, submit, YEAR_MAX, YEAR_MIN, type Problema } from '../lib/contrib';
import { t } from '../lib/i18n';
import type { FestivalSlug } from '../lib/types';
import { busy, categoryOptions, el, festivalOptions, field, gate, gateMessage, select, thanks } from './ui';

export type VideoRef = { id: string; title: string; channel: string; kind: string };
export type ReportTarget =
  | { objetivo: 'documento'; item: string; festival: FestivalSlug; year: number | null; category: string }
  | { objetivo: 'video'; video: VideoRef; festival: FestivalSlug; year: number };

let seq = 0;

function textArea(id: string): HTMLTextAreaElement {
  return el('textarea', { id, rows: '5', maxlength: String(REPORT_MAX), 'aria-describedby': `${id}-ayuda` });
}

function actions(go: HTMLButtonElement, cancel: HTMLButtonElement | null): HTMLParagraphElement {
  const p = el('p', { class: 'tarea-acciones' });
  p.append(go);
  if (cancel) p.append(' ', cancel);
  return p;
}

/** The report form; `onDone` gets the thank-you line, `onCancel` (if given) adds a Cancelar button. */
export function reportForm(target: ReportTarget, onDone: (msg: HTMLElement) => void, onCancel?: () => void): HTMLFormElement {
  const n = ++seq;
  const form = el('form', { class: 'tarea-form informar-form', novalidate: '' });
  const doc = target.objetivo === 'documento';

  const set = el('fieldset', { class: 'campo' });
  set.append(el('legend', {}, t('informar.pregunta')));
  const radios = new Map<Problema, HTMLInputElement>();
  for (const p of PROBLEMAS) {
    const id = `informar-${n}-${p}`;
    const r = el('input', { type: 'radio', name: `informar-${n}-problema`, id, value: p });
    const label = el('label', { for: id, class: 'opt' });
    label.append(r, ' ', t(p === 'otra_edicion' && doc ? 'informar.otra_edicion_documento' : `informar.${p}`));
    set.append(label);
    radios.set(p, r);
  }

  // The fix, only for "otra edición": what changes, nothing else.
  const fix = el('div', { class: 'informar-arreglo' });
  fix.hidden = true;
  const fest = select(`informar-${n}-festival`, festivalOptions(), t('informar.sin_cambio'));
  const yr = el('input', { id: `informar-${n}-ano`, type: 'number', inputmode: 'numeric', min: String(YEAR_MIN), max: String(YEAR_MAX), step: '1' });
  const cat = doc ? select(`informar-${n}-seccion`, categoryOptions(), t('informar.sin_cambio')) : null;
  fix.append(el('p', { class: 'muted small' }, t('informar.arreglo_ayuda')), field(t('informar.eisteddfod_label'), fest), field(t('informar.ano_label'), yr));
  if (cat) fix.append(field(t('informar.seccion_label'), cat));
  set.addEventListener('change', () => { fix.hidden = !radios.get('otra_edicion')!.checked; });

  const taId = `informar-${n}-texto`;
  const ta = textArea(taId);
  const msg = el('p', { class: 'contrib-msg', role: 'alert' });
  const go = el('button', { type: 'submit', class: 'btn' }, t('informar.enviar'));
  const cancel = onCancel ? el('button', { type: 'button', class: 'btn btn-quiet' }, t('informar.cancelar')) : null;
  cancel?.addEventListener('click', () => onCancel!());

  form.append(
    set, fix,
    field(t('informar.texto_label'), ta),
    el('p', { class: 'muted small', id: `${taId}-ayuda` }, t('informar.texto_ayuda')),
    actions(go, cancel), msg,
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (go.disabled) return;
    msg.textContent = '';
    const problema = [...radios].find(([, r]) => r.checked)?.[0] ?? '';
    const input: Record<string, unknown> = {
      objetivo: target.objetivo, problema, texto: ta.value,
      arreglo: { festival: fest.value, year: yr.value, ...(cat ? { category: cat.value } : {}) },
      actual: { festival: target.festival, year: target.year, ...(doc ? { category: target.category } : {}) },
    };
    if (target.objetivo === 'video') input.video = target.video;
    const r = await busy(go, t('informar.enviar'), () =>
      submit('report', target.festival, target.year, doc ? target.item : null, input));
    if (r.ok) onDone(await thanks());
    else msg.textContent = t(r.key);
  });
  return form;
}

/** "Agregar información": a note on a document, public once approved. */
export function noteForm(ctx: { item: string; festival: FestivalSlug; year: number | null }, onDone: (msg: HTMLElement) => void, onCancel?: () => void): HTMLFormElement {
  const n = ++seq;
  const form = el('form', { class: 'tarea-form', novalidate: '' });
  const taId = `nota-${n}-texto`;
  const ta = textArea(taId);
  const msg = el('p', { class: 'contrib-msg', role: 'alert' });
  const go = el('button', { type: 'submit', class: 'btn' }, t('informar.enviar'));
  const cancel = onCancel ? el('button', { type: 'button', class: 'btn btn-quiet' }, t('informar.cancelar')) : null;
  cancel?.addEventListener('click', () => onCancel!());
  form.append(
    field(t('informar.nota_label'), ta),
    el('p', { class: 'muted small', id: `${taId}-ayuda` }, t('informar.nota_ayuda')),
    actions(go, cancel), msg,
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (go.disabled) return;
    msg.textContent = '';
    const r = await busy(go, t('informar.enviar'), () => submit('note', ctx.festival, ctx.year, ctx.item, { text: ta.value }));
    if (r.ok) onDone(await thanks());
    else msg.textContent = t(r.key);
  });
  return form;
}

/** A quiet button that opens `make()` in its place; Cancelar puts the button back. */
export function opener(label: string, make: (done: (m: HTMLElement) => void, cancel: () => void) => HTMLFormElement): HTMLElement {
  const box = el('div', { class: 'tarea-bloque' });
  const open = el('button', { type: 'button', class: 'btn btn-quiet' }, label);
  box.append(open);
  open.addEventListener('click', () => {
    const form = make(
      (m) => form.replaceWith(m),
      () => { form.replaceWith(open); open.focus(); },
    );
    form.prepend(el('p', { class: 'tarea-q' }, label)); // the button's label stays as the form's heading
    open.replaceWith(form);
    form.querySelector<HTMLElement>('input, textarea')?.focus();
  });
  return box;
}

/** Edition pages: every video's "Informar un error" opens the one dialog, filled for that video. */
function wireDialog(): void {
  const dialog = document.getElementById('informar-dialogo') as HTMLDialogElement | null;
  const sec = document.querySelector<HTMLElement>('[data-videos]');
  if (!dialog || !sec || typeof dialog.showModal !== 'function') return;
  const body = dialog.querySelector<HTMLElement>('[data-informar-cuerpo]')!;
  const about = dialog.querySelector<HTMLElement>('[data-informar-sobre]')!;
  let opener: HTMLElement | null = null;
  dialog.querySelector('[data-informar-cerrar]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { body.replaceChildren(); opener?.focus(); });

  document.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-informar-video]');
    const li = btn?.closest<HTMLElement>('li[data-video]');
    if (!btn || !li) return;
    opener = btn;
    const video: VideoRef = { id: li.dataset.video ?? '', title: li.dataset.title ?? '', channel: li.dataset.channel ?? '', kind: li.dataset.kind ?? '' };
    about.textContent = t('informar.sobre', { titulo: video.title });
    body.replaceChildren(el('p', { class: 'muted' }, t('admin.cargando')));
    dialog.showModal();
    const g = await gate();
    if (!g.profile) {
      body.replaceChildren(gateMessage(g.reason, 'informar.ingresar'));
      return;
    }
    const target: ReportTarget = { objetivo: 'video', video, festival: sec.dataset.festival as FestivalSlug, year: Number(sec.dataset.year) };
    const form = reportForm(target, (m) => body.replaceChildren(m), () => dialog.close());
    body.replaceChildren(el('p', { class: 'muted small' }, t('informar.ayuda')), form);
    form.querySelector<HTMLElement>('input')?.focus();
  });
}

if (typeof document !== 'undefined') wireDialog();
