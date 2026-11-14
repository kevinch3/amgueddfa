import { currentProfile } from '../lib/auth';
import { submit, TRANSCRIPTION_MAX, YEAR_MAX, YEAR_MIN } from '../lib/contrib';
import { t } from '../lib/i18n';
import type { FestivalSlug } from '../lib/types';
import { busy, categoryOptions, el, festivalOptions, field, gate, gateMessage, select } from './ui';

type Ctx = { festival: FestivalSlug; year: number | null; item: string };

const status = (): HTMLParagraphElement => el('p', { class: 'contrib-msg', role: 'alert' });
/** Thank-you line; admins' contributions are approved on insert, so they read "published". */
const thanks = async (): Promise<HTMLParagraphElement> =>
  el('p', { class: 'contrib-ok', role: 'status' }, t((await currentProfile())?.role === 'admin' ? 'tarea.gracias_admin' : 'tarea.gracias'));

/** "¿El año es correcto?": Sí sends a confirming tag; No opens year / category / festival. */
function yearTask(ctx: Ctx): HTMLElement {
  const box = el('div', { class: 'tarea-bloque' });
  const q = el('p', { class: 'tarea-q' }, ctx.year ? t('tarea.ano_pregunta', { year: ctx.year }) : t('tarea.ano_pregunta_sin'));
  const msg = status();
  const actions = el('p', { class: 'tarea-acciones' });
  box.append(q, actions, msg);

  const send = async (btn: HTMLButtonElement, idle: string, input: Record<string, unknown>) => {
    msg.textContent = '';
    const r = await busy(btn, idle, () => submit('tag', ctx.festival, ctx.year, ctx.item, input));
    if (r.ok) box.replaceChildren(await thanks());
    else msg.textContent = t(r.key);
  };

  if (ctx.year) {
    const yes = el('button', { type: 'button', class: 'btn' }, t('tarea.si'));
    yes.addEventListener('click', () => send(yes, t('tarea.si'), { year: ctx.year }));
    actions.append(yes, ' ');
  }
  const no = el('button', { type: 'button', class: ctx.year ? 'btn btn-quiet' : 'btn' }, ctx.year ? t('tarea.no') : t('tarea.ano_label'));
  actions.append(no);

  no.addEventListener('click', () => {
    const form = el('form', { class: 'tarea-form', novalidate: '' });
    const yr = el('input', {
      id: `tarea-ano-${ctx.item}`, type: 'number', inputmode: 'numeric', min: String(YEAR_MIN), max: String(YEAR_MAX), step: '1',
    });
    const cat = select(`tarea-cat-${ctx.item}`, categoryOptions(), t('tarea.sin_cambio'));
    const fest = select(`tarea-fest-${ctx.item}`, festivalOptions(), t('tarea.sin_cambio'));
    const go = el('button', { type: 'submit', class: 'btn' }, t('tarea.enviar'));
    form.append(
      el('p', { class: 'muted small' }, t('tarea.corregir_ayuda')),
      field(t('tarea.ano_label'), yr),
      field(t('tarea.categoria_label'), cat),
      field(t('tarea.festival_label'), fest),
      go,
    );
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (go.disabled) return;
      void send(go, t('tarea.enviar'), { year: yr.value, category: cat.value, festival: fest.value });
    });
    actions.replaceWith(form);
    yr.focus();
  });
  return box;
}

/** "Transcribir": a textarea for the document's text. */
function transcribeTask(ctx: Ctx): HTMLElement {
  const box = el('div', { class: 'tarea-bloque' });
  const open = el('button', { type: 'button', class: 'btn btn-quiet' }, t('tarea.transcribir'));
  box.append(open);
  open.addEventListener('click', () => {
    const form = el('form', { class: 'tarea-form', novalidate: '' });
    const id = `tarea-texto-${ctx.item}`;
    const ta = el('textarea', { id, rows: '8', maxlength: String(TRANSCRIPTION_MAX), 'aria-describedby': `${id}-ayuda` });
    const msg = status();
    const go = el('button', { type: 'submit', class: 'btn' }, t('tarea.enviar'));
    const cancel = el('button', { type: 'button', class: 'btn btn-quiet' }, t('tarea.cancelar'));
    form.append(
      el('p', { class: 'muted small', id: `${id}-ayuda` }, `${t('tarea.transcribir_ayuda')} ${t('contrib.caracteres_transcripcion')}`),
      field(t('tarea.texto_label'), ta),
      el('p', { class: 'tarea-acciones' }),
      msg,
    );
    form.querySelector('.tarea-acciones')!.append(go, ' ', cancel);
    cancel.addEventListener('click', () => {
      form.replaceWith(open);
      open.focus();
    });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (go.disabled) return;
      msg.textContent = '';
      const r = await busy(go, t('tarea.enviar'), () => submit('transcription', ctx.festival, ctx.year, ctx.item, { text: ta.value }));
      if (r.ok) form.replaceWith(await thanks());
      else msg.textContent = t(r.key);
    });
    open.replaceWith(form);
    ta.focus();
  });
  return box;
}

async function hydrate(): Promise<void> {
  const root = document.getElementById('tarea');
  if (!root) return;
  const ctx: Ctx = {
    festival: root.dataset.festival as FestivalSlug,
    year: root.dataset.year ? Number(root.dataset.year) : null,
    item: root.dataset.item ?? '',
  };
  if (!ctx.item) return;
  const g = await gate();
  if (!g.profile) {
    root.replaceChildren(gateMessage(g.reason, 'tarea.ingresar'));
    return;
  }
  root.replaceChildren(yearTask(ctx), transcribeTask(ctx));
}

void hydrate();
document.addEventListener('amg:sesion', () => void hydrate());
