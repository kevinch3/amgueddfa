import { describe, expect, it } from 'vitest';
import { mediaItems, mediaKind } from '../src/lib/media';
import type { Item } from '../src/lib/types';

const item = (over: Partial<Item>): Item =>
  ({ id: 'x', festival: 'chubut', year: 1913, category: 'otros', title: 'T', kind: 'image', src_path: 'Eisteddfod_del_Chubut/1913/Fotos/a.jpg', restricted: false, hidden: false, ...over }) as Item;

describe('media', () => {
  it('knows photos and press by their archive folder', () => {
    expect(mediaKind(item({}))).toBe('foto');
    expect(mediaKind(item({ src_path: 'Eisteddfod_del_Chubut/1954/Prensa/p.jpg' }))).toBe('prensa');
    expect(mediaKind(item({ src_path: 'Eisteddfod_del_Chubut/2019/Prensa/web_x.html', kind: 'web' }))).toBe('prensa');
    expect(mediaKind(item({ src_path: 'Eisteddfod_del_Chubut/1913/Otros/a.jpg' }))).toBeNull();
    expect(mediaKind(item({ category: 'resultados', src_path: 'Eisteddfod_del_Chubut/1913/Resultados/y.jpg' }))).toBeNull();
  });

  it('lists public photos first, then press, by title; restricted and hidden items stay out', () => {
    const list = [
      item({ id: 'p', title: 'B prensa', src_path: 'E/1/Prensa/b.jpg' }),
      item({ id: 'f2', title: 'Z foto' }),
      item({ id: 'f1', title: 'A foto' }),
      item({ id: 'r', title: 'R', restricted: true }),
      item({ id: 'h', title: 'H', hidden: true }),
      item({ id: 'o', title: 'O', src_path: 'E/1/Otros/o.jpg' }),
    ];
    expect(mediaItems(list).map((m) => [m.item.id, m.kind])).toEqual([['f1', 'foto'], ['f2', 'foto'], ['p', 'prensa']]);
  });
});
