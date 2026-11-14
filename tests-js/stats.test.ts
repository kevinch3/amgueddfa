import { describe, expect, it } from 'vitest';
import { localParts, perDay, weekHourGrid } from '../src/lib/stats';

const AR = 'America/Argentina/Buenos_Aires';
const rows = [
  { hour: '2026-11-14T02:00:00Z', n: 3 }, // 23:00 Friday 13 Nov in Argentina
  { hour: '2026-11-14T15:00:00Z', n: 2 }, // 12:00 Saturday 14 Nov
];

describe('sign-in stats', () => {
  it('localParts crosses UTC midnight', () => {
    expect(localParts('2026-11-14T02:00:00Z', AR)).toEqual({ day: '2026-11-13', weekday: 4, hour: 23 });
    expect(localParts('2026-11-14T02:00:00Z', 'UTC')).toEqual({ day: '2026-11-14', weekday: 5, hour: 2 });
  });

  it('perDay fills zeros and ends today', () => {
    expect(perDay(rows, AR, 3, new Date('2026-11-14T20:00:00Z'))).toEqual([
      { day: '2026-11-12', n: 0 },
      { day: '2026-11-13', n: 3 },
      { day: '2026-11-14', n: 2 },
    ]);
  });

  it('perDay with no rows', () => {
    expect(perDay([], AR, 2, new Date('2026-11-14T20:00:00Z'))).toEqual([
      { day: '2026-11-13', n: 0 },
      { day: '2026-11-14', n: 0 },
    ]);
  });

  it('weekHourGrid sums by local weekday and hour', () => {
    const grid = weekHourGrid([...rows, { hour: '2026-11-21T15:00:00Z', n: 1 }], AR);
    expect(grid).toHaveLength(7);
    expect(grid.every((r) => r.length === 24)).toBe(true);
    expect(grid[4][23]).toBe(3);
    expect(grid[5][12]).toBe(3);
    expect(grid.flat().reduce((a, b) => a + b, 0)).toBe(6);
  });
});
