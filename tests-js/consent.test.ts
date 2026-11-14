import { describe, expect, it } from 'vitest';
import { OPT_OUT_KEY, readSignals, setOptOut, shouldCount } from '../src/lib/consent';

/** A Map-backed Storage, or one whose every call throws (Safari private mode, blocked site data). */
function storage(init: Record<string, string> = {}, broken = false): Storage {
  const m = new Map(Object.entries(init));
  const guard = <T>(f: () => T): T => {
    if (broken) throw new DOMException('blocked', 'SecurityError');
    return f();
  };
  return {
    get length() { return guard(() => m.size); },
    clear: () => guard(() => m.clear()),
    getItem: (k) => guard(() => m.get(k) ?? null),
    key: (i) => guard(() => [...m.keys()][i] ?? null),
    removeItem: (k) => guard(() => void m.delete(k)),
    setItem: (k, v) => guard(() => void m.set(k, String(v))),
  };
}

const nav = (o: Record<string, unknown> = {}) => o as unknown as Navigator;

describe('consent', () => {
  it('shouldCount truth table', () => {
    expect(shouldCount({ optOut: false, dnt: false, gpc: false })).toBe(true);
    expect(shouldCount({ optOut: true, dnt: false, gpc: false })).toBe(false);
    expect(shouldCount({ optOut: false, dnt: true, gpc: false })).toBe(false);
    expect(shouldCount({ optOut: false, dnt: false, gpc: true })).toBe(false);
  });

  it('readSignals reads the opt-out key, DNT and GPC', () => {
    expect(OPT_OUT_KEY).toBe('amg:no-contar');
    expect(readSignals({ localStorage: storage({ 'amg:no-contar': '1' }), navigator: nav() })).toEqual({ optOut: true, dnt: false, gpc: false });
    expect(readSignals({ localStorage: storage(), navigator: nav({ doNotTrack: '1', globalPrivacyControl: true }) })).toEqual({ optOut: false, dnt: true, gpc: true });
    expect(readSignals({ localStorage: storage(), navigator: nav({ doNotTrack: '0' }) })).toEqual({ optOut: false, dnt: false, gpc: false });
  });

  it('readSignals survives a throwing localStorage', () => {
    expect(readSignals({ localStorage: storage({}, true), navigator: nav({ doNotTrack: '1' }) })).toEqual({ optOut: false, dnt: true, gpc: false });
    const win = { navigator: nav() } as { localStorage?: Storage; navigator?: Navigator };
    Object.defineProperty(win, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    expect(readSignals(win)).toEqual({ optOut: false, dnt: false, gpc: false });
  });

  it('setOptOut sets and clears, and reports failure', () => {
    const s = storage();
    expect(setOptOut(true, s)).toBe(true);
    expect(s.getItem('amg:no-contar')).toBe('1');
    expect(setOptOut(false, s)).toBe(true);
    expect(s.getItem('amg:no-contar')).toBeNull();
    expect(setOptOut(true, storage({}, true))).toBe(false);
  });
});
