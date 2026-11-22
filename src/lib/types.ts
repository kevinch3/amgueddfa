export type FestivalSlug = 'chubut' | 'juventud' | 'mimosa' | 'trevelin';
export type CategorySlug =
  | 'programa'
  | 'programa-del-dia'
  | 'preliminares'
  | 'bases'
  | 'resultados'
  | 'otros';
export type ItemKind = 'image' | 'pdf' | 'doc' | 'web' | 'table';
export type EditionState = 'full' | 'some' | 'none';

export interface Item {
  id: string;
  festival: FestivalSlug;
  year: number | null;
  undated: boolean;
  category: CategorySlug;
  title: string;
  kind: ItemKind;
  src_path: string;
  alt_paths: string[];
  source_url: string | null;
  source_label: string;
  retrieved: string;
  note_public: string;
  /** Credit and licence line of a third-party holder (e.g. a platform item); empty for most items. */
  rights?: string;
  year_inferred: boolean;
  restricted: boolean;
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
