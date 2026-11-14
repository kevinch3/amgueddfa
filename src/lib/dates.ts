// Dates and times shown to people, in their saved timezone (or the browser's).
// Historical fact dates are not this: they stay in UTC (contrib.ts longDate).
import { isTimeZone } from './places';

const KEY = 'amg:tz';
let current: string | null | undefined;

/** Remember the signed-in user's timezone for this and later visits (null forgets it). */
export function setUserTimeZone(tz: string | null | undefined): void {
  current = isTimeZone(tz) ? tz : null;
  try {
    if (current) localStorage.setItem(KEY, current);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the in-memory value still applies */
  }
}

/** The saved timezone, or undefined to use the browser's own. */
export function userTimeZone(): string | undefined {
  if (current === undefined) {
    try {
      const saved = localStorage.getItem(KEY);
      current = isTimeZone(saved) ? saved : null;
    } catch {
      current = null;
    }
  }
  return current ?? undefined;
}

function parse(iso: string | null | undefined): Date | null {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** "14 de noviembre de 2026" in the user's timezone; '' for a missing or bad date. */
export function fecha(iso: string | null | undefined, timeZone = userTimeZone()): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone }) : '';
}

/** "14 de nov de 2026, 10:32" (24 h) in the user's timezone; '' for a missing or bad date. */
export function fechaHora(iso: string | null | undefined, timeZone = userTimeZone()): string {
  const d = parse(iso);
  return d ? d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone }) : '';
}

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
];

/**
 * "hace 5 minutos", "ayer", "hace 3 días" for the last week; older (or future)
 * dates fall back to fecha(). '' for a missing or bad date.
 */
export function relativa(iso: string | null | undefined, now = Date.now(), timeZone = userTimeZone()): string {
  const d = parse(iso);
  if (!d) return '';
  let diff = (d.getTime() - now) / 1000; // negative = past
  if (diff > 60) return fecha(iso, timeZone);
  const rtf = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });
  if (Math.abs(diff) < 45) return rtf.format(0, 'second'); // "ahora"
  for (const [unit, size] of STEPS) {
    if (Math.abs(diff) < size) return rtf.format(Math.round(diff), unit);
    diff /= size;
  }
  return fecha(iso, timeZone);
}
