// Reading settings: text size, contrast, spacing, typeface, motion and link
// underlines. They live in this browser only (localStorage, amg:lectura) and show
// as data-* attributes on <html>, which global.css reads. The inline script in
// Base.astro applies them before the page paints, from this same table.

export const LECTURA_KEY = 'amg:lectura';

/** Each setting and its values; the first value is the default (no attribute). */
export const OPCIONES = {
  texto: ['100', '125', '150', '200'],
  contraste: ['auto', 'alto'],
  espaciado: ['normal', 'amplio'],
  letra: ['serif', 'sans'],
  movimiento: ['auto', 'reducido'],
  enlaces: ['normal', 'subrayados'],
} as const;

export type Ajuste = keyof typeof OPCIONES;
export type Ajustes = { [K in Ajuste]: (typeof OPCIONES)[K][number] };
export const AJUSTES = Object.keys(OPCIONES) as Ajuste[];

export const DEFAULTS = Object.fromEntries(AJUSTES.map((k) => [k, OPCIONES[k][0]])) as Ajustes;

/** Known settings with known values from anything (stored JSON, a tool call); the rest default. */
export function sanitize(raw: unknown): Ajustes {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULTS } as Record<Ajuste, string>;
  for (const k of AJUSTES) {
    const v = src[k];
    if (typeof v === 'string' && (OPCIONES[k] as readonly string[]).includes(v)) out[k] = v;
  }
  return out as Ajustes;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The saved settings (defaults when none, or when storage is blocked). */
export function readAjustes(store: Store | null = globalThis.localStorage ?? null): Ajustes {
  try {
    return sanitize(JSON.parse(store?.getItem(LECTURA_KEY) ?? '{}'));
  } catch {
    return { ...DEFAULTS };
  }
}

/** Only what differs from the defaults ({} when nothing does). */
export function changed(a: Ajustes): Partial<Ajustes> {
  return Object.fromEntries(AJUSTES.filter((k) => a[k] !== DEFAULTS[k]).map((k) => [k, a[k]])) as Partial<Ajustes>;
}

/** Keep the settings; all defaults removes the key. False when storage is blocked (private window). */
export function saveAjustes(a: Ajustes, store: Store | null = globalThis.localStorage ?? null): boolean {
  try {
    const diff = changed(a);
    if (Object.keys(diff).length) store?.setItem(LECTURA_KEY, JSON.stringify(diff));
    else store?.removeItem(LECTURA_KEY);
    return Boolean(store);
  } catch {
    return false;
  }
}

/** data-texto="150" and so on on `root`; defaults leave no attribute. */
export function applyAjustes(root: Element, a: Ajustes): void {
  for (const k of AJUSTES) {
    if (a[k] === DEFAULTS[k]) root.removeAttribute(`data-${k}`);
    else root.setAttribute(`data-${k}`, a[k]);
  }
}
