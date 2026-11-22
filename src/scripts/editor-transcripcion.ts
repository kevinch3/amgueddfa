/**
 * Edit mode in the video player (components/VideoPlayer.astro; wired by scripts/reproductor.ts): a signed-in
 * collaborator corrects a Chubut or Trevelin transcript line by line (a ✎ control beside each line's seek button opens
 * that line's editor), removes a garbage line, sets a line's language, or adds a missed line at the video's current
 * time, and sends it all as ONE `video_text` contribution that the maintainer reviews in /admin/
 * (docs/superpowers/specs/2026-11-22-video-transcript-corrections-design.md, "Player: edit mode for collaborators").
 *
 * A thin DOM layer: what to draw comes from lib/transcript-draft.ts (pure, tested). The draft is saved per video in
 * localStorage after every change, so closing the player or the tab loses nothing; reopening the video resumes it.
 * The author's own pending changes show with a dashed mark (their rows only, read by RLS; nobody else sees them).
 */
import { ownPendingVideo, submit, type Contribution } from '../lib/contrib';
import { t } from '../lib/i18n';
import {
  addNueva, cambioTexto, cambiosLabel, clearDraft, countCambios, editControls, editorAccess, emptyDraft, enviarLabel,
  fitDraft, lineIdioma, loadDraft, nuevaIdioma, nuevaTexto, pendingMarks, removeNueva, saveDraft, sendDraft, setLine,
  undoLine, type Draft, type Idioma,
} from '../lib/transcript-draft';
import { fmtTime, lineAt, type Transcript } from '../lib/video-transcript';
import { busy, el, gate, gateMessage, thanks, type Gate } from './ui';

export type EditorVideo = { id: string; title: string; festival: string; year: number };
export type EditorState = { tr: Transcript | null; video: EditorVideo | null; currentTime: () => number };

/** The event scripts/reproductor.ts sends on the dialog each time it (re)draws the transcript lines. */
export const LINEAS_EVENT = 'rep:lineas';
/** Sent once the open video's text is final (the approved corrections drawn, or none to come). Edit mode starts only
 * then: a draft fitted to the bare file would take a line an approved correction changed (or added) for gone. */
export const ASENTADA_EVENT = 'rep:asentada';
/** Set on the list while a line's editor (or the new-line form) is open: the player then stops scrolling to follow the video. */
export const EDITANDO = 'data-editando';

/** A language choice (Español / Cymraeg), each name in its own language. */
function idiomaField(name: string, value: Idioma | null): { field: HTMLFieldSetElement; inputs: HTMLInputElement[]; get: () => Idioma | null } {
  const field = el('fieldset', { class: 'rep-ed-idioma' });
  field.append(el('legend', {}, t('editor.idioma')));
  const inputs = (['es', 'cy'] as const).map((v) => {
    const r = el('input', { type: 'radio', name, id: `${name}-${v}`, value: v });
    r.checked = v === value;
    const label = el('label', { for: r.id, class: 'opt' });
    label.append(r, ' ', el('span', { lang: v }, t(`editor.${v}`)));
    field.append(label);
    return r;
  });
  return { field, inputs, get: () => (inputs.find((r) => r.checked)?.value as Idioma | undefined) ?? null };
}

function textField(id: string, value: string, lang: string | null): { box: HTMLDivElement; input: HTMLInputElement } {
  const input = el('input', { id, type: 'text', maxlength: '500', autocomplete: 'off' });
  input.value = value;
  if (lang) input.lang = lang;
  const box = el('div', { class: 'campo' });
  box.append(el('label', { for: id }, t('editor.texto')), input);
  return { box, input };
}

