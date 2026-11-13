import { describe, expect, it } from 'vitest';
import { fit, makePages, pdfScale, type DeriveDeps, type Surface } from '../src/lib/derive';

/** A stub canvas factory: every surface encodes to "<w>x<h>@<quality>". */
function surface(width: number, height: number, source: unknown = 'src'): Surface {
  return {
    width,
    height,
    source,
    encode: async (type, quality) => new Blob([`${width}x${height}@${quality}`], { type }),
  };
}

function stubDeps(over: Partial<DeriveDeps> = {}): DeriveDeps & { resized: [number, number][] } {
  const resized: [number, number][] = [];
  return {
    resized,
    decodeImage: async () => ({ width: 3000, height: 2000, source: 'img' }),
    resize: (_src, w, h) => {
      resized.push([w, h]);
      return surface(w, h);
    },
    openPdf: async () => ({ numPages: 0, render: async () => surface(1, 1) }),
    ...over,
  };
}

describe('makePages', () => {
  it('makePages scales long side to 1200', async () => {
    const deps = stubDeps();
    const r = await makePages(new Blob(['x']), 'image/jpeg', deps);
    expect(r.pages).toHaveLength(1);
    expect(await r.pages[0].text()).toBe('1200x800@0.7');
    expect(r.pages[0].type).toBe('image/webp');
    expect(await r.thumb.text()).toBe('320x213@0.6');
  });

  it('never upscales a small image', async () => {
    const deps = stubDeps({ decodeImage: async () => ({ width: 800, height: 600, source: 'img' }) });
    const r = await makePages(new Blob(['x']), 'image/png', deps);
    expect(await r.pages[0].text()).toBe('800x600@0.7');
    expect(await r.thumb.text()).toBe('320x240@0.6');
  });

  it('renders every PDF page; thumb from page 1', async () => {
    const rendered: number[] = [];
    const deps = stubDeps({
      openPdf: async () => ({
        numPages: 3,
        render: async (n: number) => {
          rendered.push(n);
          return surface(927, 1200, `page${n}`);
        },
      }),
    });
    const r = await makePages(new Blob(['%PDF']), 'application/pdf', deps);
    expect(rendered).toEqual([1, 2, 3]);
    expect(r.pages).toHaveLength(3);
    for (const p of r.pages) expect(await p.text()).toBe('927x1200@0.7');
    expect(await r.thumb.text()).toBe('247x320@0.6');
  });

  it('rejects other types and a non-WebP encoder', async () => {
    await expect(makePages(new Blob(['x']), 'image/gif', stubDeps())).rejects.toThrow('unsupported_type');
    const png = stubDeps({
      resize: (_s, w, h) => ({ width: w, height: h, source: 's', encode: async () => new Blob(['x'], { type: 'image/png' }) }),
    });
    await expect(makePages(new Blob(['x']), 'image/jpeg', png)).rejects.toThrow('webp_unsupported');
  });
});

describe('fit / pdfScale', () => {
  it('fit keeps aspect ratio and the long side', () => {
    expect(fit(3000, 2000, 1200)).toEqual([1200, 800]);
    expect(fit(2000, 3000, 320)).toEqual([213, 320]);
    expect(fit(100, 50, 1200)).toEqual([100, 50]);
  });

  it('pdfScale matches pdftoppm -r 110 then a 1200 px cap', () => {
    expect(pdfScale(612, 792)).toBeCloseTo(1200 / 792);
    expect(pdfScale(300, 400)).toBeCloseTo(110 / 72);
  });
});
