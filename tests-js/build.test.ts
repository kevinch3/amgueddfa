import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import raw from '../src/data/catalog.json';
import type { FestivalSlug, Item } from '../src/lib/types';

const DIST = join(__dirname, '..', 'dist');
const catalog = (raw as { items: Item[] }).items;
const FESTIVALS: FestivalSlug[] = ['chubut', 'juventud', 'mimosa', 'trevelin'];
const read = (p: string) => readFileSync(join(DIST, p), 'utf8');

function range(f: FestivalSlug): [number, number] {
  const ys = catalog.filter((i) => i.festival === f && i.year !== null).map((i) => i.year as number);
  return [Math.min(...ys), new Date().getFullYear()];
}

describe('static build', () => {
  beforeAll(() => {
    // Vitest exports BASE_URL/MODE/DEV/PROD/SSR into process.env; a child Astro build
    // would pick them up and drop the site base, so build with a clean env.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !/^(BASE_URL|MODE|DEV|PROD|SSR|VITEST.*|TEST)$/.test(k)),
    );
    execSync('npx astro build', { cwd: join(__dirname, '..'), stdio: 'pipe', env: { ...env, NODE_ENV: 'production' } });
  }, 300_000);

  it('edition page lists its programa with media', () => {
    const html = read('chubut/2024/index.html');
    expect(html).toContain('Programa');
    expect(html).toContain('media/');
  });

  it('trevelin 2011 edition exists', () => {
    expect(existsSync(join(DIST, 'trevelin/2011/index.html'))).toBe(true);
  });

  it('every catalog id has an item page', () => {
    const missing = catalog.filter((i) => !existsSync(join(DIST, 'item', i.id, 'index.html')));
    expect(missing.map((i) => i.id)).toEqual([]);
  });

  it('restricted item pages never reference their media', () => {
    const restricted = catalog.filter((i) => i.restricted);
    expect(restricted.length).toBeGreaterThan(0);
    for (const i of restricted) {
      const html = read(`item/${i.id}/index.html`);
      expect(html).not.toMatch(new RegExp(`<img[^>]*media/${i.id}`));
      expect(html).not.toContain(`media/${i.id}`);
      expect(html).toContain('Disponible tras revisión');
      expect(html).toContain('id="liberado"');
    }
  });

  it('home grid has one cell per festival-year in range', () => {
    const html = read('index.html');
    for (const f of FESTIVALS) {
      const [a, b] = range(f);
      const cells = html.match(new RegExp(`data-cell[^>]*data-festival="${f}"`, 'g')) ?? [];
      expect(cells.length, f).toBe(b - a + 1);
    }
    expect(html).toContain('id="recientes"');
  });

  it('every festival has a timeline and a general page; edition pages carry mount points', () => {
    for (const f of FESTIVALS) {
      expect(existsSync(join(DIST, f, 'index.html')), f).toBe(true);
      expect(existsSync(join(DIST, 'general', f, 'index.html')), f).toBe(true);
    }
    const ed = read('chubut/2024/index.html');
    for (const id of ['hechos', 'recuerdos', 'aportes', 'sesion']) expect(ed).toContain(`id="${id}"`);
    const item = catalog.find((i) => !i.restricted && i.kind === 'pdf')!;
    expect(read(`item/${item.id}/index.html`)).toContain('id="tarea"');
  });

  it('no internal link escapes the base path', () => {
    const html = read('index.html');
    const bad = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]).filter((h) => !h.startsWith('/amgueddfa-eisteddfod/'));
    expect(bad).toEqual([]);
  });
});
