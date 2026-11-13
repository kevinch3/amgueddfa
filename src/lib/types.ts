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
  year_inferred: boolean;
  restricted: boolean;
  pages: number;
  thumb: string | null;
  page_paths: string[];
  text_excerpt: string | null;
  table: Record<string, unknown>[] | null;
}
