// Every page renders in the language of its URL: Astro builds /cy/…, /en/… and the
// rest from the Spanish pages (i18n fallback "rewrite"), and tells us which one in
// currentLocale. Pages render one after another (build.concurrency 1), so setting
// the shared language here holds for the whole page.
import { defineMiddleware } from 'astro:middleware';
import { DEFAULT_LOCALE, isLocale, setLocale } from './lib/i18n';

export const onRequest = defineMiddleware((ctx, next) => {
  setLocale(isLocale(ctx.currentLocale) ? ctx.currentLocale : DEFAULT_LOCALE);
  return next();
});
