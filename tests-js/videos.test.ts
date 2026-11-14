import { describe, expect, it } from 'vitest';
import { editionVideos, splitVideos, videoThumb, videoUrl, type Video } from '../src/lib/videos';

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
});
