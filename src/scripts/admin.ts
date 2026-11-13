import {
  approve,
  approveUpload,
  fillsGap,
  loadApprovedUploads,
  loadQueue,
  loadReleased,
  makeAdmin,
  reject,
  releaseItem,
  searchUsers,
  signedUrl,
  type ApprovedLike,
  type GapCtx,
  type Pending,
  type Result,
} from '../lib/admin';
import { currentProfile } from '../lib/auth';
import type { Kind } from '../lib/contrib';
import { t } from '../lib/i18n';
import { url } from '../lib/paths';
import { getClient } from '../lib/supabase';
import { el, gate, loginHref } from './ui';

type Restricted = { id: string; title: string; festival: string; year: number | null; category: string; thumb: string | null; page_paths: string[] };
type Data = { catalog: string[]; approved: ApprovedLike[]; restricted: Restricted[]; titles: Record<string, string> };

const $ = (id: string) => document.getElementById(id) as HTMLElement;

function readData(): Data {
  try {
    return JSON.parse($('admin-data').textContent ?? '{}') as Data;
  } catch {
    return { catalog: [], approved: [], restricted: [], titles: {} };
  }
}

const data = readData();
const gap: GapCtx = { catalog: new Set(data.catalog), approved: [...data.approved] };

function show(msg: HTMLElement, text: string): void {
  msg.textContent = text;
  msg.hidden = !text;
}

