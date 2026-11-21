// The tools and resources behind the archive's texts and site (page /creditos/, issue #82).
// Names, links and licences are not translated; what each one does is i18n `legal.creditos.<key>`.

export type Credito = { key: string; nombre: string; href: string; licencia?: string; lang?: string };

const REPO = 'https://github.com/kevinch3/amgueddfa-eisteddfod';
/** How a reconstructed video text is made and checked. */
export const COMO_SE_RECONSTRUYE = `${REPO}/blob/main/docs/restauracion-videos.md`;
/** Model id of the reconstruction (scripts/reconstruct/model.py). */
export const MODELO_RECONSTRUCCION = 'claude-sonnet-5-5';

export const VIDEOS: Credito[] = [
  { key: 'gales', nombre: 'techiaith/whisper-large-ft-cy-en', href: 'https://huggingface.co/techiaith/whisper-large-ft-cy-en', licencia: 'Apache-2.0' },
  { key: 'youtube', nombre: 'YouTube', href: 'https://support.google.com/youtube/answer/6373554' },
  { key: 'whisper', nombre: 'OpenAI Whisper (large-v3-turbo)', href: 'https://github.com/openai/whisper', licencia: 'MIT' },
  { key: 'faster_whisper', nombre: 'faster-whisper / CTranslate2', href: 'https://github.com/SYSTRAN/faster-whisper', licencia: 'MIT' },
  { key: 'claude', nombre: `Claude (Anthropic, ${MODELO_RECONSTRUCCION})`, href: 'https://www.anthropic.com/claude' },
];

export const DOCUMENTOS: Credito[] = [
  { key: 'tesseract', nombre: 'Tesseract OCR', href: 'https://github.com/tesseract-ocr/tesseract', licencia: 'Apache-2.0' },
];

export const SITIO: Credito[] = [
  { key: 'astro', nombre: 'Astro', href: 'https://astro.build/', licencia: 'MIT' },
  { key: 'pagefind', nombre: 'Pagefind', href: 'https://pagefind.app/', licencia: 'MIT' },
  { key: 'supabase', nombre: 'Supabase', href: 'https://supabase.com/' },
  { key: 'pages', nombre: 'GitHub Pages', href: 'https://pages.github.com/' },
  { key: 'cloudflare', nombre: 'Cloudflare (R2, Web Analytics)', href: 'https://www.cloudflare.com/' },
  { key: 'ytdlp', nombre: 'yt-dlp', href: 'https://github.com/yt-dlp/yt-dlp', licencia: 'Unlicense' },
  { key: 'ffmpeg', nombre: 'FFmpeg', href: 'https://ffmpeg.org/', licencia: 'LGPL-2.1+' },
];
