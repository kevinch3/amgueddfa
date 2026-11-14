import { afterEach, describe, expect, it } from 'vitest';
import { fecha, fechaHora, relativa, setUserTimeZone, userTimeZone } from '../src/lib/dates';

const NOW = Date.parse('2026-11-14T15:00:00Z');

afterEach(() => setUserTimeZone(null));

describe('fecha / fechaHora', () => {
  it('formats in the given timezone', () => {
    // 01:30 UTC on the 15th is still the 14th in Argentina (UTC-3)
    expect(fecha('2026-11-15T01:30:00Z', 'America/Argentina/Buenos_Aires')).toBe('14 de noviembre de 2026');
    expect(fecha('2026-11-15T01:30:00Z', 'Europe/London')).toBe('15 de noviembre de 2026');
    expect(fechaHora('2026-11-15T01:30:00Z', 'America/Argentina/Buenos_Aires')).toBe('14 de nov de 2026, 22:30');
  });

  it('is empty for a missing or bad date', () => {
    expect(fecha(null)).toBe('');
    expect(fecha('not a date')).toBe('');
    expect(relativa(undefined)).toBe('');
  });

  it('uses the saved timezone by default', () => {
    setUserTimeZone('America/Argentina/Buenos_Aires');
    expect(userTimeZone()).toBe('America/Argentina/Buenos_Aires');
    expect(fecha('2026-11-15T01:30:00Z')).toBe('14 de noviembre de 2026');
    setUserTimeZone('Not/AZone');
    expect(userTimeZone()).toBeUndefined();
  });
});

describe('relativa', () => {
  const ago = (s: number) => new Date(NOW - s * 1000).toISOString();
  it('is relative within a week', () => {
    expect(relativa(ago(10), NOW)).toBe('ahora');
    expect(relativa(ago(5 * 60), NOW)).toBe('hace 5 minutos');
    expect(relativa(ago(2 * 3600), NOW)).toBe('hace 2 horas');
    expect(relativa(ago(26 * 3600), NOW)).toBe('ayer');
    expect(relativa(ago(3 * 86400), NOW)).toBe('hace 3 días');
  });

  it('falls back to the date after a week or in the future', () => {
    expect(relativa(ago(30 * 86400), NOW, 'UTC')).toBe('15 de octubre de 2026');
    expect(relativa(new Date(NOW + 3600_000).toISOString(), NOW, 'UTC')).toBe('14 de noviembre de 2026');
  });
});
