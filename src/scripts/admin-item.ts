/**
 * Admins only, on an item page: correct the item (title, section, edition,
 * credit, caption, no-text, hidden) and edit its document's transcription.
 * Both are live for every visitor at once; the export workflow refreshes the
 * static pages within ~15 minutes (issue #27). Visitors never see this panel.
 */
import { currentProfile } from '../lib/auth';
import { correctionPayload, docsFor, historyOf, parseItems, saveCorrection, saveTranscription, type DocRow, type OverlayValues } from '../lib/curation';
import { t } from '../lib/i18n';
import { liveQuery } from '../lib/live';
import { applyTags, type TagLike } from '../lib/tags';
import { PUBLIC_WINNERS } from '../lib/ganadores';
import type { FestivalSlug } from '../lib/types';
import { readOverlay, updateItemOverlay, type ItemOverlay } from './live-catalog';
import { renderTranscription } from './live-transcripciones';
import { busy, categoryOptions, el, festivalOptions, field, select } from './ui';

const TEXT_MAX = 100000;
const msg = () => el('p', { class: 'contrib-msg', role: 'status' });

function check(id: string, label: string, on: boolean): [HTMLDivElement, HTMLInputElement] {
  const box = el('input', { id, type: 'checkbox' });
  box.checked = on;
  const d = el('div', { class: 'campo campo-check' });
  d.append(box, ' ', el('label', { for: id }, label));
  return [d, box];
}

function area(id: string, value: string, rows: number): HTMLTextAreaElement {
  const a = el('textarea', { id, rows: String(rows) });
  a.value = value;
  return a;
}

const valuesOf = (i: ItemOverlay): OverlayValues => ({
  title: i.title, tipo: i.tipo, coleccion: i.coleccion, year: i.fecha.year,
  rights: i.rights ?? '', caption: i.note_public ?? '', no_text: Boolean(i.no_text), hidden: Boolean(i.hidden),
});

/** The item as visitors see it now: the build's values plus tags approved since. */
async function currentItem(base: ItemOverlay): Promise<{ item: ItemOverlay; tags: TagLike[] }> {
  const live = await liveQuery<TagLike[]>(
    (c) => c.from('public_contributions').select('type, item_id, payload, reviewed_at, created_at').in('type', ['tag', 'report']).eq('item_id', base.id),
    [],
  );
  return { item: applyTags([base], live.data)[0], tags: live.data };
}

function correctionForm(base: ItemOverlay, start: ItemOverlay, tags: TagLike[]): HTMLElement {
  let now = valuesOf(start);
  const id = base.id;
  const title = el('input', { id: 'ai-titulo', type: 'text', maxlength: '300' });
  title.value = now.title;
  const cat = select('ai-cat', categoryOptions(), null);
  cat.value = now.tipo;
  const fest = select('ai-fest', festivalOptions(), null);
  fest.value = now.coleccion;
  const year = el('input', { id: 'ai-ano', type: 'number', inputmode: 'numeric', min: '1850', max: '2200', step: '1' });
  year.value = now.year ? String(now.year) : '';
  const rights = area('ai-derechos', now.rights, 2);
  const caption = area('ai-leyenda', now.caption, 3);
  const [ntBox, noText] = check('ai-sin-texto', t('admin_item.sin_texto'), now.no_text);
  const [hBox, hidden] = check('ai-oculto', t('admin_item.oculto'), now.hidden);
  const go = el('button', { type: 'submit', class: 'btn' }, t('admin_item.guardar'));
  const out = msg();
  const form = el('form', { class: 'tarea-form', novalidate: '' });
  form.append(
    el('h3', {}, t('admin_item.correccion')),
    el('p', { class: 'muted small' }, t('admin_item.correccion_ayuda')),
    field(t('admin_item.titulo_campo'), title), field(t('admin_item.categoria'), cat), field(t('admin_item.festival'), fest),
    field(t('admin_item.ano'), year), field(t('admin_item.derechos'), rights), field(t('admin_item.leyenda'), caption),
    ntBox, hBox, go, out,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const next: OverlayValues = {
      title: title.value, tipo: cat.value, coleccion: fest.value, year: year.value ? Number(year.value) : null,
      rights: rights.value, caption: caption.value, no_text: noText.checked, hidden: hidden.checked,
    };
    const payload = correctionPayload(now, next);
    if (!Object.keys(payload).length) {
      out.textContent = t('admin_item.sin_cambios');
      return;
    }
    const r = await busy(go, t('admin_item.guardar'), () => saveCorrection(id, now.coleccion, now.year, payload));
    if (!r.ok) {
      out.textContent = t(r.key);
      return;
    }
    tags.push({ type: 'tag', item_id: id, payload, reviewed_at: new Date().toISOString() });
    const after = applyTags([base], tags)[0];
    updateItemOverlay(document, after);
    now = valuesOf(after);
    out.textContent = t('admin_item.guardado');
  });
  return form;
}

