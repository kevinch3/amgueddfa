import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import raw from '../src/data/catalog.json';
import approved from '../data/approved/contributions.json';
import editionsData from '../data/approved/editions.json';
import { editionCover, undocumented, yearRange } from '../src/lib/catalog';
import { decades } from '../src/lib/timeline';
import { editionVideos } from '../src/lib/videos';
import videosData from '../src/data/videos.json';
import { transcribedIds } from '../src/lib/transcripciones';
import { PUBLIC_WINNERS, winnerIds } from '../src/lib/ganadores';
import { applyTags } from '../src/lib/tags';
import type { FestivalSlug, Item } from '../src/lib/types';
import { MEDIA_BASE } from '../src/lib/paths';
import { loadEnv } from 'vite';

const DIST = join(__dirname, '..', 'dist');
const catalog = (raw as { items: Item[] }).items;
// Where items sit once approved corrections (tags) apply, as the pages see them.
const placed = applyTags(catalog, approved as any[]);
const FESTIVALS: FestivalSlug[] = ['chubut', 'juventud', 'mimosa', 'trevelin'];
const festivalName: Record<FestivalSlug, string> = { chubut: 'Eisteddfod del Chubut', juventud: 'Eisteddfod de la Juventud', mimosa: 'Eisteddfod Mimosa Porth Madryn', trevelin: 'Eisteddfod de Trevelin' };
const read = (p: string) => readFileSync(join(DIST, p), 'utf8');
/** Every built HTML page (media excluded). */
const htmlFiles = (d = DIST): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? (n === 'media' ? [] : htmlFiles(p)) : n.endsWith('.html') ? [p] : [];
  });

