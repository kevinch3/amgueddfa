import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t } from '../src/lib/i18n';
import messages from '../src/i18n/es-AR.json';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(astro|ts)$/.test(n) ? [p] : [];
  });
}

function lookup(key: string): unknown {
  return key.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), messages);
}

describe('i18n', () => {
  it("every t('…') key used under src exists in es-AR.json", () => {
    const re = /\bt\(['"]([\w.]+)['"]/g;
    const missing: string[] = [];
    for (const f of walk('src')) {
      for (const m of readFileSync(f, 'utf8').matchAll(re)) {
        if (typeof lookup(m[1]) !== 'string') missing.push(`${f}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('vars interpolate {n}', () => {
    expect(t('comun.n_documentos', { n: 3 })).toBe('3 documentos');
  });

  it('missing key throws', () => {
    expect(() => t('no.such.key')).toThrow();
  });
});
