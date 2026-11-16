// @ts-check
import { defineConfig } from 'astro/config';

// Spanish pages are the only source pages. Every other language is built from them
// at /<locale>/… ("rewrite" renders the Spanish page there, in that language: see
// src/middleware.ts and src/lib/i18n.ts).
const OTHER_LOCALES = ['cy', 'en', 'zh', 'it', 'fr', 'sv'];

export default defineConfig({
  site: 'https://amgueddfa.org',
  base: '/',
  i18n: {
    defaultLocale: 'es',
    locales: ['es', ...OTHER_LOCALES],
    routing: { prefixDefaultLocale: false, fallbackType: 'rewrite' },
    fallback: Object.fromEntries(OTHER_LOCALES.map((l) => [l, 'es'])),
  },
  // The current language is shared state set per page by the middleware: keep
  // pages rendering one at a time.
  build: { concurrency: 1 },
});
