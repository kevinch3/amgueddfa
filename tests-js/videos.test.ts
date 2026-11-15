import { describe, expect, it } from 'vitest';
import { applyVideoReports, editionVideos, splitVideos, videoDiff, videoFromReport, videoThumb, videoUrl, type Video } from '../src/lib/videos';

const v = (over: Partial<Video>): Video => ({
  id: 'AAAAAAAAAAA', festival: 'chubut', year: 2015, kind: 'actuacion', title: 't',
  channel: 'c', date: '2015-10-30', year_inferred: false, ...over,
});

const list: Video[] = [
  v({ id: 'act00000002', title: 'B coro' }),
  v({ id: 'act00000001', title: 'A recitación' }),
  v({ id: 'news0000001', kind: 'noticia', title: 'Nota' }),
  v({ id: 'cer00000001', kind: 'ceremonia', title: 'Silla' }),
  v({ id: 'ses00000001', kind: 'sesion', title: 'Sábado' }),
  v({ id: 'other000001', festival: 'mimosa' }),
  v({ id: 'other000002', year: 2016 }),
];

describe('videos', () => {
  it('editionVideos keeps one edition, highlights first, then by title', () => {
    expect(editionVideos('chubut', 2015, list).map((x) => x.id))
      .toEqual(['cer00000001', 'ses00000001', 'news0000001', 'act00000001', 'act00000002']);
  });

  it('splitVideos separates highlights from individual performances', () => {
    const { highlights, performances } = splitVideos(editionVideos('chubut', 2015, list));
    expect(highlights.map((x) => x.kind)).toEqual(['ceremonia', 'sesion', 'noticia']);
    expect(performances).toHaveLength(2);
  });

  it('links and thumbnails point at YouTube', () => {
    expect(videoUrl('AAAAAAAAAAA')).toBe('https://www.youtube.com/watch?v=AAAAAAAAAAA');
    expect(videoThumb('AAAAAAAAAAA')).toBe('https://i.ytimg.com/vi/AAAAAAAAAAA/mqdefault.jpg');
  });

  const rep = (id: string, problema: string, at: string, arreglo?: Record<string, unknown>) => ({
    type: 'report', item_id: null, reviewed_at: at,
    payload: { objetivo: 'video', problema, video: { id, title: 'Patagonia 150', channel: 'Y Wladfa 150', kind: 'sesion' }, ...(arreglo ? { arreglo } : {}) },
  });

  it('applyVideoReports hides and moves by video id, latest wins, input untouched', () => {
    const src = [v({ id: 'MKRCg__AXC8' }), v({ id: 'milk52XMm-4', year_inferred: true }), v({ id: 'keep0000001' })];
    const out = applyVideoReports(src, [
      rep('MKRCg__AXC8', 'no_corresponde', '2026-11-15T10:00:00Z'),
      rep('milk52XMm-4', 'otra_edicion', '2026-11-15T12:00:00Z', { year: 2014 }),
      rep('milk52XMm-4', 'otra_edicion', '2026-11-15T11:00:00Z', { festival: 'mimosa', year: 2013 }),
      rep('keep0000001', 'otro', '2026-11-15T10:00:00Z'),
      rep('unknown0001', 'no_corresponde', '2026-11-15T10:00:00Z'),
      { type: 'report', item_id: 'keep0000001', payload: { objetivo: 'documento', problema: 'no_corresponde' }, reviewed_at: '2026-11-15T10:00:00Z' },
      { type: 'tag', item_id: null, payload: { video: { id: 'keep0000001' } } },
    ]);
    expect(out.map((x) => x.id)).toEqual(['milk52XMm-4', 'keep0000001']);
    // the later approval (year 2014) applies on top of the earlier move (mimosa 2013)
    expect(out[0]).toMatchObject({ festival: 'mimosa', year: 2014, year_inferred: false });
    expect(src.map((x) => x.id)).toHaveLength(3);
    expect(src[1]).toMatchObject({ festival: 'chubut', year: 2015, year_inferred: true });
  });

  it('videoFromReport rebuilds a card from the payload copy', () => {
    expect(videoFromReport(rep('milk52XMm-4', 'otra_edicion', '2026-11-15T10:00:00Z', { festival: 'juventud', year: 2014 })))
      .toEqual({ id: 'milk52XMm-4', festival: 'juventud', year: 2014, kind: 'sesion', title: 'Patagonia 150', channel: 'Y Wladfa 150', date: '', year_inferred: false });
    // a fix with only a year keeps the eisteddfod the report was filed under; with neither it cannot be placed
    expect(videoFromReport({ ...rep('milk52XMm-4', 'otra_edicion', '2026-11-15T10:00:00Z', { year: 2014 }), festival: 'chubut', year: 2015 }))
      .toMatchObject({ festival: 'chubut', year: 2014 });
    expect(videoFromReport(rep('milk52XMm-4', 'otra_edicion', '2026-11-15T10:00:00Z', { year: 2014 }))).toBeNull();
    expect(videoFromReport(rep('milk52XMm-4', 'no_corresponde', '2026-11-15T10:00:00Z'))).toBeNull();
  });

  it('videoDiff removes hidden and moved-away videos and adds moved-in ones once', () => {
    const at = (m: number) => `2026-11-15T10:0${m}:00Z`;
    const rows = [
      rep('aaaaaaaaaaa', 'no_corresponde', at(1)),
      rep('bbbbbbbbbbb', 'otra_edicion', at(2), { festival: 'juventud', year: 2014 }),
      rep('ccccccccccc', 'otro', at(3)),
      { ...rep('ddddddddddd', 'otra_edicion', at(4), { festival: 'chubut', year: 2015 }), festival: 'mimosa', year: 2013 },
      { ...rep('ddddddddddd', 'otra_edicion', at(5), { year: 2015 }), festival: 'chubut', year: 2014 },
      { ...rep('eeeeeeeeeee', 'otra_edicion', at(6), { year: 2016 }), festival: 'chubut', year: 2015 },
      // hidden earlier, so a later move cannot bring it back (as at build time)
      { ...rep('fffffffffff', 'no_corresponde', at(1)), festival: 'chubut', year: 2015 },
      { ...rep('fffffffffff', 'otra_edicion', at(7), { festival: 'chubut', year: 2015 }), festival: 'mimosa', year: 2013 },
    ];
    const d = videoDiff('chubut', 2015, ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'], rows);
    expect(d.remove).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    expect(d.add.map((x) => x.id)).toEqual(['ddddddddddd']);
    expect(d.add[0]).toMatchObject({ festival: 'chubut', year: 2015, title: 'Patagonia 150', kind: 'sesion' });
    expect(videoDiff('chubut', 2015, ['ccccccccccc'], [])).toEqual({ remove: [], add: [] });
  });
});