async function run(btns: HTMLButtonElement[], msg: HTMLElement, fn: () => Promise<Result>): Promise<boolean> {
  btns.forEach((b) => (b.disabled = true));
  show(msg, t('admin.procesando'));
  let r: Result;
  try {
    r = await fn();
  } catch {
    r = { ok: false, key: 'estado.sin_conexion' };
  }
  btns.forEach((b) => (b.disabled = false));
  show(msg, r.ok ? '' : t(r.key));
  return r.ok;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

/** What the admin may edit in "Editar y aprobar": the payload without internal keys. */
function editable(c: Pending): Record<string, unknown> {
  const { storage_path: _s, media: _m, ...rest } = c.payload ?? {};
  return rest;
}

async function preview(c: Pending, box: HTMLElement): Promise<void> {
  const path = String(c.payload?.storage_path ?? '');
  const signed = await signedUrl(path);
  if (!signed) {
    box.append(el('p', { class: 'muted small' }, t('admin.sin_vista')));
    return;
  }
  if (/\.(jpe?g|png|webp)$/i.test(path)) {
    box.append(el('img', { src: signed, alt: t('admin.vista_previa'), loading: 'lazy' }));
  }
  const p = el('p');
  p.append(el('a', { href: signed, target: '_blank', rel: 'noopener noreferrer' }, t('admin.abrir_original')));
  box.append(p);
}

function card(c: Pending, done: (key: string) => void): HTMLLIElement {
  const li = el('li', { class: 'admin-card' });
  const h = el('h2');
  h.append(el('span', { class: 'badge' }, t(`admin.tipos.${c.type}`)));
  if (c.type === 'upload' && c.payload?.category) h.append(el('span', { class: 'badge' }, t(`categorias.${c.payload.category}`)));
  h.append(c.festival && c.year ? t('admin.edicion', { festival: t(`festivales.${c.festival}`), year: c.year }) : t('admin.sin_edicion'));
  li.append(h);
  li.append(el('p', { class: 'muted small' }, `${t('admin.de', { nombre: c.display_name || t('admin.sin_nombre') })} · ${t('admin.enviado', { fecha: fmtDate(c.created_at) })}`));
  if (c.item_id) {
    const p = el('p', { class: 'small' }, `${t('admin.documento')}: `);
    p.append(el('a', { href: url(`item/${c.item_id}/`) }, data.titles[c.item_id] ?? c.item_id));
    li.append(p);
  }
  li.append(el('pre', {}, JSON.stringify(editable(c), null, 2)));

  const msg = el('p', { class: 'contrib-msg', role: 'alert' });
  msg.hidden = true;
  const actions = el('div', { class: 'acciones' });
  const ok = el('button', { type: 'button', class: 'btn' }, t('admin.aprobar'));
  const no = el('button', { type: 'button', class: 'btn btn-quiet' }, t('admin.rechazar'));
  const btns = [ok, no];
  let gapBox: HTMLInputElement | null = null;

  if (c.type === 'upload') {
    const pv = el('div', { class: 'admin-preview' });
    pv.append(el('h3', { class: 'small' }, t('admin.vista_previa')));
    li.append(pv);
    void preview(c, pv);
    const id = `gap-${c.id}`;
    gapBox = el('input', { type: 'checkbox', id });
    gapBox.checked = fillsGap(c.festival, c.year, String(c.payload?.category ?? ''), gap);
    const lab = el('label', { for: id, class: 'opt' });
    lab.prepend(gapBox);
    lab.append(t('admin.llena_hueco'));
    li.append(lab);
  }
  actions.append(ok, no);

  if (c.type !== 'upload') {
    const edit = el('button', { type: 'button', class: 'btn btn-quiet' }, t('admin.editar_aprobar'));
    btns.push(edit);
    actions.append(edit);
    edit.addEventListener('click', () => {
      const form = el('form', { class: 'tarea-form', novalidate: '' });
      const id = `payload-${c.id}`;
      const ta = el('textarea', { id, rows: '8' });
      ta.value = JSON.stringify(editable(c), null, 2);
      const go = el('button', { type: 'submit', class: 'btn' }, t('admin.guardar_aprobar'));
      const cancel = el('button', { type: 'button', class: 'btn btn-quiet' }, t('admin.cancelar'));
      const row = el('div', { class: 'acciones' });
      row.append(go, cancel);
      form.append(el('label', { for: id }, t('admin.payload_label')), ta, row);
      cancel.addEventListener('click', () => form.replaceWith(actions));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        let parsed: unknown;
        try {
          parsed = JSON.parse(ta.value);
        } catch {
          parsed = null;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          show(msg, t('admin.error.json'));
          return;
        }
        if (await run([go, cancel], msg, () => approve(c, parsed as Record<string, unknown>))) done('admin.aprobado');
      });
      actions.replaceWith(form);
      ta.focus();
    });
  }

  ok.addEventListener('click', async () => {
    const fn = c.type === 'upload'
      ? () => approveUpload(c, { gap, fillsGap: gapBox?.checked })
      : () => approve(c, null);
    if (await run(btns, msg, fn)) {
      if (c.type === 'upload') gap.approved.push({ type: 'upload', festival: c.festival, year: c.year, payload: c.payload });
      done('admin.aprobado');
    }
  });

  no.addEventListener('click', () => {
    const form = el('form', { class: 'tarea-form', novalidate: '' });
    const id = `motivo-${c.id}`;
    const inp = el('input', { id, type: 'text', maxlength: '500', required: '' });
    const go = el('button', { type: 'submit', class: 'btn' }, t('admin.confirmar_rechazo'));
    const cancel = el('button', { type: 'button', class: 'btn btn-quiet' }, t('admin.cancelar'));
    const row = el('div', { class: 'acciones' });
    row.append(go, cancel);
    form.append(el('label', { for: id }, t('admin.motivo_label')), inp, row);
    cancel.addEventListener('click', () => form.replaceWith(actions));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (await run([go, cancel], msg, () => reject(c, inp.value))) done('admin.rechazado');
    });
    actions.replaceWith(form);
    inp.focus();
  });

  li.append(actions, msg);
  return li;
}

async function renderQueue(): Promise<void> {
  const list = $('a-cola');
  const msg = $('a-cola-msg');
  show(msg, t('admin.cargando'));
  const type = ($('a-tipo') as HTMLSelectElement).value as Kind | '';
  const r = await loadQueue(type);
  list.replaceChildren();
  if (r.offline) return show(msg, t('estado.sin_conexion'));
  show(msg, r.data.length ? '' : t('admin.vacia'));
  for (const c of r.data) {
    const li = card(c, (key) => li.replaceChildren(el('p', { class: 'contrib-ok', role: 'status' }, t(key))));
    list.append(li);
  }
}

