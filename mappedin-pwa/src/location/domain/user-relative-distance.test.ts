import { describe, expect, it } from 'vitest';

import {
  canUseLiveUserOrigin,
  formatRelativeDistance,
  metersFromUser,
  parseCoordinateNumber,
  shouldPublishUserLocation,
  sortByUserDistance,
} from './user-relative-distance';

const origin = { latitude: 43.64, longitude: -79.38, accuracy: 8 };

describe('parseCoordinateNumber', () => {
  it('parses finite numbers and numeric strings', () => {
    expect(parseCoordinateNumber(43.1)).toBe(43.1);
    expect(parseCoordinateNumber(' -79.38 ')).toBe(-79.38);
  });

  it('rejects empty and non-numeric values', () => {
    expect(parseCoordinateNumber(null)).toBeNull();
    expect(parseCoordinateNumber('')).toBeNull();
    expect(parseCoordinateNumber('n/a')).toBeNull();
    expect(parseCoordinateNumber(Number.NaN)).toBeNull();
  });
});

describe('canUseLiveUserOrigin', () => {
  it('requires a granted choice and finite coordinates', () => {
    expect(canUseLiveUserOrigin('granted', origin)).toBe(true);
    expect(canUseLiveUserOrigin('denied', origin)).toBe(false);
    expect(canUseLiveUserOrigin('undecided', origin)).toBe(false);
    expect(canUseLiveUserOrigin('granted', null)).toBe(false);
  });
});

describe('metersFromUser', () => {
  const nearby = { latitude: 43.641, longitude: -79.381 };

  it('returns null unless location permission is granted', () => {
    expect(metersFromUser('denied', origin, nearby)).toBeNull();
    expect(metersFromUser('undecided', origin, nearby)).toBeNull();
    expect(metersFromUser('granted', null, nearby)).toBeNull();
  });

  it('returns haversine meters from the live user origin', () => {
    const meters = metersFromUser('granted', origin, nearby);
    expect(meters).toBeGreaterThan(100);
    expect(meters).toBeLessThan(200);
  });

  it('returns null when the target has no coordinates', () => {
    expect(metersFromUser('granted', origin, { latitude: null, longitude: null })).toBeNull();
  });
});

describe('formatRelativeDistance', () => {
  it('formats meters and kilometers', () => {
    expect(formatRelativeDistance(12.4)).toBe('12 m');
    expect(formatRelativeDistance(1500)).toBe('1.5 km');
    expect(formatRelativeDistance(12500)).toBe('13 km');
    expect(formatRelativeDistance(null)).toBeNull();
  });
});

describe('sortByUserDistance', () => {
  it('orders known distances first and leaves unknown last', () => {
    const ranked = sortByUserDistance(
      [
        { id: 'far', meters: 80 },
        { id: 'unknown', meters: null },
        { id: 'near', meters: 12 },
      ],
      (item) => item.meters,
    );
    expect(ranked.map((item) => item.id)).toEqual(['near', 'far', 'unknown']);
  });
});

describe('shouldPublishUserLocation', () => {
  it('always publishes the first fix', () => {
    expect(shouldPublishUserLocation(null, origin, 0)).toBe(true);
  });

  it('holds jitter until the user moves or the interval elapses', () => {
    const jitter = {
      latitude: origin.latitude + 0.00001,
      longitude: origin.longitude,
      accuracy: 8,
    };
    expect(shouldPublishUserLocation(origin, jitter, 400)).toBe(false);
    expect(shouldPublishUserLocation(origin, jitter, 1600)).toBe(true);
  });
});
