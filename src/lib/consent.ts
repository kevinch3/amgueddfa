// Whether this visit is counted by Cloudflare Web Analytics.
// The beacon sets no cookies and stores nothing; the only thing kept here is the
// visitor's own "don't count me" choice (see /cookies). Do-not-track and Global
// Privacy Control turn counting off too.

export const OPT_OUT_KEY = 'amg:no-contar';
export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

export type Signals = { optOut: boolean; dnt: boolean; gpc: boolean };

type Win = { localStorage?: Storage; navigator?: Navigator };

export function shouldCount(s: Signals): boolean {
  return !s.optOut && !s.dnt && !s.gpc;
}

/** Read the three signals; storage that throws or is missing reads as "not opted out". */
export function readSignals(win: Win = globalThis as Win): Signals {
  let optOut = false;
  try {
    optOut = win.localStorage?.getItem(OPT_OUT_KEY) === '1';
  } catch {
    optOut = false;
  }
  const nav = win.navigator as (Navigator & { globalPrivacyControl?: boolean }) | undefined;
  return { optOut, dnt: nav?.doNotTrack === '1', gpc: nav?.globalPrivacyControl === true };
}

/** Save or clear the opt-out. False when the browser refuses to store it. */
export function setOptOut(on: boolean, storage?: Storage): boolean {
  try {
    const s = storage ?? globalThis.localStorage;
    if (on) s.setItem(OPT_OUT_KEY, '1');
    else s.removeItem(OPT_OUT_KEY);
    return true;
  } catch {
    return false;
  }
}
