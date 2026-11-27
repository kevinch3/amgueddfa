/**
 * The museum's collections and the site-wide list of record types, read from
 * src/data/colecciones.json (docs/reglas.md, rule 1). A collection exists only as
 * an entry there: pages, addresses, contribution forms and the catalog builder
 * all read the list. Nothing here imports the rest of the site.
 */
import raw from '../data/colecciones.json';

export type Visibilidad = 'publico' | 'solo_ficha' | 'privado';
/** How a collection is browsed: by edition (year pages) or by dated issue (the press). */
export type Forma = 'ediciones' | 'numeros';

export interface Coleccion {
  id: string;
  /** Address segment its pages live under (/eisteddfod/…). */
  grupo: string;
  forma: Forma;
  /** Folder of the private archive its files are scanned from. */
  carpeta: string;
  /** Record types it uses: a subset of TIPOS. */
  tipos: string[];
  /** Winners lists are published (#29: not the children's festivals). */
  ganadores_publicos: boolean;
  /** Video transcripts are published and can be corrected (#29). */
  texto_de_videos: boolean;
  /** Rights of its records that state none, and have no source statement (lib/derechos.ts). */
  derechos_por_defecto: { licencia: string; titular: string } | null;
  visibilidad_por_defecto: Visibilidad;
  /** When the maintainer opened it to the public (required when the default is publico). */
  abierta?: string;
}

const data = raw as { tipos: string[]; grupos: string[]; formas: Forma[]; colecciones: Coleccion[] };

/** Every record type the site knows, in display order (translations: categorias.<tipo>). */
export const TIPOS: readonly string[] = data.tipos;
export const GRUPOS: readonly string[] = data.grupos;
export const FORMAS: readonly Forma[] = data.formas;
export const VISIBILIDADES: readonly Visibilidad[] = ['publico', 'solo_ficha', 'privado'];
export const COLECCIONES: readonly Coleccion[] = data.colecciones;

const BY_ID = new Map(COLECCIONES.map((c) => [c.id, c]));

export function coleccion(id: string): Coleccion | undefined {
  return BY_ID.get(id);
}

export function isColeccion(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/** Ids of the collections in one group, in list order. */
export function idsDe(grupo: string): string[] {
  return COLECCIONES.filter((c) => c.grupo === grupo).map((c) => c.id);
}

/** The Eisteddfod archive's festivals. */
export const FESTIVAL_IDS: readonly string[] = idsDe('eisteddfod');
/** Festivals whose winners lists are published. */
export const PUBLIC_WINNERS: readonly string[] = COLECCIONES.filter((c) => c.ganadores_publicos).map((c) => c.id);
/** Festivals whose video transcripts are published and can be corrected. */
export const VIDEO_TEXT_FESTIVALS: readonly string[] = COLECCIONES.filter((c) => c.texto_de_videos).map((c) => c.id);
