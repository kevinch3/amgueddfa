// Photos and press of an edition, shown together in the Multimedia section (issue #26).
// They are "otros" items filed in the archive's Fotos/ or Prensa/ folders.
import { isPublic } from './visibilidad';
import { byTitle } from './site';
import type { Item } from './types';

export type MediaKind = 'foto' | 'prensa';

/** "foto" or "prensa" by the item's archive folder; null for anything else. */
export function mediaKind(item: Pick<Item, 'src_path'>): MediaKind | null {
  const folder = item.src_path.split('/').at(-2);
  return folder === 'Fotos' ? 'foto' : folder === 'Prensa' ? 'prensa' : null;
}

/** The edition's public photos (first) and press, each group by title. */
export function mediaItems(list: Item[]): { item: Item; kind: MediaKind }[] {
  const out = list
    .filter((i) => isPublic(i) && !i.hidden)
    .flatMap((i) => {
      const kind = mediaKind(i);
      return kind ? [{ item: i, kind }] : [];
    });
  return out.sort((a, b) => (a.kind === b.kind ? byTitle(a.item, b.item) : a.kind === 'foto' ? -1 : 1));
}