function transcriptionForm(base: ItemOverlay, docs: DocRow[]): HTMLElement {
  const box = el('div', { class: 'tarea-form' });
  const kind = select('ai-tr-tipo', [['programa', t('admin_item.tipo_programa')], ['ganadores', t('admin_item.tipo_ganadores')]], null);
  kind.value = base.tipo === 'resultados' ? 'ganadores' : 'programa';
  const items = area('ai-tr-items', '', 2);
  const [pubBox, pub] = check('ai-tr-publica', t('admin_item.publica'), true);
  const text = area('ai-tr-texto', '', 18);
  text.maxLength = TEXT_MAX;
  const count = el('p', { class: 'muted small' });
  const preview = el('div', { class: 'transcripcion' });
  preview.hidden = true;
  const show = el('button', { type: 'button', class: 'btn btn-quiet' }, t('admin_item.vista_previa'));
  const go = el('button', { type: 'button', class: 'btn' }, t('admin_item.guardar'));
  const out = msg();
  const hist = el('div', { class: 'small' });
  let doc: DocRow | null = null;

  const coleccion = base.coleccion as FestivalSlug;
  const privateOnly = () => kind.value === 'ganadores' && !PUBLIC_WINNERS.includes(coleccion);
  const counter = () => (count.textContent = t('admin_item.caracteres', { n: text.value.length, max: TEXT_MAX }));

  async function loadHistory(): Promise<void> {
    hist.replaceChildren();
    if (!doc) return;
    const v = await historyOf(doc.id);
    if (!v?.length) return;
    const ul = el('ul', { class: 'lista-simple' });
    for (const h of v) {
      const li = el('li', {}, `${new Date(h.changed_at).toLocaleString()} · ${t(`admin_item.op_${h.op}`)} · ${h.who ?? t('admin_item.importado')} · ${t('admin_item.caracteres_cortos', { n: h.text.length })} `);
      const restore = el('button', { type: 'button', class: 'btn btn-quiet btn-small' }, t('admin_item.restaurar'));
      restore.addEventListener('click', () => {
        text.value = h.text;
        counter();
        out.textContent = t('admin_item.restaurado');
      });
      li.append(restore);
      ul.append(li);
    }
    hist.append(el('h4', {}, t('admin_item.historial')), ul);
  }

  function fill(): void {
    doc = docs.find((d) => d.kind === kind.value) ?? null;
    items.value = (doc?.items ?? [base.id]).join(' ');
    text.value = doc?.text ?? '';
    pub.checked = privateOnly() ? false : (doc?.public ?? true);
    pub.disabled = privateOnly();
    preview.hidden = true;
    out.textContent = doc ? '' : t('admin_item.nueva');
    counter();
    void loadHistory();
  }

  kind.addEventListener('change', fill);
  text.addEventListener('input', counter);
  show.addEventListener('click', () => {
    renderTranscription(preview, text.value);
    preview.hidden = false;
  });
  go.addEventListener('click', async () => {
    const ids = parseItems(items.value);
    if (!ids) {
      out.textContent = t('admin_item.error_items');
      return;
    }
    if (!text.value.trim()) {
      out.textContent = t('admin_item.error_texto');
      return;
    }
    // A new document is named after this item; an existing one keeps its id.
    const id = doc?.id ?? base.id;
    const row = { id, items: [id, ...ids.filter((x) => x !== id)], kind: kind.value as DocRow['kind'], coleccion, text: text.value, public: pub.checked && !privateOnly() };
    const r = await busy(go, t('admin_item.guardar'), () => saveTranscription(row));
    if (!r.ok) {
      out.textContent = t(r.key);
      return;
    }
    const fresh = await docsFor(base.id);
    if (fresh) docs = fresh;
    fill();
    out.textContent = t(row.public ? 'admin_item.guardado' : 'admin_item.guardado_privado');
    const live = document.querySelector<HTMLElement>('[data-tr-item] .transcripcion[data-doc]');
    if (live && row.kind === 'programa' && row.public) {
      renderTranscription(live, row.text);
      live.closest<HTMLElement>('[data-tr-item]')!.hidden = false;
    }
  });

  box.append(
    el('h3', {}, t('admin_item.transcripcion')),
    el('p', { class: 'muted small' }, t('admin_item.transcripcion_ayuda')),
    field(t('admin_item.tipo'), kind),
    field(t('admin_item.imagenes'), items),
    el('p', { class: 'muted small' }, t('admin_item.imagenes_ayuda')),
    pubBox, field(t('admin_item.texto'), text), count,
    el('p', { class: 'tarea-acciones' }, ''), out, preview, hist,
  );
  box.querySelector('.tarea-acciones')!.append(show, ' ', go);
  fill();
  return box;
}

async function hydrate(): Promise<void> {
  const root = document.getElementById('admin-item');
  const base = readOverlay(document);
  if (!root || !base) return;
  const profile = await currentProfile().catch(() => null);
  if (profile?.role !== 'admin') {
    root.replaceChildren();
    return;
  }
  const [{ item, tags }, docs] = await Promise.all([currentItem(base), docsFor(base.id)]);
  const panel = el('details', { class: 'admin-panel' });
  panel.append(el('summary', {}, t('admin_item.panel')), correctionForm(base, item, tags));
  panel.append(docs ? transcriptionForm(base, docs) : el('p', { class: 'contrib-msg' }, t('estado.sin_conexion')));
  root.replaceChildren(panel);
}

if (typeof document !== 'undefined') {
  void hydrate();
  document.addEventListener('amg:sesion', () => void hydrate());
}
