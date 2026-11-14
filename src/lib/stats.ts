// Bucketing of the hourly sign-in counts (admin "Estadísticas") in a viewer's timezone.

export type HourCount = { hour: string; n: number };

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fmts = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    fmts.set(tz, f);
  }
  return f;
}

/** Local calendar day (YYYY-MM-DD), weekday (0 = Monday … 6 = Sunday) and hour (0–23). */
export function localParts(iso: string, tz: string): { day: string; weekday: number; hour: number } {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, weekday: WEEKDAYS.indexOf(p.weekday), hour: Number(p.hour) % 24 };
}

/** The calendar day `n` days before `day` (plain date arithmetic, no timezone involved). */
function minusDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Counts per local day: exactly `days` entries, oldest first, ending on `now`'s local day. */
export function perDay(rows: HourCount[], tz: string, days: number, now: Date): { day: string; n: number }[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const { day } = localParts(r.hour, tz);
    sums.set(day, (sums.get(day) ?? 0) + r.n);
  }
  const today = localParts(now.toISOString(), tz).day;
  return Array.from({ length: days }, (_, i) => {
    const day = minusDays(today, days - 1 - i);
    return { day, n: sums.get(day) ?? 0 };
  });
}

/** 7 × 24 grid (weekday × local hour) of summed counts: when the rushes happen. */
export function weekHourGrid(rows: HourCount[], tz: string): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const r of rows) {
    const { weekday, hour } = localParts(r.hour, tz);
    if (weekday >= 0) grid[weekday][hour] += r.n;
  }
  return grid;
}
