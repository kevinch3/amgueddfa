import { describe, expect, it } from 'vitest';
import { latest } from '../src/lib/ultimo-cambio';

const NOW = Date.parse('2026-11-18T12:00:00Z');

describe('latest', () => {
  it('picks the newest valid date', () => {
    expect(latest(['2026-11-17T10:00:00Z', null, '2026-11-18T09:00:00+00:00', 'bad'], NOW)).toBe('2026-11-18T09:00:00.000Z');
  });
  it('caps future dates at now', () => {
    expect(latest(['2026-11-19T00:00:00Z'], NOW)).toBe('2026-11-18T12:00:00.000Z');
  });
  it('is null with nothing usable', () => {
    expect(latest([null, undefined, ''], NOW)).toBeNull();
  });
});
