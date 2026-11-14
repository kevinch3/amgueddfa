import { describe, expect, it } from 'vitest';
import { COUNTRIES, countryName, countryOptions, flag, isCountry, isTimeZone, timeZones } from '../src/lib/places';

describe('countries', () => {
  it('accepts ISO codes and the GB nations, nothing else', () => {
    expect(isCountry('AR')).toBe(true);
    expect(isCountry('GB-WLS')).toBe(true);
    expect(isCountry('ar')).toBe(false);
    expect(isCountry('XX')).toBe(false);
    expect(isCountry('GB-XYZ')).toBe(false);
    expect(isCountry(null)).toBe(false);
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
  });

  it('names countries in Spanish, Wales included', () => {
    expect(countryName('AR')).toBe('Argentina');
    expect(countryName('GB-WLS')).toBe('Gales');
    expect(countryName('GB')).toBe('Reino Unido');
    expect(countryName('nope')).toBe('');
  });

  it('builds flags, with the Welsh tag sequence', () => {
    expect(flag('AR')).toBe('🇦🇷');
    expect(flag('GB-WLS')).toBe('🏴󠁧󠁢󠁷󠁬󠁳󠁿');
    expect(flag('GB-NIR')).toBe('🇬🇧');
    expect(flag('')).toBe('');
  });

  it('lists the common countries first and every other one once, by name', () => {
    const { common, rest } = countryOptions();
    expect(common[0]).toBe('AR');
    expect(common).toContain('GB-WLS');
    expect(common.length + rest.length).toBe(COUNTRIES.length);
    expect(rest.some((c) => common.includes(c))).toBe(false);
    const names = rest.map(countryName);
    expect([...names].sort((a, b) => a.localeCompare(b, 'es'))).toEqual(names);
  });
});

describe('timezones', () => {
  it('validates IANA names', () => {
    expect(isTimeZone('America/Argentina/Buenos_Aires')).toBe(true);
    expect(isTimeZone('Patagonia/Gaiman')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });

  it('lists the runtime zones, UTC and a saved extra', () => {
    const list = timeZones('Europe/London');
    expect(list).toContain('UTC');
    expect(list).toContain('Europe/London');
    expect(list).toContain('America/Buenos_Aires');
    expect(new Set(list).size).toBe(list.length);
  });
});
