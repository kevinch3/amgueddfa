// Build-time view of the source pages: the catalog plus the last export of
// approved contributions. Kept apart from fuentes.ts so browser scripts that
// import fuentes.ts do not pull in the whole catalog.
import approvedRaw from '../../data/approved/contributions.json';
import { items } from './catalog';
import type { Contribution } from './contrib';
import { buildSources, type Source } from './fuentes';

let cache: Map<string, Source> | null = null;

/** Every source page the build makes, keyed by slug. */
export function siteSources(): Map<string, Source> {
  cache ??= buildSources(items(), approvedRaw as Contribution[]);
  return cache;
}

/** Slugs of every source page, for links rendered in the browser. */
export function sourceSlugs(): Set<string> {
  return new Set(siteSources().keys());
}

/** Slugs of the source pages contributions point to (what browser scripts need to link them). */
export function contributionSourceSlugs(): string[] {
  return [...siteSources().values()].filter((s) => s.contributions.length > 0).map((s) => s.slug);
}
