import type { Visibilidad } from './colecciones';

/** A collection id from src/data/colecciones.json (checked by tests-js/colecciones.test.ts). */
export type FestivalSlug = string;
export type CategorySlug =
  | 'programa'
  | 'programa-del-dia'
  | 'preliminares'
  | 'bases'
  | 'resultados'
  | 'otros';
export type ItemKind = 'image' | 'pdf' | 'doc' | 'web' | 'table';
export type EditionState = 'full' | 'some' | 'none';

/** When a record is from (docs/reglas.md, rule 2): its year, whether we guessed it, or that it has none. */
export interface Fecha {
  year: number | null;
  /** The year is our estimate (from the file, the upload date…), not the document's own. */
  inferred: boolean;
  /** No year at all: kept with the collection's undated records. */
  undated: boolean;
  month?: number | null;
  day?: number | null;
}

export interface Item {
  id: string;
  coleccion: FestivalSlug;
  fecha: Fecha;
  tipo: CategorySlug;
  title: string;
  formato: ItemKind;
  src_path: string;
  alt_paths: string[];
  source_url: string | null;
  source_label: string;
  retrieved: string;
  note_public: string;
  /** Credit and licence line of a third-party holder (e.g. a platform item); empty for most items. */
  rights?: string;
  /** Old flag, kept in step with visibilidad by the catalog builder; read through lib/visibilidad.ts. */
  restricted: boolean;
  /** publico | solo_ficha (catalog.json never holds privado): docs/reglas.md, rule 5. */
  visibilidad?: Visibilidad;
  /** The date the catalog builder opens it on, if set. */
  publico_desde?: string | null;
  /** Set by an approved "no corresponde" report: off every list, page kept with a notice. */
  hidden?: boolean;
  /** Nothing to transcribe (a cover, poster, rules slide…): set by an admin correction. */
  no_text?: boolean;
  pages: number;
  thumb: string | null;
  page_paths: string[];
  /** [width, height] of page 1 (scripts/catalog/derive.py), for an image's width/height attributes. */
  page_size?: [number, number] | null;
  text_excerpt: string | null;
  table: Record<string, unknown>[] | null;
}