export function wireEditor(dialog: HTMLDialogElement, getState: () => EditorState): void {
  const q = <T extends HTMLElement = HTMLElement>(s: string) => dialog.querySelector<T>(s);
  // Only Chubut and Trevelin pages render the edit mode (asserted non-null for the closures below; checked here).
  const boton = q<HTMLButtonElement>('[data-rep-editar]')!;
  const gateBox = q('[data-rep-editar-gate]')!;
  const panel = q('[data-rep-editor]')!;
  const lines = q<HTMLOListElement>('[data-rep-lineas]')!;
  if (!boton || !gateBox || !panel || !lines) return;
  const counter = q('[data-editor-n]')!;
  const agregar = q<HTMLButtonElement>('[data-editor-agregar]')!;
  const nuevaBox = q('[data-editor-nueva]')!;
  const enviar = q<HTMLButtonElement>('[data-editor-enviar]')!;
  const cancelar = q<HTMLButtonElement>('[data-editor-cancelar]')!;
  const confirmar = q('[data-editor-confirmar]')!;
  const descartar = q<HTMLButtonElement>('[data-editor-descartar]')!;
  const seguir = q<HTMLButtonElement>('[data-editor-seguir]')!;
  const msg = q('[data-editor-msg]')!;
  const estado = q('[data-editor-estado]')!;

  /** The video whose lines are drawn, and whether its visitor may edit it. */
  let shown: string | null = null;
  let puede = false;
  /** Whether the text of the video drawn is final (ASENTADA_EVENT). */
  let asentada = false;
  /** The draft while in edit mode; null outside it. */
  let draft: Draft | null = null;
  /** The line whose editor is open. */
  let abierta: number | null = null;
  let pend: Contribution[] = [];
  let timer = 0;
  /** When Escape last closed an editor (some browsers still send the dialog's cancel after it). */
  let escaped = 0;
  let gating: Promise<Gate> | null = null;
  const pendientes = new Map<string, Promise<Contribution[]>>();

  const items = () => lines.children as HTMLCollectionOf<HTMLLIElement>;
  const state = () => getState();
  /** Who is editing, asked once per page view (again after an offline answer). */
  const who = (): Promise<Gate> =>
    (gating ??= gate().then((g) => {
      if (!g.profile && g.reason === 'offline') gating = null;
      return g;
    }));
  const syncEditando = () => lines.toggleAttribute(EDITANDO, abierta !== null || !nuevaBox.hidden);

  // ---- The author's pending changes (always shown to them, edit mode or not) ----

  function paintPending(): void {
    for (const x of lines.querySelectorAll('.rep-pend')) x.remove();
    for (const li of lines.querySelectorAll('[data-pendiente]')) li.removeAttribute('data-pendiente');
    const tr = state().tr;
    if (!tr || !pend.length) return;
    const li = items();
    const m = pendingMarks(tr, pend);
    for (const [k, p] of Object.entries(m.lineas)) {
      const x = li[Number(k)];
      if (!x) continue;
      x.dataset.pendiente = '';
      x.append(el('p', { class: 'rep-pend' }, t('editor.pendiente', { cambio: cambioTexto(p) })));
    }
    for (const n of m.nuevas) {
      const x = li[Math.max(0, n.despues)];
      if (!x) continue;
      x.append(el('p', { class: 'rep-pend', 'data-pendiente-nueva': '' }, t('editor.pendiente', { cambio: nuevaTexto(n) })));
    }
  }

  function loadPending(id: string, fresh = false): void {
    if (fresh) pendientes.delete(id);
    let p = pendientes.get(id);
    if (!p) pendientes.set(id, (p = ownPendingVideo(id)));
    void p.then((rows) => {
      if (shown !== id) return;
      pend = rows;
      paintPending();
    });
  }

  // ---- Edit mode on the lines ----

  /** The ✎ controls, lyric notes and the draft's marks; without a draft, none (and the lines as the player drew them). */
  function paintEdit(): void {
    for (const x of lines.querySelectorAll('.rep-ed-x')) x.remove();
    for (const li of lines.querySelectorAll('[data-cambiado]')) li.removeAttribute('data-cambiado');
    abierta = null;
    syncEditando();
    const tr = state().tr;
    lines.toggleAttribute('data-modo-edicion', !!(draft && tr));
    if (!draft || !tr) return;
    const li = items();
    for (const c of editControls(tr)) {
      const x = li[c.i];
      if (!x) continue;
      if (c.editable) {
        const lapiz = el('button', {
          type: 'button', class: 'rep-ed-lapiz rep-ed-x', 'data-editar-linea': String(c.i),
          'aria-label': t('editor.editar_linea', { tiempo: fmtTime(c.t) }), 'aria-expanded': 'false',
        }, '✎');
        // Right after the seek button, before any note (the author's pending one is drawn first): beside it, and next in tab order.
        const seek = x.querySelector('button[data-i]');
        if (seek) seek.after(lapiz);
        else x.append(lapiz);
      } else if (c.nota) x.append(el('p', { class: 'rep-ed-nota rep-ed-x' }, t('editor.letra')));
    }
    for (const k of Object.keys(draft.lines)) paintLine(Number(k));
    paintNuevas();
  }

  /** Line i's mark: highlighted, with what the draft changes ("→ «…»"). */
  function paintLine(i: number): void {
    const li = items()[i];
    if (!li || !draft) return;
    li.querySelector('.rep-ed-cambio')?.remove();
    const e = draft.lines[i];
    if (!e) {
      li.removeAttribute('data-cambiado');
      return;
    }
    li.dataset.cambiado = e.quitar ? 'quitar' : e.texto !== undefined ? 'texto' : 'idioma';
    const nota = el('p', { class: 'rep-ed-cambio rep-ed-x' }, `→ ${cambioTexto(e)}`);
    const ed = li.querySelector('.rep-ed');
    if (ed) ed.before(nota);
    else li.append(nota);
  }

  /** The lines the draft adds, each after the line playing at its time, with a way to take it back. */
  function paintNuevas(): void {
    for (const x of lines.querySelectorAll('.rep-ed-nueva')) x.remove();
    const tr = state().tr;
    if (!draft || !tr) return;
    const li = items();
    draft.nuevas.forEach((n, k) => {
      const at = lineAt(tr.seg, n.t);
      const x = li[Math.max(0, at)];
      if (!x) return;
      const box = el('div', { class: 'rep-ed-nueva rep-ed-x' });
      const texto = `${nuevaTexto(n)} · ${t(`editor.${n.idioma}`)}`;
      box.append(el('span', {}, texto), el('button', {
        type: 'button', class: 'btn-link small', 'data-nueva-quitar': String(k), 'aria-label': `${t('editor.deshacer')}: ${texto}`,
      }, t('editor.deshacer')));
      x.append(box);
    });
  }

  function paintBar(): void {
    const tr = state().tr;
    const n = tr && draft ? countCambios(tr, draft) : 0;
    counter.textContent = cambiosLabel(n);
    enviar.textContent = enviarLabel(n);
    enviar.disabled = n === 0;
  }

  /** "+ Agregar una línea en 1:23", at the video's time (not while focused: its label would keep changing). */
  function paintAgregar(): void {
    if (document.activeElement === agregar && agregar.textContent) return;
    agregar.textContent = t('editor.agregar', { tiempo: fmtTime(state().currentTime()) });
  }

  function save(d: Draft): void {
    draft = d;
    saveDraft(d);
    paintBar();
  }

  function closeLine(focus: boolean): void {
    if (abierta === null) return;
    const i = abierta;
    abierta = null;
    lines.querySelector('.rep-ed')?.remove();
    const lapiz = lines.querySelector<HTMLButtonElement>(`[data-editar-linea="${i}"]`);
    lapiz?.setAttribute('aria-expanded', 'false');
    syncEditando();
    if (focus) lapiz?.focus();
  }

  /** Line i's editor, under it: its words, its language, "Quitar esta línea", OK / Deshacer. */
  function openLine(i: number): void {
    const tr = state().tr;
    const li = items()[i];
    const seg = tr?.seg[i];
    if (!tr || !draft || !li || !seg) return;
    closeLine(false);
    closeNueva(false);
    const e = draft.lines[i];
    const idioma = e?.idioma ?? lineIdioma(tr, i);
    const box = el('div', { class: 'rep-ed rep-ed-x', role: 'group', 'aria-label': t('editor.editar_linea', { tiempo: fmtTime(seg[0]) }) });
    const { box: campo, input } = textField('rep-ed-texto', e?.texto ?? seg[1], idioma);
    const lang = idiomaField('rep-ed-idioma', idioma);
    const quitar = el('input', { type: 'checkbox', id: 'rep-ed-quitar' });
    quitar.checked = !!e?.quitar;
    const quitarLabel = el('label', { for: quitar.id, class: 'opt' });
    quitarLabel.append(quitar, ' ', t('editor.quitar'));
    const err = el('p', { class: 'contrib-msg', role: 'alert' });
    const ok = el('button', { type: 'button', class: 'btn' }, t('editor.ok'));
    const undo = el('button', { type: 'button', class: 'btn btn-quiet' }, t('editor.deshacer'));
    const acciones = el('p', { class: 'tarea-acciones' });
    acciones.append(ok, undo);
    // Removing the line leaves nothing else to set.
    const sync = () => {
      input.disabled = quitar.checked;
      for (const r of lang.inputs) r.disabled = quitar.checked;
    };
    quitar.addEventListener('change', sync);
    sync();
    for (const r of lang.inputs) r.addEventListener('change', () => (input.lang = lang.get() ?? ''));
    ok.addEventListener('click', () => {
      if (!quitar.checked && !input.value.trim()) {
        err.textContent = t('contrib.error.video_texto');
        input.focus();
        return;
      }
      const cur = state().tr;
      if (!draft || !cur) return;
      save(setLine(cur, draft, i, { texto: input.value, idioma: lang.get(), quitar: quitar.checked }));
      closeLine(true);
      paintLine(i);
    });
    undo.addEventListener('click', () => {
      if (!draft) return;
      save(undoLine(draft, i));
      closeLine(true);
      paintLine(i);
    });
    box.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault(); // closes this line's editor, not the player
        ev.stopPropagation();
        escaped = Date.now();
        closeLine(true);
      } else if (ev.key === 'Enter' && ev.target === input) {
        ev.preventDefault();
        ok.click();
      }
    });
    box.append(campo, lang.field, quitarLabel, err, acciones);
    li.append(box);
    abierta = i;
    lines.querySelector(`[data-editar-linea="${i}"]`)?.setAttribute('aria-expanded', 'true');
    syncEditando();
    input.focus();
  }

  function closeNueva(focus: boolean): void {
    if (nuevaBox.hidden) return;
    nuevaBox.hidden = true;
    nuevaBox.replaceChildren();
    syncEditando();
    if (focus) agregar.focus();
  }

  /** The form for a line added at the video's current time (pause it where the speech starts). */
  function openNueva(): void {
    const { tr, currentTime } = state();
    if (!tr || !draft) return;
    closeLine(false);
    closeNueva(false);
    const at = Math.max(0, Math.round(currentTime() * 10) / 10);
    const idioma = nuevaIdioma(tr, at);
    const box = el('div', { class: 'rep-ed', role: 'group', 'aria-label': t('editor.nueva', { tiempo: fmtTime(at) }) });
    const { box: campo, input } = textField('rep-ed-nueva-texto', '', idioma);
    const lang = idiomaField('rep-ed-nueva-idioma', idioma);
    for (const r of lang.inputs) r.addEventListener('change', () => (input.lang = lang.get() ?? ''));
    const err = el('p', { class: 'contrib-msg', role: 'alert' });
    const ok = el('button', { type: 'button', class: 'btn' }, t('editor.ok'));
    const undo = el('button', { type: 'button', class: 'btn btn-quiet' }, t('editor.deshacer'));
    const acciones = el('p', { class: 'tarea-acciones' });
    acciones.append(ok, undo);
    ok.addEventListener('click', () => {
      const idi = lang.get();
      if (!input.value.trim() || !idi) {
        err.textContent = t('contrib.error.video_texto');
        input.focus();
        return;
      }
      if (!draft) return;
      save(addNueva(draft, { t: at, texto: input.value, idioma: idi }));
      closeNueva(true);
      paintNuevas();
    });
    undo.addEventListener('click', () => closeNueva(true));
    box.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        escaped = Date.now();
        closeNueva(true);
      } else if (ev.key === 'Enter' && ev.target === input) {
        ev.preventDefault();
        ok.click();
      }
    });
    box.append(el('p', { class: 'tarea-q' }, t('editor.nueva', { tiempo: fmtTime(at) })), campo, lang.field, err, acciones);
    nuevaBox.replaceChildren(box);
    nuevaBox.hidden = false;
    syncEditando();
    input.focus();
  }

  /** Into edit mode, resuming this video's saved draft (each change back on its own line). */
  function enter(focus: boolean): void {
    const { tr, video } = state();
    if (!tr || !video || draft || !asentada) return;
    const saved = loadDraft(video.id);
    const fit = saved ? fitDraft(tr, saved) : { draft: emptyDraft(video.id, tr.exportado), descartados: 0 };
    draft = fit.draft;
    if (fit.descartados) saveDraft(draft);
    msg.textContent = fit.descartados ? t('editor.descartados', { n: fit.descartados }) : '';
    estado.replaceChildren();
    confirmar.hidden = true;
    panel.hidden = false;
    boton.hidden = true;
    paintEdit();
    paintBar();
    paintAgregar();
    window.clearInterval(timer);
    timer = window.setInterval(paintAgregar, 1000);
    if (focus) panel.focus();
  }

  /** Out of edit mode; the draft stays saved unless it was sent or discarded. */
  function leave(focusBoton: boolean): void {
    draft = null;
    window.clearInterval(timer);
    closeNueva(false);
    panel.hidden = true;
    confirmar.hidden = true;
    msg.textContent = '';
    paintEdit();
    boton.hidden = !(puede && asentada);
    if (focusBoton && !boton.hidden) boton.focus();
  }

  /** The edit button once the visitor may edit and the text is final; an unsent draft resumes then. */
  function ready(): void {
    if (!puede || !asentada || draft || !shown) return;
    boton.hidden = false;
    if (loadDraft(shown)) enter(false); // back to where the collaborator left it
  }

  /** The edit button, the sign-in link, or nothing, for the video just drawn; its own pending changes; its draft. */
  async function offer(tr: Transcript, video: EditorVideo): Promise<void> {
    if (!editorAccess(video.festival, tr, { profile: true }).boton) return; // not a Chubut or Trevelin video
    const g = await who();
    if (shown !== video.id) return;
    const a = editorAccess(video.festival, tr, g);
    if (a.ingresar) {
      // Signing in comes back to this video (the address names it: #v=<id>&t=…).
      gateBox.replaceChildren(gateMessage(a.ingresar, 'editor.ingresar', location.pathname + location.search + location.hash));
      gateBox.hidden = false;
    }
    puede = a.boton;
    if (!puede) return;
    loadPending(video.id);
    ready();
  }

  dialog.addEventListener(LINEAS_EVENT, () => {
    const { tr, video } = state();
    const id = tr && video ? video.id : null;
    if (id !== shown) {
      // Another video (or none): out of edit mode, the button and link asked again.
      if (draft) leave(false);
      shown = id;
      puede = false;
      asentada = false;
      pend = [];
      boton.hidden = true;
      gateBox.hidden = true;
      gateBox.replaceChildren();
      estado.replaceChildren();
      if (id) void offer(tr!, video!);
      return;
    }
    if (!id) return;
    // The same video drawn again (approved corrections arrived): every mark back on the new lines, the draft on its lines.
    const lost = abierta !== null && !dialog.contains(document.activeElement);
    if (draft && asentada) {
      const fit = fitDraft(tr!, draft);
      if (fit.descartados) {
        save(fit.draft);
        msg.textContent = t('editor.descartados', { n: fit.descartados });
      } else draft = fit.draft;
    }
    paintPending();
    paintEdit();
    paintBar();
    if (lost && draft) panel.focus();
  });

  dialog.addEventListener(ASENTADA_EVENT, () => {
    const { tr, video } = state();
    if (!tr || !video || video.id !== shown) return;
    asentada = true;
    ready();
  });

  boton.addEventListener('click', () => enter(true));
  agregar.addEventListener('click', openNueva);
  agregar.addEventListener('blur', paintAgregar);

  lines.addEventListener('click', (ev) => {
    const x = ev.target as HTMLElement | null;
    const lapiz = x?.closest<HTMLElement>('[data-editar-linea]');
    if (lapiz) {
      const i = Number(lapiz.dataset.editarLinea);
      if (abierta === i) closeLine(true);
      else openLine(i);
      return;
    }
    const quita = x?.closest<HTMLElement>('[data-nueva-quitar]');
    if (quita && draft) {
      save(removeNueva(draft, Number(quita.dataset.nuevaQuitar)));
      paintNuevas();
      agregar.focus();
    }
  });

  enviar.addEventListener('click', async () => {
    const { tr, video } = state();
    if (!tr || !video || !draft || enviar.disabled) return;
    msg.textContent = '';
    closeLine(false);
    closeNueva(false);
    const r = await busy(enviar, enviarLabel(countCambios(tr, draft)), () => sendDraft(tr, draft!, video, submit));
    if (!r.ok) {
      msg.textContent = t(r.key);
      paintBar();
      return;
    }
    if (shown !== video.id) return; // the visitor moved on; the draft of that video is cleared all the same
    leave(true);
    estado.replaceChildren(await thanks());
    loadPending(video.id, true);
  });

  // "Cancelar" asks in the page before discarding anything.
  cancelar.addEventListener('click', () => {
    const { tr } = state();
    if (!draft || !tr) return;
    if (!countCambios(tr, draft)) {
      clearDraft(draft.video);
      leave(true);
      return;
    }
    confirmar.hidden = false;
    seguir.focus();
  });
  descartar.addEventListener('click', () => {
    if (draft) clearDraft(draft.video);
    leave(true);
  });
  seguir.addEventListener('click', () => {
    confirmar.hidden = true;
    cancelar.focus();
  });

  // Escape inside an open editor closes that editor, not the player.
  dialog.addEventListener('cancel', (ev) => {
    if (abierta === null && nuevaBox.hidden && Date.now() - escaped > 300) return;
    ev.preventDefault();
    if (abierta !== null) closeLine(true);
    else closeNueva(true);
  });
  dialog.addEventListener('close', () => {
    if (draft) leave(false);
    shown = null;
    puede = false;
    asentada = false;
    boton.hidden = true;
    gateBox.hidden = true;
  });
}