// Same rule the pages use (catalog + approved material), tested on its own in catalog.test.ts.
const range = (f: FestivalSlug): [number, number] => yearRange(f);

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

  it('page images open in the shared lightbox, falling back to the image link', () => {
    const item = catalog.find((i) => !i.restricted && (i.pages ?? 0) > 1);
    expect(item).toBeDefined();
    const html = read(`item/${item!.id}/index.html`);
    expect(html).toContain('data-lb-hash');
    const links = html.match(/<a[^>]*class="page-btn"[^>]*>/g) ?? [];
    expect(links.length).toBe(item!.pages);
    for (const a of links) {
      expect(a).toContain('data-lb="item"');
      expect(a).toMatch(/href="https?:\/\/[^"]+\.webp"/);
    }
    expect(html).not.toContain('<dialog'); // built on first use by lightbox.ts
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
      expect(html).toContain(`contribuir?f=${f}"`);
      expect(html).toContain(`¿Tenés material de antes de ${a}?`);
      expect(html).toContain(`aria-label="Contribuí al ${festivalName[f]}"`);
    }
    expect(html).toContain('id="recientes"');
  });

  it('every festival has a timeline and a general page; edition pages carry mount points', () => {
    for (const f of FESTIVALS) {
      expect(existsSync(join(DIST, f, 'index.html')), f).toBe(true);
      expect(existsSync(join(DIST, 'general', f, 'index.html')), f).toBe(true);
      const [a, b] = range(f);
      const page = read(`${f}/index.html`);
      const rows = page.match(/<li class="tl-[a-z_]+" data-festival=/g) ?? [];
      expect(rows.length, f).toBe(b - a + 1);
      expect(page).toContain(`contribuir?f=${f}"`);
    }
    // Collapsed decades follow the data: whatever is empty today, zero or many.
    let total = 0;
    for (const f of FESTIVALS) {
      const [a, b] = range(f);
      const want = decades(a, b, (y) => undocumented(f, y)).filter((d) => d.empty).length;
      total += want;
      expect((read(`${f}/index.html`).match(/data-decada-vacia/g) ?? []).length, f).toBe(want);
    }
    expect((read('index.html').match(/data-decada-vacia/g) ?? []).length).toBe(total);
    // Early years without a built page land on a 404 that explains why.
    expect(read('404.html')).toContain('id="no-encontrada"');
    expect(read('contribuir/index.html')).toContain('data-firsts=');
    const ed = read('chubut/2024/index.html');
    for (const id of ['hechos', 'recuerdos', 'aportes', 'sesion']) expect(ed).toContain(`id="${id}"`);
    const item = catalog.find((i) => !i.restricted && i.kind === 'pdf')!;
    expect(read(`item/${item.id}/index.html`)).toContain('id="tarea"');
  });

  it('the cover heads its year page and leads that year in the timeline', () => {
    // Every edition with a cover (per editionCover, tested in catalog.test.ts) shows it.
    const editions = [...new Set(catalog.filter((i) => i.year !== null).map((i) => `${i.festival}/${i.year}`))];
    let checked = 0;
    for (const e of editions) {
      const [f, y] = e.split('/') as [FestivalSlug, string];
      const cover = editionCover(f, Number(y));
      const year = read(`${e}/index.html`);
      if (!cover) {
        expect(year, e).not.toContain('class="tapa"');
        continue;
      }
      checked++;
      expect(year, e).toContain(`class="tapa" src="${cover.page}"`);
      expect(year, e).toContain(`<a class="tapa-link" href="${cover.page}" data-lb="tapa">`);
      const fest = read(`${f}/index.html`);
      const row = fest.slice(fest.indexOf(`data-year="${y}"`));
      expect(row.match(/<img src="([^"]+)"/)?.[1], e).toBe(cover.thumb);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('dates are typed as day, month by name, and year (no locale-dependent date picker)', () => {
    const html = read('contribuir/index.html');
    expect(html).not.toContain('type="date"');
    expect(html).toContain('name="date_day"');
    expect(html).toContain('name="date_month"');
    expect(html).toContain('name="date_year"');
    expect(html).toContain('>diciembre</option>');
  });

  it('the Datos tab collects several facts with a shared Fuente', () => {
    const html = read('contribuir/index.html');
    expect(html).toContain('+ Agregar otro dato');
    expect(html).toContain('name="fuente"');
    expect(html).toContain('id="c-lista"');
    expect(html).toContain('name="date_month"');
  });

  it('admin has a tab to load facts directly, credited to someone', () => {
    const html = read('admin/index.html');
    expect(html).toContain('Cargar datos');
    expect(html).toContain('id="a-acreditar"');
    expect(html).toContain('id="a-agregar"');
  });

  it('pages carry canonical, social tags and structured data; private pages are noindex', () => {
    const year = read('chubut/1937/index.html');
    expect(year).toContain('<link rel="canonical" href="https://amgueddfa.kevinroberts.ar/chubut/1937/"');
    expect(year).toContain('<meta property="og:title"');
    expect(year).toContain('"@type":"Event"');
    expect(year).toMatch(/<meta name="description" content="Eisteddfod del Chubut 1937\./);
    // Every approved start date shows up in its edition's Event (zero or many, whatever the data is).
    for (const c of (approved as any[]).filter((x) => x.type === 'fact' && x.payload?.field === 'start_date')) {
      expect(read(`${c.festival}/${c.year}/index.html`)).toContain(`"startDate":"${c.payload.value}"`);
    }
    const prog = catalog.find((i) => i.category === 'programa' && !i.restricted && i.year !== null && i.thumb)!;
    const itemPage = read(`item/${prog.id}/index.html`);
    expect(itemPage).toContain('"@type":"ArchiveComponent"');
    expect(itemPage).toContain(`<meta property="og:image" content="${MEDIA_BASE}/media/${prog.thumb}"`);
    expect(read('index.html')).toContain('ArchiveOrganization');
    for (const p of ['admin', 'perfil', 'ingresar', 'contribuir']) expect(read(`${p}/index.html`), p).toContain('<meta name="robots" content="noindex"');
    expect(read('404.html')).toContain('<meta name="robots" content="noindex"');
    expect(year).not.toContain('content="noindex"');
    for (const i of catalog.filter((x) => x.restricted)) {
      const page = read(`item/${i.id}/index.html`);
      expect(page, i.id).not.toMatch(/og:image" content="[^"]*\/media\//);
      expect(page, i.id).not.toContain('application/ld+json');
    }
  });

  it('robots.txt, sitemap, open data and llms.txt expose public content only', () => {
    const robots = read('robots.txt');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://amgueddfa.kevinroberts.ar/sitemap.xml');
    expect(robots).toContain('Disallow: /admin/');

    const sitemap = read('sitemap.xml');
    expect(sitemap).toContain('<loc>https://amgueddfa.kevinroberts.ar/chubut/1937/</loc>');
    const pub = catalog.find((i) => !i.restricted)!;
    expect(sitemap).toContain(`<loc>https://amgueddfa.kevinroberts.ar/item/${pub.id}/</loc>`);
    expect(sitemap).not.toContain('/admin/');
    expect(sitemap).not.toContain('/contribuir/');

    const eds = JSON.parse(read('datos/ediciones.json'));
    const docs = JSON.parse(read('datos/documentos.json'));
    const e1937 = eds.ediciones.find((e: any) => e.eisteddfod === 'chubut' && e.ano === 1937);
    expect(e1937.url).toBe('https://amgueddfa.kevinroberts.ar/chubut/1937/');
    // Documents count catalog items plus approved community uploads of that year.
    for (const e of eds.ediciones) {
      const ups = (approved as any[]).filter((c) => c.type === 'upload' && c.festival === e.eisteddfod && c.year === e.ano).length;
      const cat = placed.filter((i) => !i.restricted && i.festival === e.eisteddfod && i.year === e.ano).length;
      expect(e.documentos, `${e.eisteddfod} ${e.ano}`).toBe(cat + ups);
    }
    // "realizada" is only true/false when known; unknown editions say null.
    const status = new Map((editionsData as any[]).map((e) => [`${e.festival}:${e.year}`, e.status]));
    for (const e of eds.ediciones) {
      const known = status.get(`${e.eisteddfod}:${e.ano}`);
      const hasFact = (approved as any[]).some((c) => c.type === 'fact' && c.festival === e.eisteddfod && c.year === e.ano && c.payload?.field === 'edicion_realizada');
      if (!known && !hasFact) expect(e.realizada, `${e.eisteddfod} ${e.ano}`).toBeNull();
      if (known === 'held') expect(e.realizada).toBe(true);
      if (known === 'not_held') expect(e.realizada).toBe(false);
    }
    // Every approved fact with a fuente keeps it in the data file (zero or many, whatever the data is).
    const withFuente = (approved as any[]).filter((c) => c.type === 'fact' && c.payload?.fuente).length;
    expect(eds.ediciones.flatMap((e: any) => e.datos).filter((d: any) => d.fuente).length).toBe(withFuente);
    expect(docs.documentos.length).toBe(catalog.filter((i) => !i.restricted).length);
    for (const i of catalog.filter((x) => x.restricted)) {
      expect(sitemap, i.id).not.toContain(`/item/${i.id}/`);
      expect(read('datos/documentos.json'), i.id).not.toContain(i.id);
    }

    const llms = read('llms.txt');
    expect(llms).toContain('https://amgueddfa.kevinroberts.ar/datos/ediciones.json');
    expect(llms).toContain('https://amgueddfa.kevinroberts.ar/datos/documentos.json');
  });

  it('upload form asks what part of the programa is uploaded', () => {
    const html = read('contribuir/index.html');
    for (const v of ['completo', 'tapa', 'parcial']) expect(html).toContain(`name="alcance" value="${v}"`);
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
      expect(c.img.startsWith(`${MEDIA_BASE}/media/`)).toBe(true);
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

  it('edition pages link every video of their edition, and no page shows an empty videos block', () => {
    const videos = (videosData as { videos: { festival: FestivalSlug; year: number }[] }).videos;
    for (const f of FESTIVALS) {
      const [a, b] = range(f);
      for (let y = a; y <= b; y++) {
        const html = read(`${f}/${y}/index.html`);
        const own = editionVideos(f, y);
        expect(html.includes('id="videos-t"'), `${f} ${y}`).toBe(own.length > 0);
        for (const v of own) expect(html).toContain(`watch?v=${v.id}`);
      }
    }
    // Every exported video lands on a page that exists.
    for (const v of videos) expect(existsSync(join(DIST, v.festival, String(v.year), 'index.html')), `${v.festival} ${v.year}`).toBe(true);
  });

  it('standardized transcriptions show on their item page and, folded, on their edition page', () => {
    const ids = transcribedIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const item = catalog.find((i) => i.id === id);
      expect(item, id).toBeDefined();
      expect(item!.restricted, id).toBe(false);
      const page = read(`item/${id}/index.html`);
      expect(page).toContain('id="transcripcion-t"');
      expect(page).toContain('class="tr-lista"');
      if (item!.year) expect(read(`${item!.festival}/${item!.year}/index.html`)).toContain(`href="/item/${id}/"`);
      if (item!.year) expect(read(`${item!.festival}/${item!.year}/index.html`)).toContain('class="tr-detalle"');
    }
    // A web programa with a transcription drops the 600-character excerpt for it.
    expect(read('item/b64a2b4db146/index.html')).not.toContain('id="texto-t"');
  });

  it('published winners are Chubut / Trevelin result documents, folded on their edition page', () => {
    const ids = winnerIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const item = catalog.find((i) => i.id === id);
      expect(item, id).toBeDefined();
      expect(item!.category, id).toBe('resultados');
      expect(PUBLIC_WINNERS, id).toContain(item!.festival);
      const page = read(`${item!.festival}/${item!.year}/index.html`);
      expect(page, id).toContain('class="transcripciones ganadores"');
      expect(page, id).toContain(`Ganadores: ${item!.title}`);
      // The document itself stays restricted.
      expect(read(`item/${id}/index.html`), id).not.toContain(`media/${id}`);
    }
  });

  it('approved contributor transcriptions are baked into item and edition pages', () => {
    const rows = (approved as { type: string; item_id: string | null; festival: string; year: number | null; payload: { text?: string } }[])
      .filter((c) => c.type === 'transcription' && c.item_id);
    for (const c of rows) {
      const item = catalog.find((i) => i.id === c.item_id);
      if (!item || item.restricted) continue;
      const snippet = String(c.payload.text ?? '').split('\n')[0].slice(0, 25);
      expect(read(`item/${c.item_id}/index.html`)).toContain(snippet);
      if (c.year) expect(read(`${c.festival}/${c.year}/index.html`)).toContain(snippet);
    }
  });

  it('the analytics beacon is rendered only with a token, never on admin', () => {
    const root = join(__dirname, '..');
    const token = loadEnv('production', root, 'PUBLIC_').PUBLIC_CF_ANALYTICS_TOKEN || process.env.PUBLIC_CF_ANALYTICS_TOKEN;
    const admin = read('admin/index.html');
    expect(admin).not.toContain('cloudflareinsights');
    expect(admin).not.toContain('amg-analytics');
    if (token) {
      expect(read('index.html')).toContain('name="amg-analytics"');
      expect(read('chubut/2024/index.html')).toContain('name="amg-analytics"');
    } else {
      const hits = htmlFiles().filter((f) => /amg-analytics|cloudflareinsights/.test(readFileSync(f, 'utf8')));
      expect(hits).toEqual([]);
    }
  });
});
