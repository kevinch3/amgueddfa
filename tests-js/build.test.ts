import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import raw from '../src/data/catalog.json';
import approved from '../data/approved/contributions.json';
import editionsData from '../data/approved/editions.json';
import { editionCover, undocumented, yearRange } from '../src/lib/catalog';
import { decades } from '../src/lib/timeline';
import { applyVideoReports, type Video } from '../src/lib/videos';
import { editionVideos } from '../src/lib/videos-data';
import videosData from '../src/data/videos.json';
import { transcribedIds, transcriptionDoc } from '../src/lib/transcripciones';
import { PUBLIC_WINNERS, winnerIds, winnersDoc } from '../src/lib/ganadores';
import { applyTags } from '../src/lib/tags';
import type { FestivalSlug, Item } from '../src/lib/types';
import { MEDIA_BASE } from '../src/lib/paths';
import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, setLocale, t } from '../src/lib/i18n';
import { CLAIM, EVALUATED, WCAG } from '../src/lib/accesibilidad';
import { AJUSTES, OPCIONES } from '../src/lib/lectura';
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
    execSync('npm run build', { cwd: join(__dirname, '..'), stdio: 'pipe', env: { ...env, NODE_ENV: 'production' } });
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

  it('signed-out visitors get a three-step picture of how contributing works, in every language', () => {
    const steps = (f: string) => {
      const html = read(f);
      const sec = html.slice(html.indexOf('id="contrib-pasos"'), html.indexOf('id="contrib-gate"'));
      return { sec, items: sec.match(/<li[ >]/g)?.length ?? 0 };
    };
    const es = steps('contribuir/index.html');
    expect(es.items).toBe(3);
    expect(es.sec).toMatch(/^id="contrib-pasos"[^>]*hidden/); // shown by the script only when signed out
    expect(es.sec).toContain('Cómo funciona');
    expect(es.sec.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(3); // the drawings are decorative
    expect(read('contribuir/index.html')).not.toContain('Para contribuir tenés que ingresar');
    for (const [l, title] of [['cy', "Sut mae'n gweithio"], ['en', 'How it works'], ['zh', '参与方式'], ['it', 'Come funziona'], ['fr', 'Comment ça marche'], ['sv', 'Så fungerar det']]) {
      const s = steps(`${l}/contribuir/index.html`);
      expect(s.items, l).toBe(3);
      expect(s.sec.replace(/&#39;/g, "'"), l).toContain(title);
    }
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
    expect(year).toContain('<link rel="canonical" href="https://amgueddfa.org/chubut/1937/"');
    expect(year).toContain('<meta property="og:title"');
    expect(year).toContain('"@type":"Event"');
    expect(year).toContain('"@type":"BreadcrumbList"');
    // An edition with no evidence of having taken place is never asserted as an Event.
    const early = read('chubut/1865/index.html');
    expect(early).toContain('"@type":"CollectionPage"');
    expect(early).not.toContain('"@type":"Event"');
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
    // A noindex page names no canonical of its own (the 404 page would point to /404/).
    expect(read('404.html')).not.toContain('rel="canonical"');
    expect(read('404.html')).not.toContain('property="og:url"');
    expect(year).not.toContain('content="noindex"');
    for (const i of catalog.filter((x) => x.restricted)) {
      const page = read(`item/${i.id}/index.html`);
      expect(page, i.id).not.toMatch(/og:image" content="[^"]*\/media\//);
      expect(page, i.id).not.toContain('application/ld+json');
    }
  });

  it('machine text (OCR) shows only on public items with no transcription, labelled as unreviewed', () => {
    const ocrIds = existsSync(join(__dirname, '..', 'src', 'data', 'ocr'))
      ? readdirSync(join(__dirname, '..', 'src', 'data', 'ocr')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
      : [];
    const byId = new Map(catalog.map((i) => [i.id, i] as const));
    const human = new Set(transcribedIds());
    for (const id of ocrIds) {
      const it = byId.get(id);
      if (!it) continue;
      const page = read(`item/${id}/index.html`);
      if (it.restricted || human.has(id) || it.text_excerpt) expect(page, id).not.toContain('data-ocr');
      else {
        const ocr = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'data', 'ocr', `${id}.json`), 'utf8'));
        if (ocr.pages.some((p: any) => p.text.trim() && (p.conf ?? 0) >= 75)) expect(page, id).toContain('Texto automático (sin revisar)');
        else expect(page, id).not.toContain('data-ocr');
      }
    }
  });

  it('site search: one Spanish Pagefind index over year and document pages, a /buscar/ page in every language', () => {
    expect(existsSync(join(DIST, 'pagefind', 'pagefind-ui.js'))).toBe(true);
    expect(existsSync(join(DIST, 'pagefind', 'pagefind-entry.json'))).toBe(true);
    const entry = JSON.parse(read('pagefind/pagefind-entry.json'));
    expect(Object.keys(entry.languages)).toEqual(['es']);
    // Spanish pages are indexed; the translations (same documents) are not, so results are not repeated 7 times.
    expect(read('chubut/1937/index.html')).toContain('data-pagefind-body');
    expect(read('cy/chubut/1937/index.html')).not.toContain('data-pagefind-body');
    const pub = catalog.find((i) => !i.restricted && !i.hidden)!;
    expect(read(`item/${pub.id}/index.html`)).toContain('data-pagefind-body');
    for (const i of catalog.filter((x) => x.restricted || x.hidden)) {
      if (existsSync(join(DIST, 'item', i.id, 'index.html'))) expect(read(`item/${i.id}/index.html`), i.id).not.toContain('data-pagefind-body');
    }
    for (const page of ['index.html', 'tareas/index.html', 'ranking/index.html']) expect(read(page), page).not.toContain('data-pagefind-body');
    expect(read('buscar/index.html')).toContain('id="buscador"');
    expect(read('cy/buscar/index.html')).toContain('data-prefix="/cy/"');
    expect(read('index.html')).toContain('href="/buscar"');
  });

  it('Markdown twins: one per year page and public document, never a restricted one', () => {
    const yearMd = read('chubut/1937.md');
    expect(yearMd).toMatch(/^---\n/);
    expect(yearMd).toContain('# Eisteddfod del Chubut 1937');
    expect(yearMd).toContain('realizada: true');
    expect(read('chubut/1937/index.html')).toContain('<link rel="alternate" type="text/markdown" href="https://amgueddfa.org/chubut/1937.md"');
    expect(read('chubut/1865.md')).toContain('realizada: null');
    for (const f of ['chubut', 'juventud', 'mimosa', 'trevelin']) {
      for (const y of readdirSync(join(DIST, f)).filter((d) => /^\d{4}$/.test(d))) expect(existsSync(join(DIST, f, `${y}.md`)), `${f} ${y}`).toBe(true);
    }
    const pub = catalog.find((i) => !i.restricted && !i.hidden && transcribedIds().includes(i.id))!;
    const itemMd = read(`item/${pub.id}.md`);
    expect(itemMd).toContain('## Transcripción');
    expect(itemMd).toContain('Derechos del documento:');
    for (const i of catalog.filter((x) => x.restricted || x.hidden)) expect(existsSync(join(DIST, 'item', `${i.id}.md`)), i.id).toBe(false);
    // No restricted id leaks into any edition twin.
    const restricted = catalog.filter((x) => x.restricted).map((x) => x.id);
    for (const f of ['chubut', 'juventud', 'mimosa', 'trevelin']) {
      for (const md of readdirSync(join(DIST, f)).filter((d) => d.endsWith('.md'))) {
        const body = readFileSync(join(DIST, f, md), 'utf8');
        for (const id of restricted) expect(body, `${f}/${md}`).not.toContain(id);
      }
    }
  });

  it('robots.txt, sitemap, open data and llms.txt expose public content only', () => {
    const robots = read('robots.txt');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://amgueddfa.org/sitemap.xml');
    expect(robots).toContain('Disallow: /admin/');
    // Pages that say noindex themselves are not blocked: a crawler must fetch them to read it.
    for (const p of ['perfil', 'ingresar', 'contribuir']) expect(robots, p).not.toContain(`/${p}/`);
    // AI crawlers are welcome, and share the * group (a group of their own would drop the Disallows).
    expect(robots).toContain('Content-Signal: search=yes, ai-input=yes, ai-train=yes');
    expect(robots.split('\n\n').filter((g) => g.includes('User-agent:')).length).toBe(1);
    expect(robots).toContain('User-agent: Google-Extended');

    const sitemap = read('sitemap.xml');
    expect(sitemap).toContain('<loc>https://amgueddfa.org/chubut/1937/</loc>');
    const pub = catalog.find((i) => !i.restricted)!;
    expect(sitemap).toContain(`<loc>https://amgueddfa.org/item/${pub.id}/</loc>`);
    expect(sitemap).not.toContain('/admin/');
    expect(sitemap).not.toContain('/contribuir/');
    // Years with nothing in the archive (no documents, no approved facts) keep their page but stay out of the sitemap.
    expect(sitemap).toContain('<loc>https://amgueddfa.org/chubut/1865/</loc>');
    const emptyYear = (eds0: any) => eds0.ediciones.find((e: any) => e.documentos === 0 && e.datos.length === 0);
    const empty = emptyYear(JSON.parse(read('datos/ediciones.json')));
    expect(empty).toBeTruthy();
    expect(sitemap).not.toContain(`<loc>${empty.url}</loc>`);

    const eds = JSON.parse(read('datos/ediciones.json'));
    const docs = JSON.parse(read('datos/documentos.json'));
    const e1937 = eds.ediciones.find((e: any) => e.eisteddfod === 'chubut' && e.ano === 1937);
    for (const e of eds.ediciones) expect(typeof e.tiene_transcripcion).toBe('boolean');
    // Rights are never silently empty; transcriptions carry their own licence.
    for (const d of docs.documentos) {
      expect(typeof d.derechos, d.id).toBe('string');
      expect(d.derechos.length, d.id).toBeGreaterThan(0);
      expect(typeof d.tiene_transcripcion, d.id).toBe('boolean');
      if (d.tiene_transcripcion) expect(d.licencia_transcripcion, d.id).toBe('CC BY-SA 4.0');
      else expect(d, d.id).not.toHaveProperty('licencia_transcripcion');
    }
    expect(docs.documentos.some((d: any) => d.tiene_transcripcion)).toBe(true);
    expect(read('llms.txt')).toContain('realizada');
    expect(read('llms.txt')).toContain('.md');
    expect(e1937.url).toBe('https://amgueddfa.org/chubut/1937/');
    // Documents count catalog items plus approved community uploads of that year.
    for (const e of eds.ediciones) {
      const ups = (approved as any[]).filter((c) => c.type === 'upload' && c.festival === e.eisteddfod && c.year === e.ano).length;
      const cat = placed.filter((i) => !i.restricted && !i.hidden && i.festival === e.eisteddfod && i.year === e.ano).length;
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
    expect(docs.documentos.length).toBe(placed.filter((i) => !i.restricted && !i.hidden).length);
    for (const i of catalog.filter((x) => x.restricted)) {
      expect(sitemap, i.id).not.toContain(`/item/${i.id}/`);
      expect(read('datos/documentos.json'), i.id).not.toContain(i.id);
    }

    const llms = read('llms.txt');
    expect(llms).toContain('https://amgueddfa.org/datos/ediciones.json');
    expect(llms).toContain('https://amgueddfa.org/datos/documentos.json');
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
    // OCR-only documents are listed to transcribe; ones with a human transcription are not.
    const ocrIds = readdirSync('src/data/ocr').map((f) => f.replace(/\.json$/, ''));
    const listed = [...html.matchAll(/data-transcribir="([0-9a-f]{12})"/g)].map((x) => x[1]);
    expect(listed.length).toBeGreaterThan(100);
    for (const id of listed) {
      expect(ocrIds, id).toContain(id);
      expect(existsSync(join('src/data/transcripciones', `${id}.md`)), id).toBe(false);
    }
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
        // media/: images; pagefind/: the search library's own bundle (its translator credits carry other people's addresses).
        return statSync(p).isDirectory() ? (n === 'media' || n === 'pagefind' ? [] : walk(p)) : /\.(html|js|css|json|txt|xml)$/.test(n) ? [p] : [];
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

  it('a held edition with nothing archived says so, instead of asking whether it was held', () => {
    const status = new Map((editionsData as { festival: string; year: number; status: string }[]).map((e) => [`${e.festival}:${e.year}`, e.status]));
    const heldEmpty = [...status].filter(([k, s]) => s === 'held' && !catalog.some((i) => `${i.festival}:${i.year}` === k) && !(approved as any[]).some((c) => c.type === 'upload' && `${c.festival}:${c.year}` === k));
    expect(heldEmpty.length).toBeGreaterThan(0);
    for (const [k] of heldEmpty) {
      const [f, y] = k.split(':');
      const html = read(`${f}/${y}/index.html`);
      expect(html, k).toMatch(/class="badge-state st-none"[^>]*data-status="held"[^>]*>Se realizó, sin documentos</);
      expect(read(`${f}/index.html`), k).toMatch(new RegExp(`data-year="${y}"[^>]*data-status="held"`));
    }
    const [f0, y0] = heldEmpty[0][0].split(':');
    expect(read(`en/${f0}/${y0}/index.html`)).toContain('>Held, no documents yet<');
    // Unknown years still ask.
    const unknown = Array.from({ length: 60 }, (_, i) => 1870 + i).find((y) => !status.has(`chubut:${y}`) && !catalog.some((i) => i.festival === 'chubut' && i.year === y));
    expect(read(`chubut/${unknown}/index.html`)).toMatch(/class="badge-state st-none"[^>]*>¿Se realizó\?</);
  });

  it('mount points are not live regions', () => {
    const html = read('chubut/2024/index.html');
    expect(html).not.toMatch(/id="(sesion|hechos|recuerdos|aportes|recientes)"[^>]*aria-live/);
  });

  it('edition pages link every video of their edition, and no page shows an empty videos block', () => {
    // Where videos sit once approved reports apply (hidden ones are gone), as the pages see them.
    const videos = applyVideoReports((videosData as { videos: Video[] }).videos, approved as any[]);
    for (const f of FESTIVALS) {
      const [a, b] = range(f);
      for (let y = a; y <= b; y++) {
        const html = read(`${f}/${y}/index.html`);
        const own = editionVideos(f, y);
        // Every edition page has the videos block (live corrections may fill it), hidden when empty.
        const sec = html.match(/<section[^>]*data-videos[^>]*>/)?.[0];
        expect(sec, `${f} ${y}`).toBeDefined();
        expect(/\shidden(\s|>|=)/.test(sec!), `${f} ${y}`).toBe(own.length === 0);
        expect(sec).toContain(`data-festival="${f}"`);
        expect(sec).toContain(`data-year="${y}"`);
        for (const v of own) {
          expect(html).toContain(`watch?v=${v.id}`);
          expect(html).toContain(`data-video="${v.id}"`);
        }
      }
    }
    // Every exported video lands on a page that exists.
    for (const v of videos) expect(existsSync(join(DIST, v.festival, String(v.year), 'index.html')), `${v.festival} ${v.year}`).toBe(true);
  });

  it('a hidden document keeps its page, with a notice and noindex, and no edition page links it', () => {
    for (const i of placed.filter((x) => x.hidden)) {
      const page = read(`item/${i.id}/index.html`);
      expect(page, i.id).toContain('data-retirado');
      expect(page, i.id).toContain('name="robots" content="noindex"');
      if (i.year) expect(read(`${i.festival}/${i.year}/index.html`), i.id).not.toContain(`href="/item/${i.id}/"`);
    }
  });

  it('every video can be reported, from one dialog per edition page; document pages carry their section for the report form', () => {
    for (const f of FESTIVALS) {
      const [a, b] = range(f);
      for (let y = a; y <= b; y++) {
        const html = read(`${f}/${y}/index.html`);
        expect(html.split('id="informar-dialogo"').length - 1, `${f} ${y}`).toBe(1);
        const cards = html.split('<li class="video"').length - 1;
        expect(html.split('data-informar-video="').length - 1, `${f} ${y}`).toBe(cards);
        for (const v of editionVideos(f, y)) expect(html, `${f} ${y}`).toContain(`data-informar-video="${v.id}"`);
      }
    }
    const pub = placed.find((i) => !i.restricted && !i.hidden)!;
    expect(read(`item/${pub.id}/index.html`)).toContain(`data-category="${pub.category}"`);
    for (const k of ['titulo', 'pregunta', 'no_corresponde', 'otra_edicion', 'otro', 'texto_label', 'nota', 'nota_label', 'ingresar']) {
      expect(t(`informar.${k}`), k).not.toBe(`informar.${k}`);
    }
  });

  it('browser scripts never bundle the video list or the approved export', () => {
    const vids = (videosData as { videos: Video[] }).videos;
    const chunks = readdirSync(join(DIST, '_astro')).filter((n) => n.endsWith('.js'));
    for (const n of chunks) {
      const js = readFileSync(join(DIST, '_astro', n), 'utf8');
      expect(vids.slice(0, 50).filter((v) => js.includes(v.id)), n).toEqual([]);
      expect((approved as { id: string }[]).filter((c) => js.includes(c.id)).map((c) => c.id), n).toEqual([]);
    }
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
      // Every image of a multi-image document links the others.
      if (transcriptionDoc(id)!.items.length > 1) expect(page, id).toContain('Esta transcripción abarca');
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
      // One list per document, under one of its images' titles.
      const titles = winnersDoc(id)!.items.map((m) => catalog.find((i) => i.id === m)!.title);
      expect(titles.some((t) => page.includes(`Ganadores: ${t}`)), id).toBe(true);
      // The document itself stays restricted.
      expect(read(`item/${id}/index.html`), id).not.toContain(`media/${id}`);
    }
  });

  it('approved notes are baked into their item page, under "Información aportada"', () => {
    const rows = (approved as { type: string; item_id: string | null; payload: { text?: string } }[]).filter((c) => c.type === 'note' && c.item_id);
    for (const c of rows) {
      const item = catalog.find((i) => i.id === c.item_id);
      if (!item || item.restricted) continue;
      expect(read(`item/${c.item_id}/index.html`)).toContain(String(c.payload.text ?? '').slice(0, 25));
    }
    // every public item page has the (possibly empty) mount for live notes
    const pub = placed.find((i) => !i.restricted)!;
    expect(read(`item/${pub.id}/index.html`)).toContain('id="notas"');
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

  it('the cookies page lists every key the site stores in the browser', () => {
    const src = join(__dirname, '..', 'src');
    const files = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = join(d, n);
        return statSync(p).isDirectory() ? files(p) : /\.(ts|astro)$/.test(n) ? [p] : [];
      });
    const keys = new Set<string>();
    for (const f of files(src)) for (const m of readFileSync(f, 'utf8').matchAll(/['"`](amg:[a-z-]+)['"`]/g)) keys.add(m[1]);
    keys.delete('amg:sesion'); // a DOM event name, not storage
    expect([...keys]).toEqual(expect.arrayContaining(['amg:tz', 'amg:no-contar']));
    const page = read('cookies/index.html');
    for (const k of keys) expect(page, k).toContain(k);
    expect(page).toContain('auth-token');
    expect(page).toContain('id="no-contar"');
  });

  it('the credits page names every tool and resource behind the texts, with its licence and link', () => {
    const html = read('creditos/index.html');
    for (const s of [
      'huggingface.co/techiaith/whisper-large-ft-cy-en', 'Uned Technolegau Iaith', 'Prifysgol Bangor', 'Apache-2.0',
      'github.com/openai/whisper', 'large-v3-turbo', 'github.com/SYSTRAN/faster-whisper',
      'Anthropic', 'claude-sonnet-5-5', 'restauracion-videos.md',
      'tesseract-ocr', 'astro.build', 'pagefind.app', 'supabase.com', 'pages.github.com', 'github.com/yt-dlp/yt-dlp', 'ffmpeg.org',
    ]) expect(html, s).toContain(s);
    expect(html).toContain('id="videos"');
    expect(read('cy/creditos/index.html')).toContain('Uned Technolegau Iaith');
    expect(read('llms.txt')).toContain('/creditos/');
    expect(read('llms.txt')).toContain('techiaith/whisper-large-ft-cy-en');
  });

  it('legal pages exist, are linked from every page footer and the sitemap, and state the licences', () => {
    const pages = ['objetivos', 'derechos', 'privacidad', 'cookies', 'creditos'];
    for (const p of pages) expect(existsSync(join(DIST, p, 'index.html')), p).toBe(true);
    for (const f of ['index.html', 'chubut/2024/index.html']) {
      const html = read(f);
      for (const p of pages) expect(html, `${f} → ${p}`).toMatch(new RegExp(`href="[^"]*/${p}/?"`));
    }
    const sitemap = read('sitemap.xml');
    for (const p of pages) expect(sitemap).toContain(`/${p}/`);
    const obj = read('objetivos/index.html');
    expect(obj).toContain('AGPL-3.0');
    expect(obj).toContain('CC BY-SA 4.0');
    expect(obj).toContain('github.com/kevinch3/amgueddfa-eisteddfod');
    // the sponsor is acknowledged on the Objetivos page only, in every language
    expect(obj).toMatch(/<a href="https:\/\/kevinroberts\.ar\/" rel="sponsored noopener"><img src="\/patrocinio-kr\.svg" alt="Kevin Roberts \(kevinroberts\.ar\)"/);
    expect(read('cy/objetivos/index.html')).toContain('Gyda chefnogaeth');
    expect(read('cy/objetivos/index.html')).toContain('src="/patrocinio-kr.svg"');
    expect(existsSync(join(DIST, 'patrocinio-kr.svg'))).toBe(true);
    for (const f of ['index.html', 'chubut/2024/index.html']) expect(read(f)).not.toContain('patrocinio-kr.svg');
    expect(read('derechos/index.html')).toContain('11.723');
    expect(read('privacidad/index.html')).toContain('25.326');
    for (const p of pages) expect(read(`${p}/index.html`)).not.toMatch(/borrador|revisión con las asociaciones/i);
    const contrib = read('contribuir/index.html');
    expect(contrib).toContain('CC BY-SA 4.0');
    expect(contrib).toMatch(/href="[^"]*\/derechos\/?"/);
    expect(read('index.html')).toMatch(/href="[^"]*\/objetivos\/?"/);
    const root = join(__dirname, '..');
    expect(readFileSync(join(root, 'LICENSE'), 'utf8')).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
    expect(readFileSync(join(root, 'LICENSE-DATA.md'), 'utf8')).toContain('CC BY-SA 4.0');
  });

  describe('every page in every language', () => {
    const OTHERS = LOCALES.filter((l) => l !== DEFAULT_LOCALE);
    const SITE = 'https://amgueddfa.org';
    /** Spanish pages, as paths relative to dist ("index.html", "chubut/1937/index.html"). */
    const spanishPages = () =>
      htmlFiles()
        .map((f) => f.slice(DIST.length + 1))
        .filter((f) => !(OTHERS as readonly string[]).includes(f.split('/')[0]));
    /** The same text in another language, for assertions. */
    const tIn = (l: (typeof LOCALES)[number], key: string, vars?: Record<string, string | number>) => {
      setLocale(l);
      try {
        return t(key, vars);
      } finally {
        setLocale(DEFAULT_LOCALE);
      }
    };
    const pub = () => placed.find((i) => !i.restricted && !i.hidden)!;

    it('each language has a copy of every Spanish page', () => {
      const pages = spanishPages();
      expect(pages.length).toBeGreaterThan(500);
      for (const l of OTHERS) {
        const missing = pages.map((p) => (p === '404.html' ? '404/index.html' : p)).filter((p) => !existsSync(join(DIST, l, p)));
        expect(missing, l).toEqual([]);
      }
    });

    it('pages say their language, canonical address and every alternate', () => {
      for (const l of LOCALES) {
        const prefix = l === DEFAULT_LOCALE ? '' : `${l}/`;
        for (const page of ['', 'chubut/1937/', `item/${pub().id}/`, 'privacidad/']) {
          const html = read(`${prefix}${page}index.html`);
          expect(html, `${l} ${page}`).toContain(`<html lang="${LOCALE_INFO[l].tag}"`);
          expect(html, `${l} ${page}`).toContain(`<link rel="canonical" href="${SITE}/${prefix}${page}"`);
          for (const a of LOCALES) {
            const ap = a === DEFAULT_LOCALE ? '' : `${a}/`;
            expect(html, `${l} ${page} → ${a}`).toContain(`<link rel="alternate" hreflang="${LOCALE_INFO[a].tag}" href="${SITE}/${ap}${page}"`);
          }
          expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${SITE}/${page}"`);
          expect(html).toContain(`<meta property="og:locale" content="${LOCALE_INFO[l].og}"`);
        }
      }
    });

    it('the interface is translated, and Spanish chrome does not leak into other languages', () => {
      for (const l of OTHERS) {
        const home = read(`${l}/index.html`);
        for (const k of ['nav.tareas', 'nav.ranking', 'inicio.mapa_titulo', 'pie.enlaces.privacidad']) expect(home, `${l} ${k}`).toContain(tIn(l, k));
        expect(home, l).not.toContain('>Tareas rápidas<');
        expect(home, l).not.toContain('Saltar al contenido');
        const year = read(`${l}/chubut/1937/index.html`);
        expect(year, l).toContain(tIn(l, 'edicion.recuerdos_titulo'));
        expect(year, l).toMatch(new RegExp(`<meta name="description" content="${tIn(l, 'festivales.chubut')} 1937`));
      }
      // Welsh pages use the Welsh festival names, without repeating them underneath.
      const cy = read('cy/chubut/index.html');
      expect(cy).toContain('<h1>Eisteddfod y Wladfa</h1>');
      expect(cy).not.toContain('<p class="cy" lang="cy">');
    });

    it('internal links stay in the page language; files keep one address', () => {
      for (const l of OTHERS) {
        for (const page of ['index.html', 'chubut/1937/index.html', `item/${pub().id}/index.html`]) {
          const html = read(`${l}/${page}`);
          const tags = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
          const bad = tags
            .filter((a) => !/\shreflang=/.test(a)) // the language menu links to the others on purpose
            .map((a) => a.match(/href="(\/[^"]*)"/)?.[1])
            .filter((h): h is string => !!h && !h.startsWith(`/${l}/`) && !/\.[a-z0-9]+(?:[?#].*)?$/i.test(h.split('?')[0]));
          expect(bad, `${l} ${page}`).toEqual([]);
        }
        expect(read(`${l}/index.html`)).toContain('src="/contacto.png"');
      }
    });

    it('the language menu lists every language, marking the current one', () => {
      const html = read('sv/chubut/1937/index.html');
      expect(html).toContain('<details class="menu-cabecera idiomas" data-menu>');
      for (const l of LOCALES) expect(html).toContain(`hreflang="${LOCALE_INFO[l].tag}" lang="${LOCALE_INFO[l].tag}" data-idioma="${l}"`);
      expect(html).toMatch(/data-idioma="sv" aria-current="true"/);
      expect(html).toContain(tIn('sv', 'idiomas.original'));
      expect(read('chubut/1937/index.html')).not.toContain(t('idiomas.original'));
    });

    it('structured data points at the page in its language', () => {
      const year = read('en/chubut/1937/index.html');
      expect(year).toContain(`"url":"${SITE}/en/chubut/1937/"`);
      expect(read('fr/index.html')).toContain(`"inLanguage":"fr"`);
    });

    it('missing addresses in another language hop to that language\'s 404, keeping the address', () => {
      const root = read('404.html');
      expect(root).toContain("'/404/?desde='");
      for (const l of OTHERS) {
        const html = read(`${l}/404/index.html`);
        expect(html, l).toContain(`<html lang="${LOCALE_INFO[l].tag}"`);
        expect(html, l).toContain('history.replaceState');
        expect(html, l).toContain(tIn(l, 'no_encontrada.titulo'));
        expect(html, l).not.toContain("'/404/?desde='");
      }
    });

    it('the email link always lands on /ingresar/, which forwards other languages', () => {
      expect(read('ingresar/index.html')).toContain("q.get('lang')");
      for (const l of OTHERS) expect(read(`${l}/ingresar/index.html`), l).not.toContain("q.get('lang')");
    });

    it('translated legal pages say the Spanish text prevails and link to it', () => {
      for (const p of ['objetivos', 'derechos', 'privacidad', 'cookies', 'creditos']) {
        expect(read(`${p}/index.html`), p).not.toContain('data-traduccion');
        for (const l of OTHERS) {
          const html = read(`${l}/${p}/index.html`);
          expect(html, `${l} ${p}`).toContain('data-traduccion');
          expect(html, `${l} ${p}`).toContain(`href="/${p}/" hreflang="es-AR"`);
        }
      }
      expect(read('cy/objetivos/index.html')).toContain('deed.cy');
      expect(read('derechos/index.html')).toContain('docs.github.com/es/');
    });

    it('the sitemap lists public pages in every language, still not private ones', () => {
      const sitemap = read('sitemap.xml');
      for (const l of OTHERS) {
        expect(sitemap, l).toContain(`<loc>${SITE}/${l}/</loc>`);
        expect(sitemap, l).toContain(`<loc>${SITE}/${l}/item/${pub().id}/</loc>`);
        expect(sitemap, l).toContain(`<loc>${SITE}/${l}/chubut/1937/</loc>`);
      }
      for (const p of ['admin', 'perfil', 'ingresar', 'contribuir']) expect(sitemap).not.toContain(`/${p}/`);
      for (const i of catalog.filter((x) => x.restricted)) expect(sitemap, i.id).not.toContain(`/item/${i.id}/`);
      const robots = read('robots.txt');
      expect(robots).toContain('Disallow: /*/admin/');
      expect(read('llms.txt')).toContain(`${SITE}/cy/`);
    });

    it('restricted documents stay hidden in every language', () => {
      for (const l of OTHERS) {
        for (const i of catalog.filter((x) => x.restricted)) {
          const html = read(`${l}/item/${i.id}/index.html`);
          expect(html, `${l} ${i.id}`).not.toContain(`media/${i.id}`);
          expect(html, `${l} ${i.id}`).toContain(tIn(l, 'item.restringido'));
        }
      }
    });

    it('no Spanish interface text on any translated page: only archive content, marked with its language', () => {
      // Visible and attribute text of a page, minus <script>/<style> and any element in
      // another language than the page's (archive and community text carries lang="es").
      const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
      const pageText = (html: string, pageLang: string): string => {
        const out: string[] = [];
        const stack: { tag: string; skip: boolean }[] = [];
        const skipping = () => stack.some((e) => e.skip);
        const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html))) {
          if (m[4] !== undefined) {
            if (!skipping() && m[4].trim()) out.push(m[4]);
            continue;
          }
          const [, close, rawTag, attrs] = m;
          const tag = rawTag.toLowerCase();
          if (close) {
            const i = stack.map((e) => e.tag).lastIndexOf(tag);
            if (i >= 0) stack.splice(i);
            continue;
          }
          const lang = /\slang="([^"]*)"/.exec(attrs)?.[1];
          const skip = tag === 'script' || tag === 'style' || (lang !== undefined && tag !== 'html' && !lang.startsWith(pageLang));
          if (!skipping() && !skip) {
            for (const a of attrs.matchAll(/\s(?:alt|title|aria-label|placeholder)="([^"]*)"/g)) out.push(a[1]);
            if (tag === 'meta' && /\s(?:name="description"|property="og:(?:title|description)")/.test(attrs)) out.push(/\scontent="([^"]*)"/.exec(attrs)?.[1] ?? '');
          }
          if (tag === 'script' || tag === 'style') {
            const end = html.indexOf(`</${tag}>`, re.lastIndex);
            re.lastIndex = end < 0 ? html.length : end + tag.length + 3;
          } else if (!VOID.has(tag) && !attrs.endsWith('/')) stack.push({ tag, skip });
        }
        return out.join('\n').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      };
      // Archive content in its original words: document titles, YouTube titles and channels.
      const vids = (videosData as { videos: Video[] }).videos;
      const content = [...new Set([...catalog.map((i) => i.title), ...vids.map((v) => v.title), ...vids.map((v) => v.channel)])].sort((a, b) => b.length - a.length);
      const flat = (o: Record<string, unknown>, p = ''): [string, string][] =>
        Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : flat(v as Record<string, unknown>, `${p}${k}.`)));
      const es = flat(JSON.parse(readFileSync(join(__dirname, '..', 'src', 'i18n', 'es-AR.json'), 'utf8')));
      let pages = 0;
      for (const l of OTHERS) {
        const own = new Map(flat(JSON.parse(readFileSync(join(__dirname, '..', 'src', 'i18n', `${LOCALE_INFO[l].tag}.json`), 'utf8'))));
        // Spanish interface strings this language words differently, cut at their {placeholders}.
        const needles = [...new Set(es.filter(([k, v]) => own.get(k) !== v && !v.startsWith('http')).flatMap(([, v]) => v.split(/\{\w+\}/).map((x) => x.trim())).filter((x) => x.length >= 12))];
        const leaks: string[] = [];
        for (const file of htmlFiles(join(DIST, l))) {
          pages++;
          let text = pageText(readFileSync(file, 'utf8'), LOCALE_INFO[l].tag.split('-')[0]);
          for (const c of content) text = text.split(c).join(' ');
          const hit = needles.find((n) => text.includes(n));
          if (hit) leaks.push(`${file.slice(DIST.length + 1)}: ${hit}`);
        }
        expect(leaks, l).toEqual([]);
      }
      expect(pages).toBeGreaterThan(5000);
    });

    it('a browser loads only its page language: each language is its own chunk', () => {
      const chunks = readdirSync(join(DIST, '_astro')).filter((n) => n.endsWith('.js'));
      for (const l of OTHERS) expect(chunks.some((n) => n.startsWith(`${LOCALE_INFO[l].tag}.`)), l).toBe(true);
      const english = tIn('en', 'legal.cookies.analitica_titulo');
      const holders = chunks.filter((n) => readFileSync(join(DIST, '_astro', n), 'utf8').includes(english));
      expect(holders.length).toBe(1);
      expect(holders[0].startsWith('en-GB.')).toBe(true);
    });
  });

  describe('accessibility and automation', () => {
    const OTHERS = LOCALES.filter((l) => l !== DEFAULT_LOCALE);
    const pages = ['index.html', 'chubut/1937/index.html', 'contribuir/index.html', 'accesibilidad/index.html'];

    it('the accessibility statement exists in every language, is in the sitemap and linked from every footer', () => {
      expect(existsSync(join(DIST, 'accesibilidad/index.html'))).toBe(true);
      for (const l of OTHERS) expect(existsSync(join(DIST, l, 'accesibilidad/index.html')), l).toBe(true);
      expect(read('sitemap.xml')).toContain('/accesibilidad/</loc>');
      for (const f of ['index.html', 'chubut/1937/index.html', 'cy/index.html', 'zh/item/' + catalog.find((i) => !i.restricted)!.id + '/index.html']) {
        expect(read(f), f).toMatch(/<p class="pie-normas small">[\s\S]*?href="[^"]*\/accesibilidad"/);
      }
      const html = read('accesibilidad/index.html');
      expect(html).toContain(WCAG.uri);
      expect(html).toContain('26.653');
      expect(html).toContain('EN 301 549');
      expect(html).toContain('16 de noviembre de 2026');
      expect(EVALUATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('no conformance logo while the site is only partially conformant (CLAIM is null); with a claim, the logo file is served', () => {
      const html = read('accesibilidad/index.html');
      if (CLAIM) {
        expect(html).toContain('data-conformidad="total"');
        expect(existsSync(join(__dirname, '..', 'public', WCAG.logo))).toBe(true);
        expect(read('index.html')).toContain(`href="${WCAG.explanation}"`);
      } else {
        expect(html).toContain('data-conformidad="parcial"');
        for (const f of htmlFiles().slice(0, 50)) expect(readFileSync(f, 'utf8'), f).not.toContain('wcag-logo');
      }
    });

    it('reading settings: applied before paint on every page, offered in the header and on the statement', () => {
      for (const f of pages) {
        const html = read(f);
        const head = html.slice(0, html.indexOf('</head>'));
        expect(head.indexOf('amg:lectura'), f).toBeGreaterThan(-1);
        expect(head.indexOf('amg:lectura'), f).toBeLessThan(head.indexOf('stylesheet') === -1 ? Infinity : head.indexOf('stylesheet'));
        expect(html, f).toContain('<details class="menu-cabecera lectura-menu" data-menu>');
        for (const k of AJUSTES) for (const v of OPCIONES[k]) expect(html, `${f} ${k}=${v}`).toContain(`value="${v}" data-ajuste="${k}"`);
      }
      // Two copies on the statement page, with distinct radio names.
      const html = read('accesibilidad/index.html');
      expect(html).toContain('name="lectura-cab-texto"');
      expect(html).toContain('name="lectura-pag-texto"');
      expect(read('cookies/index.html')).toContain('amg:lectura');
    });

    it('the icon-only menu buttons have a text name; scrollable tables can be reached by keyboard', () => {
      const html = read('index.html');
      expect(html).toMatch(/<summary title="Ajustes de lectura">[\s\S]*?<span class="sr-only">Ajustes de lectura<\/span>/);
      expect(read('cookies/index.html')).toContain('class="legal-tabla" tabindex="0" role="region" aria-labelledby="cookies-tabla"');
    });

    it('archive and community text is marked as Spanish on translated pages only (WCAG 3.1.2)', () => {
      const item = catalog.find((i) => !i.restricted && !i.hidden)!;
      expect(read(`en/item/${item.id}/index.html`)).toMatch(/<h1 lang="es">/);
      expect(read(`item/${item.id}/index.html`)).toMatch(/<h1>/);
      expect(read('fr/general/chubut/index.html')).toMatch(/<span lang="es">/);
      for (const f of ['index.html', 'chubut/1937/index.html', `item/${item.id}/index.html`]) expect(read(f), f).not.toContain('lang="es"');
    });

    it('WebMCP: tools are registered from every page, forms are agent-fillable but never auto-submitted', () => {
      const chunks = readdirSync(join(DIST, '_astro')).filter((n) => n.endsWith('.js')).map((n) => readFileSync(join(DIST, '_astro', n), 'utf8'));
      for (const name of ['get_page_info', 'search_documents', 'list_editions', 'get_edition', 'open_page', 'set_language', 'set_reading_settings']) {
        expect(chunks.some((js) => js.includes(`"${name}"`) || js.includes(`'${name}'`) || js.includes('`' + name + '`')), name).toBe(true);
      }
      for (const f of ['contribuir/index.html', 'cy/contribuir/index.html']) {
        const html = read(f);
        expect(html, f).toContain('toolname="add_edition_fact"');
        expect(html, f).toContain('toolname="share_memory"');
        expect(html, f).not.toContain('toolautosubmit');
        expect(html, f).toMatch(/name="text"[^>]*toolparamdescription=/);
        expect(html, f).toMatch(/name="field"[^>]*toolparamdescription=/);
      }
      expect(read('contribuir/index.html')).not.toMatch(/<form[^>]*panel-subir[^>]*toolname/); // a file cannot be filled in by an agent
    });

    it('automation hints: open data, llms.txt and (only with a token) the WebMCP origin trial', () => {
      const html = read('index.html');
      expect(html).toContain('<link rel="alternate" type="application/json" href="https://amgueddfa.org/datos/ediciones.json"');
      expect(html).toContain('<link rel="alternate" type="application/json" href="https://amgueddfa.org/datos/documentos.json"');
      expect(html).toContain('<link rel="help" type="text/plain" href="https://amgueddfa.org/llms.txt"');
      const root = join(__dirname, '..');
      const token = loadEnv('production', root, 'PUBLIC_').PUBLIC_WEBMCP_OT_TOKEN || process.env.PUBLIC_WEBMCP_OT_TOKEN;
      expect(html.includes('http-equiv="origin-trial"')).toBe(Boolean(token));
      const llms = read('llms.txt');
      for (const k of ['WebMCP', 'search_documents', 'add_edition_fact', 'accesibilidad/']) expect(llms).toContain(k);
    });
  });
});
