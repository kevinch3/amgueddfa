/**
 * Drives a FactEditor (src/components/FactEditor.astro): shows the inputs for
 * the chosen field, reads dates back in words, and keeps the list of facts to
 * send together ("+ Agregar otro dato").
 */
import { factDisplay, isoFromParts, longDate, MAX_FACTS, validate, type Contribution } from '../lib/contrib';
import { t } from '../lib/i18n';

export type Collected = { facts: Record<string, unknown>[]; fuente: string } | { error: string };

export interface FactEditor {
  /** The listed facts plus the one in the editor (when a field is chosen), and the Fuente. */
  collect(): Collected;
  /** Empty the editor, the list and the Fuente. */
  reset(): void;
}

export function mountFactEditor(
  root: HTMLElement,
  opts: { prefix: string; yearInput?: HTMLInputElement; say: (key: string | null) => void; max?: number },
): FactEditor {
  const p = opts.prefix;
  const max = opts.max ?? MAX_FACTS;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${p}-${id}`)!;
  const field = $<HTMLSelectElement>('field');
  const dDay = $<HTMLInputElement>('date-day');
  const dMonth = $<HTMLSelectElement>('date-month');
  const dYear = $<HTMLInputElement>('date-year');
  const leida = $<HTMLParagraphElement>('date-leida');
  const fuente = $<HTMLInputElement>('fuente');
  const listBox = $<HTMLDivElement>('lista-box');
  const listTitle = $<HTMLHeadingElement>('lista-titulo');
  const listEl = $<HTMLOListElement>('lista');
  // "+ Agregar" errors show under the button: the form's message line can be off-screen on phones (#14).
  const addError = $<HTMLParagraphElement>('agregar-error');
  const sayAdd = (key: string | null): void => {
    addError.hidden = !key;
    addError.textContent = key ? t(key) : '';
    if (key) addError.scrollIntoView({ block: 'nearest' });
  };
  const list: Record<string, unknown>[] = [];
  const val = (name: string) => {
    const el = root.querySelector<HTMLInputElement>(`[name="${name}"]:not([type=radio]), [name="${name}"]:checked`);
    return el ? String(el.value ?? '') : '';
  };

  function syncField(): void {
    const f = field.value;
    const mode = f === 'start_date' || f === 'end_date' ? 'date'
      : f === 'edicion_realizada' ? 'yesno' : f === 'competencia' ? 'competencia' : 'text';
    for (const el of root.querySelectorAll<HTMLElement>('[data-for]')) el.hidden = el.dataset.for !== mode;
    syncDate();
  }

  function syncDate(): void {
    const y = opts.yearInput?.value ?? '';
    if (!dYear.value && /^\d{4}$/.test(y)) dYear.value = y; // usually the edition's year
    const iso = isoFromParts(dDay.value.trim(), dMonth.value, dYear.value.trim());
    leida.textContent = iso ? t('contrib.fecha_leida', { fecha: longDate(iso) })
      : dDay.value || dMonth.value ? t('contrib.error.fecha') : '';
  }

  /** The fact in the editor, as validate('fact', …) expects it. */
  function readFact(): Record<string, unknown> {
    const f = field.value;
    const value = f === 'start_date' || f === 'end_date' ? (isoFromParts(val('date_day'), val('date_month'), val('date_year')) ?? '')
      : f === 'edicion_realizada' ? val('held') : val('value');
    return { field: f, value, numero: val('numero'), descripcion: val('descripcion'), categoria: val('categoria'), idioma: val('idioma') };
  }

  function clearEditor(): void {
    for (const el of root.querySelectorAll<HTMLInputElement>('[data-for] input, [data-for] select')) {
      if (el.type === 'radio') el.checked = false;
      else el.value = '';
    }
    field.value = '';
    syncField();
  }

  function renderList(): void {
    listEl.replaceChildren();
    listBox.hidden = list.length === 0;
    listTitle.textContent = t('contrib.lista_titulo', { n: list.length });
    list.forEach((fact, i) => {
      const v = validate('fact', fact);
      const { label, value } = factDisplay({ payload: v.ok ? v.payload : fact } as unknown as Contribution);
      const li = document.createElement('li');
      li.append(`${label}: ${value} `);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'btn-link';
      rm.textContent = t('contrib.quitar');
      rm.addEventListener('click', () => {
        list.splice(i, 1);
        renderList();
        field.focus();
      });
      li.append(rm);
      listEl.append(li);
    });
  }

  $<HTMLButtonElement>('agregar').addEventListener('click', () => {
    opts.say(null);
    sayAdd(null);
    if (!field.value) return sayAdd('contrib.error.campo');
    if (list.length >= max) return sayAdd('contrib.error.demasiados');
    const fact = readFact();
    const v = validate('fact', fact);
    if (!v.ok) return sayAdd(v.key);
    list.push(fact);
    renderList();
    clearEditor();
    field.focus();
  });

  field.addEventListener('change', syncField);
  for (const x of [dDay, dMonth, dYear]) x.addEventListener('input', syncDate);
  opts.yearInput?.addEventListener('input', () => {
    if (!dDay.value && !dMonth.value) dYear.value = '';
    syncDate();
  });
  syncField();

  return {
    collect(): Collected {
      const facts = [...list];
      if (field.value) facts.push(readFact());
      if (!facts.length) return { error: 'contrib.error.campo' };
      return { facts, fuente: fuente.value };
    },
    reset(): void {
      sayAdd(null);
      list.length = 0;
      renderList();
      fuente.value = '';
      clearEditor();
    },
  };
}
