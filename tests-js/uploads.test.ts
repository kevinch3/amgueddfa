import type { Fecha } from '../src/lib/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { editionState, mostWanted, setItems } from '../src/lib/catalog';
import type { Item } from '../src/lib/types';
import { maxState, mediaUrl, uploadMedia, uploadState, uploadStates, type UploadLike } from '../src/lib/uploads';

const CID = '0b6f1c1e-2a3b-4c5d-8e9f-0123456789ab';
const media = (id = CID) => ({ thumb: `uploads/${id}/thumb.webp`, pages: [`uploads/${id}/p01.webp`, `uploads/${id}/p02.webp`] });
const up = (over: Partial<UploadLike> = {}): UploadLike => ({
  id: CID, type: 'upload', coleccion: 'chubut', year: 1995, payload: { tipo: 'programa', media: media(), complete: true }, ...over,
});

describe('uploadMedia', () => {
  it('returns the validated thumb and pages', () => {
    expect(uploadMedia(up())).toEqual(media());
  });

  it('drops paths outside uploads/<this id>/ or with odd names', () => {
    const bad = up({
      payload: {
        media: {
          thumb: `uploads/${CID}/../x.webp`,
          pages: [`uploads/${CID}/p01.webp`, 'released/abc/p01.webp', `uploads/${CID}/p1.webp`, `uploads/aaaaaaaa-2a3b-4c5d-8e9f-0123456789ab/p02.webp`, 'javascript:alert(1)'],
        },
      },
    });
    expect(uploadMedia(bad)).toEqual({ thumb: null, pages: [`uploads/${CID}/p01.webp`] });
  });

  it('null when there is nothing usable', () => {
    expect(uploadMedia(up({ payload: { tipo: 'programa' } }))).toBeNull();
    expect(uploadMedia(up({ payload: { media: { thumb: 42, pages: 'x' } } }))).toBeNull();
    expect(uploadMedia(up({ type: 'fact' }))).toBeNull();
  });
});

describe('mediaUrl', () => {
  it('public object URL in the media bucket, or null without a backend', () => {
    expect(mediaUrl('https://abc.supabase.co/', `uploads/${CID}/thumb.webp`)).toBe(
      `https://abc.supabase.co/storage/v1/object/public/media/uploads/${CID}/thumb.webp`,
    );
    expect(mediaUrl('', 'uploads/x/thumb.webp')).toBeNull();
    expect(mediaUrl(undefined, 'uploads/x/thumb.webp')).toBeNull();
  });
});

describe('upload coverage', () => {
  it('a programa upload with pages makes the edition full; anything else some', () => {
    expect(uploadState([up()], 'chubut', 1995)).toBe('full');
    expect(uploadState([up({ payload: { tipo: 'bases', media: media() } })], 'chubut', 1995)).toBe('some');
    expect(uploadState([up({ payload: { tipo: 'programa' } })], 'chubut', 1995)).toBe('some');
    expect(uploadState([up()], 'chubut', 1996)).toBe('none');
    expect(uploadState([up({ type: 'memory' })], 'chubut', 1995)).toBe('none');
  });

  it('a programa upload is full only when an admin confirmed complete', () => {
    expect(uploadState([up({ payload: { tipo: 'programa', media: media() } })], 'chubut', 1995)).toBe('some');
    expect(uploadState([up({ payload: { tipo: 'programa', media: media(), complete: true } })], 'chubut', 1995)).toBe('full');
    expect(uploadState([up({ payload: { tipo: 'programa', media: media(), tapa: true } })], 'chubut', 1995)).toBe('some');
    expect(uploadState([up({ payload: { tipo: 'programa', media: media(), complete: 'true' } })], 'chubut', 1995)).toBe('some');
  });

  it('uploadStates keys by coleccion:year with the best state', () => {
    const m = uploadStates([up({ payload: { tipo: 'bases' } }), up(), up({ year: 2001, payload: { tipo: 'otros' } })]);
    expect([...m.entries()].sort()).toEqual([['chubut:1995', 'full'], ['chubut:2001', 'some']]);
  });

  it('maxState never downgrades', () => {
    expect(maxState('full', 'some')).toBe('full');
    expect(maxState('none', 'some')).toBe('some');
  });
});

describe('catalog with approved uploads', () => {
  const mk = (over: Omit<Partial<Item>, 'fecha'> & { fecha?: Partial<Fecha> }): Item => ({
    id: 'aaaaaaaaaaaa', coleccion: 'chubut', tipo: 'otros', title: 't', formato: 'image',
    src_path: 'x', alt_paths: [], source_url: null, source_label: 'l', retrieved: '2026-01-01', note_public: '',
    restricted: false, pages: 1, thumb: null, page_paths: [], text_excerpt: null, table: null, ...over,
    fecha: { year: 1990, inferred: false, undated: false, ...over.fecha },
  });
  beforeEach(() => setItems([mk({ fecha: { year: 1995 }, tipo: 'bases' }), mk({ id: 'b', fecha: { year: 1996 } })]));

  it('editionState upgrades with uploads', () => {
    expect(editionState('chubut', 1995, [])).toBe('some');
    expect(editionState('chubut', 1995, [up()])).toBe('full');
    expect(editionState('chubut', 1997, [up({ year: 1997, payload: { tipo: 'otros' } })])).toBe('some');
  });

  it('mostWanted leaves out editions an approved programa filled', () => {
    const before = mostWanted(50, []).map((w) => w.year);
    expect(before).toContain(1995);
    const after = mostWanted(50, [up()]).map((w) => w.year);
    expect(after).not.toContain(1995);
    expect(after).toContain(1996);
  });
});
