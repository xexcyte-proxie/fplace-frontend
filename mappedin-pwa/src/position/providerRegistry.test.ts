import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PositionProviderRegistry } from './providerRegistry';
import matrix from './config/beacon-venue-matrix.json';

beforeEach(() => {
  vi.stubEnv('VITE_POSITION_SOURCE', '');
  vi.stubEnv('VITE_INDOOR_ATLAS_API_KEY', '');
  vi.stubGlobal('navigator', { bluetooth: {}, userAgent: 'iPhone' });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('venue positioning selection', () => {
  it('uses beacons only for the requested venue with a configured matrix', () => {
    expect(PositionProviderRegistry.resolveNavigationSource(matrix.venueMapId)).toBe('ble_beacon');
    expect(PositionProviderRegistry.resolveNavigationSource('ltv-8')).toBe('gps');
    expect(PositionProviderRegistry.resolveNavigationSource()).toBe('gps');
  });
  it('does not claim an indoor SDK based on the iPhone user agent', () => {
    expect(PositionProviderRegistry.resolveNavigationSource('ltv-8')).toBe('gps');
    expect(PositionProviderRegistry.getProvider('apple_indoor').source).toBe('gps');
  });
});
