import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndoorAtlasProvider } from './indoorAtlasProvider';
import { BleBeaconProvider } from './bleBeaconProvider';
import matrix from '../config/beacon-venue-matrix.json';
import { initializeIndoorAtlas, getIndoorAtlasSdk } from './indoorAtlasSdk';

vi.mock('./indoorAtlasSdk', () => ({ initializeIndoorAtlas: vi.fn(), getIndoorAtlasSdk: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('DeviceOrientationEvent', undefined);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('async provider cleanup and fallback', () => {
  it('does not start IndoorAtlas watches after stopping during initialization', async () => {
    vi.stubEnv('VITE_INDOOR_ATLAS_API_KEY', 'test');
    let resolve!: (sdk: any) => void;
    vi.mocked(initializeIndoorAtlas).mockImplementation(() => new Promise(r => { resolve = r; }));
    const sdk = { watchPosition: vi.fn(), clearWatch: vi.fn() };
    vi.mocked(getIndoorAtlasSdk).mockReturnValue(sdk as any);
    const provider = new IndoorAtlasProvider();
    provider.start(vi.fn(), { venueMapId: 'ltv-8' });
    provider.stop();
    resolve(sdk);
    await Promise.resolve();
    expect(sdk.watchPosition).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops a BLE scan granted after the provider was stopped', async () => {
    let resolve!: (scan: any) => void;
    const stop = vi.fn().mockResolvedValue(undefined);
    const addEventListener = vi.fn();
    vi.stubGlobal('navigator', {
      bluetooth: { requestLEScan: vi.fn(() => new Promise(r => { resolve = r; })) },
      addEventListener,
    });
    const provider = new BleBeaconProvider();
    provider.start(vi.fn(), { venueMapId: matrix.venueMapId });
    provider.stop();
    resolve({ stop });
    await Promise.resolve();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
    expect(addEventListener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([IndoorAtlasProvider, BleBeaconProvider])('labels fallback fixes as GPS and forwards errors', (Provider) => {
    vi.stubEnv('VITE_INDOOR_ATLAS_API_KEY', '');
    let success!: PositionCallback;
    let error!: PositionErrorCallback;
    vi.stubGlobal('navigator', { geolocation: {
      watchPosition: vi.fn((s: PositionCallback, e: PositionErrorCallback) => { success = s; error = e; return 1; }),
      clearWatch: vi.fn(),
    } });
    const provider = new Provider();
    const frame = vi.fn();
    const onStatus = vi.fn();
    provider.start(frame, { venueMapId: 'ltv-8', onStatus });
    success({ coords: { latitude: 6.6, longitude: 3.35, accuracy: 5 }, timestamp: Date.now() } as GeolocationPosition);
    expect(frame).toHaveBeenCalledWith(expect.objectContaining({ source: 'gps' }));
    error({ code: 1, message: 'Denied' } as GeolocationPositionError);
    expect(onStatus).toHaveBeenLastCalledWith('error');
    provider.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