async function renderRestricted(): Promise<void> {
  const list = $('a-restr');
  const msg = $('a-restr-msg');
  show(msg, t('admin.cargando'));
  const rel = await loadReleased();
  list.replaceChildren();
  if (rel.offline) return show(msg, t('estado.sin_conexion'));
  const released = new Set(rel.data);
  show(msg, data.restricted.length ? '' : t('admin.sin_restringidos'));
  for (const it of data.restricted) {
    const li = el('li', { class: 'admin-card' });
    const h = el('h2');
    h.append(el('span', { class: 'badge' }, t(`categorias.${it.category}`)));
    h.append(el('a', { href: url(`item/${it.id}/`) }, it.title));
    li.append(h, el('p', { class: 'muted small' }, it.year ? `${t(`festivales.${it.festival}`)} ${it.year}` : t(`festivales.${it.festival}`)));
    const m = el('p', { class: 'contrib-msg', role: 'alert' });
    m.hidden = true;
    if (released.has(it.id)) {
      const p = el('p');
      p.append(el('span', { class: 'badge' }, t('admin.ya_liberado')));
      li.append(p);
    } else {
      const btn = el('button', { type: 'button', class: 'btn' }, t('admin.liberar'));
      btn.addEventListener('click', async () => {
        if (await run([btn], m, () => releaseItem(it))) btn.replaceWith(el('p', { class: 'contrib-ok', role: 'status' }, t('admin.liberado')));
      });
      const row = el('div', { class: 'acciones' });
      row.append(btn);
      li.append(row);
    }
    li.append(m);
    list.append(li);
  }
}

async function renderUsers(q: string): Promise<void> {
  const list = $('a-users');
  const msg = $('a-users-msg');
  show(msg, t('admin.cargando'));
  const r = await searchUsers(q);
  list.replaceChildren();
  if (r.offline) return show(msg, t('estado.sin_conexion'));
  show(msg, r.data.length ? '' : t('admin.sin_resultados'));
  for (const u of r.data) {
    const li = el('li', { class: 'admin-card' });
    const h = el('h2', {}, u.display_name || t('admin.sin_nombre'));
    if (u.role === 'admin') h.append(el('span', { class: 'badge' }, t('admin.es_admin')));
    li.append(h, el('p', { class: 'muted small' }, t('admin.puntos', { n: u.points })));
    const m = el('p', { class: 'contrib-msg', role: 'alert' });
    m.hidden = true;
    if (u.role !== 'admin') {
      const btn = el('button', { type: 'button', class: 'btn btn-quiet' }, t('admin.hacer_admin'));
      btn.addEventListener('click', async () => {
        if (await run([btn], m, () => makeAdmin(u.id))) btn.replaceWith(el('p', { class: 'contrib-ok', role: 'status' }, t('admin.hecho_admin')));
      });
      li.append(btn);
    }
    li.append(m);
    list.append(li);
  }
}

const loaded = new Set<string>();
function selectTab(k: string): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('.admin [role="tab"]')) {
    const on = b.dataset.tab === k;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    $(`apanel-${b.dataset.tab}`).hidden = !on;
  }
  if (k === 'restringidos' && !loaded.has(k)) {
    loaded.add(k);
    void renderRestricted();
  }
}

let wired = false;
function wire(): void {
  if (wired) return;
  wired = true;
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.admin [role="tab"]')];
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => selectTab(b.dataset.tab!));
    b.addEventListener('keydown', (ev) => {
      const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      selectTab(next.dataset.tab!);
      next.focus();
    });
  });
  $('a-tipo').addEventListener('change', () => void renderQueue());
  $('a-buscar').addEventListener('submit', (ev) => {
    ev.preventDefault();
    void renderUsers(($('a-q') as HTMLInputElement).value);
  });
}

async function start(): Promise<void> {
  const box = $('admin-gate');
  const body = $('admin-body');
  const client = getClient();
  if (!client) {
    body.hidden = true;
    box.replaceChildren(el('p', { class: 'contrib-msg' }, t('estado.sin_conexion')));
    return;
  }
  const profile = await currentProfile(client).catch(() => null);
  if (profile?.role !== 'admin') {
    body.hidden = true;
    // No profile: signed out, or a stored session we could not check (offline).
    const why = profile ? null : await gate();
    if (why && !why.profile && why.reason === 'offline') {
      box.replaceChildren(el('p', { class: 'contrib-msg' }, t('estado.sin_conexion')));
      return;
    }
    const p = el('p', { class: 'contrib-gate' }, t('admin.solo'));
    if (!profile) p.append(' ', el('a', { href: loginHref() }, t('sesion.ingresar')));
    box.replaceChildren(p);
    return;
  }
  box.replaceChildren();
  body.hidden = false;
  wire();
  const live = await loadApprovedUploads(client);
  gap.approved = [...data.approved, ...live.data];
  await renderQueue();
}

void start();
document.addEventListener('amg:sesion', () => void start());
