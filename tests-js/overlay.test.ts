// The item overlay's shared cases: tests/test_overlay.py runs the same file against the Python port.
import { describe, expect, it } from 'vitest';
import cases from '../tests/fixtures/overlay.json';
import { applyTags, type Taggable, type TagLike } from '../src/lib/tags';

describe('overlay (shared cases)', () => {
  for (const c of cases.cases as { name: string; base?: Partial<Taggable>; tags: TagLike[]; expect: Record<string, unknown> }[]) {
    it(c.name, () => {
      const base = { ...cases.base, ...c.base } as Taggable;
      const [out] = applyTags([base], c.tags);
      // `expect` names nested fields with dots ("fecha.year"), so the Python port reads it the same way.
      const at = (o: any, k: string) => k.split('.').reduce((x, p) => x?.[p], o);
      expect(Object.fromEntries(Object.keys(c.expect).map((k) => [k, at(out, k)]))).toEqual(c.expect);
      expect(base).toEqual({ ...cases.base, ...c.base }); // never mutates its input
    });
  }
});
