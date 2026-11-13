import messages from '../i18n/es-AR.json';

export const LOCALES = ['es-AR'] as const;

function lookup(key: string): string | undefined {
  let cur: unknown = messages;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const s = lookup(key);
  if (s === undefined) {
    if (import.meta.env?.DEV) throw new Error(`Missing i18n key: ${key}`);
    return key;
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
