/**
 * Browser-side derivatives of an approved upload: the same limits as the local
 * build (scripts/catalog/derive.py): pages 1200 px long side at WebP q 0.7,
 * thumbnail 320 px at q 0.6, PDFs rendered page by page (pdftoppm -r 110 equivalent).
 * Images are drawn on OffscreenCanvas; PDFs go through pdfjs-dist. The canvas
 * work sits behind `DeriveDeps` so tests can inject a stub factory.
 */

export const PAGE_LONG = 1200;
export const PAGE_Q = 0.7;
export const THUMB_LONG = 320;
export const THUMB_Q = 0.6;
const PDF_DPI = 110;
const WEBP = 'image/webp';

/** A drawn bitmap that can be encoded and drawn again (for the thumbnail). */
export interface Surface {
  width: number;
  height: number;
  source: unknown;
  encode(type: string, quality: number): Promise<Blob>;
}

export interface DeriveDeps {
  decodeImage(file: Blob): Promise<{ width: number; height: number; source: unknown; close?: () => void }>;
  /** Draw `source` into a new w x h surface. */
  resize(source: unknown, w: number, h: number): Surface;
  /** Open a PDF; `render(n)` draws page n (1-based) at `pdfScale`. */
  openPdf(file: Blob): Promise<{ numPages: number; render(n: number): Promise<Surface>; close?: () => void }>;
}

/** Fit (w, h) so the long side is at most `max`; never upscales (like PIL thumbnail). */
export function fit(w: number, h: number, max: number): [number, number] {
  const long = Math.max(w, h);
  if (long <= max) return [Math.round(w), Math.round(h)];
  const s = max / long;
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

/** Render scale for a PDF page of (w, h) points: 110 dpi, capped so the long side is 1200 px. */
export function pdfScale(w: number, h: number): number {
  return Math.min(PDF_DPI / 72, PAGE_LONG / Math.max(w, h));
}

async function webp(s: Surface, quality: number): Promise<Blob> {
  const b = await s.encode(WEBP, quality);
  // Some browsers silently fall back to PNG; never publish that as .webp.
  if (b.type !== WEBP) throw new Error('webp_unsupported');
  return b;
}

async function fromSurface(deps: DeriveDeps, src: Surface, withThumb: boolean): Promise<{ page: Blob; thumb: Blob | null }> {
  const [w, h] = fit(src.width, src.height, PAGE_LONG);
  const sized = w === src.width && h === src.height ? src : deps.resize(src.source, w, h);
  const page = await webp(sized, PAGE_Q);
  let thumb: Blob | null = null;
  if (withThumb) {
    const [tw, th] = fit(src.width, src.height, THUMB_LONG);
    thumb = await webp(deps.resize(src.source, tw, th), THUMB_Q);
  }
  return { page, thumb };
}

export async function makePages(
  file: Blob,
  mime: string,
  deps: DeriveDeps = browserDeps(),
): Promise<{ pages: Blob[]; thumb: Blob }> {
  if (mime === 'application/pdf') {
    const doc = await deps.openPdf(file);
    try {
      if (!doc.numPages) throw new Error('empty_pdf');
      const pages: Blob[] = [];
      let thumb: Blob | null = null;
      for (let n = 1; n <= doc.numPages; n++) {
        const r = await fromSurface(deps, await doc.render(n), n === 1);
        pages.push(r.page);
        if (r.thumb) thumb = r.thumb;
      }
      return { pages, thumb: thumb as Blob };
    } finally {
      doc.close?.();
    }
  }
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
    const img = await deps.decodeImage(file);
    try {
      const [w, h] = fit(img.width, img.height, PAGE_LONG);
      const page = await webp(deps.resize(img.source, w, h), PAGE_Q);
      const [tw, th] = fit(img.width, img.height, THUMB_LONG);
      const thumb = await webp(deps.resize(img.source, tw, th), THUMB_Q);
      return { pages: [page], thumb };
    } finally {
      img.close?.();
    }
  }
  throw new Error('unsupported_type');
}

/* ---------- real browser implementation ---------- */

function offscreen(source: unknown, w: number, h: number): Surface {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  return { width: w, height: h, source: c, encode: (type, quality) => c.convertToBlob({ type, quality }) };
}

async function openPdfJs(file: Blob): ReturnType<DeriveDeps['openPdf']> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return {
    numPages: doc.numPages,
    async render(n: number): Promise<Surface> {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pdfScale(base.width, base.height) });
      // pdfjs draws on a DOM canvas; the result is then copied to OffscreenCanvas for encoding.
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no_canvas');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      page.cleanup();
      return offscreen(canvas, canvas.width, canvas.height);
    },
    close: () => void doc.destroy(),
  };
}

export function browserDeps(): DeriveDeps {
  return {
    decodeImage: async (file) => {
      const bmp = await createImageBitmap(file);
      return { width: bmp.width, height: bmp.height, source: bmp, close: () => bmp.close() };
    },
    resize: offscreen,
    openPdf: openPdfJs,
  };
}
