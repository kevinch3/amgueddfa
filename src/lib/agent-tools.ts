// What the WebMCP tools answer (scripts/webmcp.ts registers them), worked out from
// the open data the site already publishes (/datos/ediciones.json, documentos.json).
// Pure functions: no DOM, no fetch, so tests-js/agent-tools.test.ts can check them.

export type Dato = { campo: string; etiqueta: string; valor: string; fuente?: string; aporto?: string; [k: string]: unknown };
export type Edicion = {
  eisteddfod: string;
  nombre: string;
  ano: number;
  url: string;
  estado: string;
  realizada: boolean | null;
  tapa: string | null;
  documentos: number;
  datos: Dato[];
};
export type Documento = {
  id: string;
  titulo: string;
  eisteddfod: string;
  nombre_eisteddfod: string;
  ano: number | null;
  categoria: string;
  tipo: string;
  url: string;
  miniatura: string | null;
  paginas?: string[];
  fuente?: string;
  fuente_url?: string;
};

/** Lower case, no accents or Welsh circumflexes ("Ŵyl Gerdd" → "wyl gerdd"), for matching. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** An absolute site URL from the data, as a path in the page's language ("…/chubut/1937/" → "/cy/chubut/1937/"). */
export function inLanguage(abs: string, toPath: (path: string) => string): string {
  try {
    return toPath(new URL(abs).pathname);
  } catch {
    return abs;
  }
}

export type DocQuery = { query?: string; festival?: string; year?: number; category?: string; limit?: number };

/**
 * Documents matching every word of `query` (in the title, the eisteddfod's name, the
 * category or the year), narrowed by festival, year and category; oldest first.
 */
export function searchDocuments(docs: Documento[], q: DocQuery): { total: number; results: Documento[] } {
  const words = fold(q.query ?? '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const hits = docs.filter((d) => {
    if (q.festival && d.eisteddfod !== q.festival) return false;
    if (q.year !== undefined && d.ano !== q.year) return false;
    if (q.category && d.categoria !== q.category) return false;
    if (!words.length) return true;
    const hay = fold(`${d.titulo} ${d.nombre_eisteddfod} ${d.categoria} ${d.ano ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
  hits.sort((a, b) => (a.ano ?? 9999) - (b.ano ?? 9999) || a.eisteddfod.localeCompare(b.eisteddfod) || a.titulo.localeCompare(b.titulo));
  const limit = Math.min(Math.max(Math.trunc(q.limit ?? 20), 1), 100);
  return { total: hits.length, results: hits.slice(0, limit) };
}

export type EdQuery = { festival?: string; from_year?: number; to_year?: number; status?: string };

/** Editions, oldest first, narrowed by festival, year range and archive status. */
export function listEditions(eds: Edicion[], q: EdQuery): Edicion[] {
  return eds
    .filter((e) =>
      (!q.festival || e.eisteddfod === q.festival) &&
      (q.from_year === undefined || e.ano >= q.from_year) &&
      (q.to_year === undefined || e.ano <= q.to_year) &&
      (!q.status || e.estado === q.status))
    .sort((a, b) => a.ano - b.ano || a.eisteddfod.localeCompare(b.eisteddfod));
}

/** One edition and its documents, or null when the archive has no page for it. */
export function getEdition(eds: Edicion[], docs: Documento[], festival: string, year: number): { edicion: Edicion; documentos: Documento[] } | null {
  const edicion = eds.find((e) => e.eisteddfod === festival && e.ano === year);
  if (!edicion) return null;
  return { edicion, documentos: docs.filter((d) => d.eisteddfod === festival && d.ano === year) };
}

export type PageRequest = { page: string; festival?: string; year?: number; document_id?: string; tab?: string };

const TABS = new Set(['subir', 'datos', 'recuerdo']);

/**
 * The site path (Spanish, unprefixed: the caller adds the language) for a page an
 * agent asks to open, or an error naming what is missing.
 */
export function pagePath(r: PageRequest, festivals: readonly string[]): { path: string } | { error: string } {
  const fest = r.festival && festivals.includes(r.festival) ? r.festival : null;
  const year = Number.isInteger(r.year) ? r.year : null;
  switch (r.page) {
    case 'home': return { path: '/' };
    case 'missing_programmes': return { path: '/#buscados' };
    case 'festival': return fest ? { path: `${fest}/` } : { error: 'festival is required' };
    case 'edition': return fest && year ? { path: `${fest}/${year}/` } : { error: 'festival and year are required' };
    case 'undated': return fest ? { path: `general/${fest}/` } : { error: 'festival is required' };
    case 'document':
      return r.document_id && /^[0-9a-f]{12}$/.test(r.document_id) ? { path: `item/${r.document_id}/` } : { error: 'document_id (12 hex characters) is required' };
    case 'contribute': {
      const q = new URLSearchParams();
      if (fest) q.set('f', fest);
      if (fest && year) q.set('y', String(year));
      if (r.tab && TABS.has(r.tab)) q.set('tab', r.tab);
      const s = q.toString();
      return { path: `contribuir${s ? `?${s}` : ''}` };
    }
    case 'tasks': return { path: 'tareas' };
    case 'leaderboard': return { path: 'ranking' };
    case 'accessibility': return { path: 'accesibilidad' };
    case 'about': return { path: 'objetivos' };
    case 'privacy': return { path: 'privacidad' };
    case 'sign_in': return { path: 'ingresar' };
    default: return { error: `unknown page "${r.page}"` };
  }
}

/** Page kinds open_page accepts, for its input schema. */
export const PAGES = ['home', 'missing_programmes', 'festival', 'edition', 'undated', 'document', 'contribute', 'tasks', 'leaderboard', 'accessibility', 'about', 'privacy', 'sign_in'] as const;
