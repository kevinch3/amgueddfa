import {
  approve,
  approveAll,
  approveUpload,
  gapChoice,
  gapOverride,
  groupQueue,
  loadApprovedUploads,
  loadQueue,
  loadReleased,
  makeAdmin,
  recordApprovedUpload,
  reject,
  rejectAll,
  releaseItem,
  restrictedPreview,
  reviewFlags,
  searchUsers,
  signedUrl,
  textOnly,
  type ApprovedLike,
  type GapChoice,
  type GapCtx,
  type BulkResult,
  type Pending,
  type Result,
  type ReviewFlags,
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
/** Gap choices of the upload cards on screen, kept in sync with their checkboxes. */
let choices: { g: GapChoice; box: HTMLInputElement }[] = [];

function syncBoxes(): void {
  for (const { g, box } of choices) box.checked = g.checked;
}

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
  let choice: GapChoice | null = null;
  let flags: ReviewFlags | null = null;

  if (c.type === 'upload') {
    const pv = el('div', { class: 'admin-preview' });
    pv.append(el('h3', { class: 'small' }, t('admin.vista_previa')));
    li.append(pv);
    void preview(c, pv);
    const id = `gap-${c.id}`;
    const gapBox = el('input', { type: 'checkbox', id });
    const g = gapChoice(c, gap);
    choice = g;
    gapBox.checked = g.checked;
    gapBox.addEventListener('change', () => {
      g.checked = gapBox.checked;
      g.touched = true;
    });
    choices.push({ g, box: gapBox });
    const lab = el('label', { for: id, class: 'opt' });
    lab.prepend(gapBox);
    lab.append(t('admin.llena_hueco'));
    li.append(lab);

    // Programa: the admin confirms what the contributor said (complete / cover).
    flags = reviewFlags(c);
    if (flags) {
      const said = String(c.payload?.alcance ?? '');
      if (said) li.append(el('p', { class: 'muted small' }, t('admin.dijo', { alcance: t(`contrib.alcances.${said}`) })));
      const f = flags;
      for (const [key, label] of [['complete', 'admin.completo'], ['tapa', 'admin.es_tapa']] as const) {
        const fid = `${key}-${c.id}`;
        const box = el('input', { type: 'checkbox', id: fid });
        box.checked = f[key];
        box.addEventListener('change', () => { f[key] = box.checked; });
        const l = el('label', { for: fid, class: 'opt' });
        l.prepend(box);
        l.append(t(label));
        li.append(l);
      }
    }
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
      ? () => approveUpload(c, { gap, fillsGap: choice ? gapOverride(choice) : undefined, flags: flags ?? undefined })
      : () => approve(c, null);
    if (await run(btns, msg, fn)) {
      if (c.type === 'upload') {
        choices = choices.filter((x) => x.g !== choice);
        recordApprovedUpload(c, gap, choices.map((x) => x.g), flags ?? undefined);
        syncBoxes();
      }
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
  choices = [];
  if (r.offline) return show(msg, t('estado.sin_conexion'));
  show(msg, r.data.length ? '' : t('admin.vacia'));
  for (const g of groupQueue(r.data)) {
    const cards = new Map<string, HTMLLIElement>();
    for (const c of g.items) {
      const li = card(c, (key) => li.replaceChildren(el('p', { class: 'contrib-ok', role: 'status' }, t(key))));
      cards.set(c.id, li);
    }
    if (!g.lote) {
      list.append(...cards.values());
      continue;
    }
    list.append(groupCard(g.items, cards));
  }
}

/** Facts sent together: one header with "Aprobar todos" / "Rechazar todos" above their cards. */
function groupCard(items: Pending[], cards: Map<string, HTMLLIElement>): HTMLLIElement {
  const box = el('li', { class: 'admin-grupo' });
  const head = el('div', { class: 'admin-grupo-head' });
  head.append(el('h2', { class: 'small' }, t('admin.grupo', { n: items.length })));
  const fuente = String(items[0].payload?.fuente ?? '');
  if (fuente) head.append(el('p', { class: 'muted small' }, t('edicion.fuente', { fuente })));
  const okAll = el('button', { type: 'button', class: 'btn' }, t('admin.aprobar_todos', { n: items.length }));
  const noAll = el('button', { type: 'button', class: 'btn btn-quiet' }, t('admin.rechazar_todos'));
  const msg = el('p', { class: 'contrib-msg', role: 'alert' });
  msg.hidden = true;
  const row = el('div', { class: 'acciones' });
  row.append(okAll, noAll);
  head.append(row, msg);
  const inner = el('ol', { class: 'admin-list' });
  inner.append(...cards.values());
  box.append(head, inner);

  // Mark each card approved/rejected; failed cards keep their own error.
  const settle = (res: BulkResult, okKey: string) => {
    for (const id of res.done) cards.get(id)?.replaceChildren(el('p', { class: 'contrib-ok', role: 'status' }, t(okKey)));
    for (const f of res.failed) {
      const m = cards.get(f.id)?.querySelector<HTMLElement>('.contrib-msg');
      if (m) show(m, t(f.key));
    }
    show(msg, res.failed.length ? t('admin.error.algunos', { n: res.failed.length }) : '');
    if (!res.failed.length) row.remove();
  };

  okAll.addEventListener('click', async () => {
    okAll.disabled = noAll.disabled = true;
    show(msg, t('admin.procesando'));
    settle(await approveAll(items), 'admin.aprobado');
    okAll.disabled = noAll.disabled = false;
  });

  noAll.addEventListener('click', () => {
    const form = el('form', { class: 'tarea-form', novalidate: '' });
    const id = `motivo-grupo-${items[0].id}`;
    const inp = el('input', { id, type: 'text', maxlength: '500', required: '' });
    const go = el('button', { type: 'submit', class: 'btn' }, t('admin.confirmar_rechazo'));
    const cancel = el('button', { type: 'button', class: 'btn btn-quiet' }, t('admin.cancelar'));
    const r2 = el('div', { class: 'acciones' });
    r2.append(go, cancel);
    form.append(el('label', { for: id }, t('admin.motivo_label')), inp, r2);
    cancel.addEventListener('click', () => form.replaceWith(row));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!inp.value.trim()) return show(msg, t('admin.error.motivo'));
      go.disabled = cancel.disabled = true;
      show(msg, t('admin.procesando'));
      const res = await rejectAll(items, inp.value);
      form.replaceWith(row);
      settle(res, 'admin.rechazado');
    });
    row.replaceWith(form);
    inp.focus();
  });
  return box;
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
      if (textOnly(it)) {
        // Items released before text.txt was copied have no media/released/<id>/text.txt,
        // so their page keeps the locked placeholder. Copying again is safe: the upload
        // upserts and release_item ignores an item already released.
        const again = el('button', { type: 'button', class: 'btn btn-quiet' }, t('admin.copiar_de_nuevo'));
        again.addEventListener('click', async () => {
          if (await run([again], m, () => releaseItem(it))) again.replaceWith(el('p', { class: 'contrib-ok', role: 'status' }, t('admin.copiado')));
        });
        const row = el('div', { class: 'acciones' });
        row.append(again);
        li.append(row);
      }
    } else {
      // Look before releasing: signed URLs of the restricted derivatives (admins only, 10 min).
      const pv = el('div', { class: 'admin-preview' });
      const look = el('button', { type: 'button', class: 'btn btn-quiet' }, t('admin.ver_restringido'));
      look.addEventListener('click', async () => {
        look.disabled = true;
        const r = await restrictedPreview(it);
        if (!r) {
          look.disabled = false;
          m.hidden = false;
          m.textContent = t('admin.error.sin_archivos');
          return;
        }
        if (r.text !== null) {
          // Text-only item (Word doc, archived web page): plain text, never parsed as HTML.
          pv.replaceChildren(el('pre', { class: 'texto-restringido', tabindex: '0', 'aria-label': t('admin.restringido_texto', { titulo: it.title }) }, r.text));
          look.remove();
          return;
        }
        const ol = el('ol', { class: 'pages' });
        const urls = r.pages.length ? r.pages : [r.thumb as string];
        urls.forEach((u, i) => {
          const li2 = el('li');
          const a = el('a', { href: u, target: '_blank', rel: 'noopener' });
          a.append(el('img', { src: u, alt: t('admin.restringido_alt', { titulo: it.title, n: i + 1 }), loading: 'lazy' }));
          li2.append(a);
          ol.append(li2);
        });
        pv.replaceChildren(ol);
        look.remove();
      });
      pv.append(look);
      li.append(pv);
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
  // Usuarios: everyone listed straight away; the search narrows it down.
  if (k === 'usuarios' && !loaded.has(k)) {
    loaded.add(k);
    void renderUsers('');
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
