/** The latest of several ISO dates; null when none is a valid date. Future dates (clock skew) count as now. */
export function latest(dates: (string | null | undefined)[], now = Date.now()): string | null {
  let best = -Infinity;
  for (const d of dates) {
    const ms = d ? Date.parse(d) : NaN;
    if (!Number.isNaN(ms)) best = Math.max(best, Math.min(ms, now));
  }
  return best === -Infinity ? null : new Date(best).toISOString();
}
