// Tools for the browser's AI agent (WebMCP): find documents and editions, read the
// page, open a page, switch language, change the reading settings. None of them
// writes to the archive: contributing goes through the forms (<form toolname>), which
// the agent may fill but only the person can send.
import { CATEGORIES, FESTIVALS } from '../lib/contrib';
import { LOCALES, LOCALE_INFO, locale, localeTag, type Locale } from '../lib/i18n';
import { OPCIONES } from '../lib/lectura';
import { alternates, url } from '../lib/paths';
import { PAGES, getEdition, inLanguage, listEditions, pagePath, searchDocuments, type Documento, type Edicion } from '../lib/agent-tools';
import { modelContext, type Tool } from '../lib/webmcp';
import { getAjustes, setAjustes } from './lectura';

const STATUSES = ['full', 'some', 'none', 'not_held'];
const SITE_NOTE = 'Amgueddfa Eisteddfod y Wladfa is a digital archive of programmes and papers from the Welsh eisteddfodau of Patagonia (Argentina). Document titles and text are in Spanish and Welsh.';

let docs: Promise<Documento[]> | null = null;
let eds: Promise<Edicion[]> | null = null;
const loadDocs = () => (docs ??= fetch(url('datos/documentos.json')).then((r) => r.json()).then((j) => j.documentos as Documento[]));
const loadEds = () => (eds ??= fetch(url('datos/ediciones.json')).then((r) => r.json()).then((j) => j.ediciones as Edicion[]));

/** Data URLs are the Spanish pages; hand back the page in the language the person reads. */
const here = (abs: string) => location.origin + inLanguage(abs, (p) => url(p));
const docOut = (d: Documento) => ({ id: d.id, title: d.titulo, festival: d.eisteddfod, festival_name: d.nombre_eisteddfod, year: d.ano, category: d.categoria, type: d.tipo, url: here(d.url), thumbnail: d.miniatura });
const edOut = (e: Edicion) => ({ festival: e.eisteddfod, festival_name: e.nombre, year: e.ano, status: e.estado, held: e.realizada, documents: e.documentos, url: here(e.url), cover: e.tapa, facts: e.datos });

function go(path: string): { url: string } {
  const to = new URL(path, location.origin).href;
  setTimeout(() => location.assign(to), 0); // answer the agent before the page goes away
  return { url: to };
}

const year = { type: 'integer', minimum: 1865, maximum: 2100 };
const festival = { type: 'string', enum: [...FESTIVALS], description: 'chubut = Eisteddfod del Chubut (Eisteddfod y Wladfa), juventud = Eisteddfod de la Juventud, mimosa = Eisteddfod Mimosa (Porth Madryn), trevelin = Eisteddfod de Trevelin.' };

