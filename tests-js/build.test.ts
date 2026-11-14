import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import raw from '../src/data/catalog.json';
import approved from '../data/approved/contributions.json';
import type { FestivalSlug, Item } from '../src/lib/types';

const DIST = join(__dirname, '..', 'dist');
const catalog = (raw as { items: Item[] }).items;
const FESTIVALS: FestivalSlug[] = ['chubut', 'juventud', 'mimosa', 'trevelin'];
const read = (p: string) => readFileSync(join(DIST, p), 'utf8');

// A timeline starts at the earliest dated catalog item or approved contribution.
function range(f: FestivalSlug): [number, number] {
  const ys = [...catalog, ...(approved as { festival: string | null; year: number | null }[])]
    .filter((i) => i.festival === f && i.year !== null)
    .map((i) => i.year as number);
  const now = new Date().getFullYear();
  return [ys.length ? Math.min(...ys) : now, now];
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

  it('game pages exist and the tasks feed carries only public year_inferred images', () => {
    for (const p of ['perfil', 'ranking', 'tareas']) expect(existsSync(join(DIST, p, 'index.html')), p).toBe(true);
    const html = read('tareas/index.html');
    const m = html.match(/<script type="application\/json" id="tareas-data">([\s\S]*?)<\/script>/);
    expect(m).not.toBeNull();
    const cards = JSON.parse(m![1]) as { id: string; img: string }[];
    const byId = new Map(catalog.map((i) => [i.id, i]));
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      const i = byId.get(c.id)!;
      expect(i.restricted || !i.year_inferred || i.kind !== 'image', c.id).toBe(false);
      expect(c.img.startsWith('/media/')).toBe(true);
    }
    for (const i of catalog.filter((x) => x.restricted)) expect(html).not.toContain(i.id);
    expect(read('index.html')).toContain('id="recientes-data"');
  });

  it('no internal link escapes the base path', () => {
    const html = read('index.html');
    const bad = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]).filter((h) => !h.startsWith('/') || h.startsWith('//'));
    expect(bad).toEqual([]);
  });

  it('the contact address never appears as text anywhere in dist (only as contacto.png)', () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = join(d, n);
        return statSync(p).isDirectory() ? (n === 'media' ? [] : walk(p)) : /\.(html|js|css|json|txt|xml)$/.test(n) ? [p] : [];
      });
    const files = walk(DIST);
    expect(files.length).toBeGreaterThan(100);
    const hits = files.filter((f) => /info@|info\s*(\(at\)|\[at\])/i.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
    expect(existsSync(join(DIST, 'contacto.png'))).toBe(true);
    const home = read('index.html');
    expect(home).toMatch(/<img[^>]*contacto\.png[^>]*alt="Correo de contacto del archivo"/);
    expect(home).not.toContain('mailto:');
    expect(home).toContain('id="contacto-mail"');
  });

  it('mount points are not live regions', () => {
    const html = read('chubut/2024/index.html');
    expect(html).not.toMatch(/id="(sesion|hechos|recuerdos|aportes|recientes)"[^>]*aria-live/);
  });
});