const TOOLS: Tool[] = [
  {
    name: 'get_page_info',
    title: 'Current page',
    description: `${SITE_NOTE} Returns what the current page is (its title, language, eisteddfod, year or document) and the same page in the other languages.`,
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    async execute() {
      const mount = document.getElementById('sesion');
      return {
        title: document.title,
        heading: document.querySelector('h1')?.textContent?.trim() ?? '',
        language: localeTag(),
        url: location.href,
        festival: mount?.dataset.festival || null,
        year: mount?.dataset.year ? Number(mount.dataset.year) : null,
        document_id: mount?.dataset.item || null,
        languages: alternates(location.pathname).map((a) => ({ language: LOCALE_INFO[a.locale].tag, name: LOCALE_INFO[a.locale].name, url: location.origin + a.href })),
      };
    },
  },
  {
    name: 'search_documents',
    title: 'Search documents',
    description: `${SITE_NOTE} Finds public documents (programmes, syllabuses, preliminary rounds, results, other papers) by words in their title and by eisteddfod, year and category. Every word must match; accents do not matter.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for, e.g. "tapa programa" or "1975".' },
        festival,
        year,
        category: { type: 'string', enum: [...CATEGORIES] },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
    annotations: { readOnlyHint: true },
    async execute(input) {
      const r = searchDocuments(await loadDocs(), input as Parameters<typeof searchDocuments>[1]);
      return { total: r.total, results: r.results.map(docOut) };
    },
  },
  {
    name: 'list_editions',
    title: 'List editions',
    description: `${SITE_NOTE} Lists editions (one per eisteddfod and year) with what the archive holds: status full (complete programme), some (some material), none (nothing yet) or not_held, number of documents and approved facts.`,
    inputSchema: { type: 'object', properties: { festival, from_year: year, to_year: year, status: { type: 'string', enum: STATUSES } } },
    annotations: { readOnlyHint: true },
    async execute(input) {
      const list = listEditions(await loadEds(), input as Parameters<typeof listEditions>[1]);
      return { total: list.length, editions: list.slice(0, 200).map(({ datos, ...e }) => ({ ...edOut({ ...e, datos: [] }), facts: datos.length })) };
    },
  },
  {
    name: 'get_edition',
    title: 'One edition',
    description: `${SITE_NOTE} Returns one edition: its approved facts (date, venue, presenters, Chair and Crown winners, competitions) with their sources, and its documents.`,
    inputSchema: { type: 'object', properties: { festival, year }, required: ['festival', 'year'] },
    annotations: { readOnlyHint: true },
    async execute(input) {
      const r = getEdition(await loadEds(), await loadDocs(), String(input.festival), Number(input.year));
      return r ? { ...edOut(r.edicion), documents: r.documentos.map(docOut) } : { error: 'The archive has no page for that eisteddfod and year yet.' };
    },
  },
  {
    name: 'open_page',
    title: 'Open a page',
    description: `${SITE_NOTE} Opens a page of the site in the current language. "contribute" opens the contribution form for an edition (tab: subir = upload a file, datos = facts, recuerdo = a memory); the person must be signed in, and only they can send it.`,
    inputSchema: {
      type: 'object',
      properties: { page: { type: 'string', enum: [...PAGES] }, festival, year, document_id: { type: 'string', pattern: '^[0-9a-f]{12}$' }, tab: { type: 'string', enum: ['subir', 'datos', 'recuerdo'] } },
      required: ['page'],
    },
    async execute(input) {
      const r = pagePath(input as Parameters<typeof pagePath>[0], FESTIVALS);
      return 'error' in r ? r : go(url(r.path));
    },
  },
  {
    name: 'set_language',
    title: 'Change language',
    description: 'Shows the same page in another language: es (Spanish), cy (Welsh, as spoken in Patagonia), en (British English), zh (Simplified Chinese), it (Italian), fr (French) or sv (Swedish).',
    inputSchema: { type: 'object', properties: { language: { type: 'string', enum: [...LOCALES] } }, required: ['language'] },
    async execute(input) {
      const to = alternates(location.pathname).find((a) => a.locale === (input.language as Locale));
      if (!to) return { error: `unknown language "${String(input.language)}"` };
      if (to.locale === locale()) return { url: location.href };
      return go(`${to.href}${location.search}${location.hash}`);
    },
  },
  {
    name: 'set_reading_settings',
    title: 'Reading settings',
    description: 'Changes how the site looks for the person, in this browser: texto = text size (100, 125, 150 or 200 %), contraste = contrast (auto or alto = high), espaciado = line and letter spacing, letra = typeface (serif or sans), movimiento = animations (auto or reducido), enlaces = links (always underlined or not). Returns the settings now in effect.',
    inputSchema: { type: 'object', properties: Object.fromEntries(Object.entries(OPCIONES).map(([k, v]) => [k, { type: 'string', enum: [...v] }])) },
    async execute(input) {
      return Object.keys(input).length ? setAjustes(input as Record<string, string>) : getAjustes();
    },
  },
];

const mc = modelContext();
if (mc) {
  for (const tool of TOOLS) {
    mc.registerTool(tool).catch(() => {
      /* already registered (a second copy of this script) or not allowed here */
    });
  }
}
