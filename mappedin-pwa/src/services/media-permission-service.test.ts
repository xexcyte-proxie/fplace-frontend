import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  beginArMediaPermissionPrime,
  consumeArMediaPermissionPrime,
  primeArMediaPermissions,
  queryCameraPermission,
  resetArMediaPermissionPrime,
} from './media-permission-service';

function installMemoryStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
}

describe('media-permission-service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installMemoryStorage();
    resetArMediaPermissionPrime();
  });

  afterEach(() => {
    resetArMediaPermissionPrime();
    vi.unstubAllGlobals();
  });

  it('queries camera permission through the Permissions API', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'granted' });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn() },
      permissions: { query },
    });

    await expect(queryCameraPermission()).resolves.toBe('granted');
    expect(query).toHaveBeenCalledWith({ name: 'camera' });
  });

  it('calls getUserMedia immediately and stops tracks after grant', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
    });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    });
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    vi.stubGlobal('DeviceMotionEvent', undefined);

    await expect(primeArMediaPermissions()).resolves.toEqual({
      camera: 'granted',
      motionGranted: true,
    });
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    expect(stop).toHaveBeenCalled();
  });

  it('maps NotAllowedError to denied without throwing', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue({ name: 'NotAllowedError' });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    });
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    vi.stubGlobal('DeviceMotionEvent', undefined);

    await expect(primeArMediaPermissions()).resolves.toEqual({
      camera: 'denied',
      motionGranted: true,
    });
  });

  it('reuses an in-flight prime across begin and consume', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    });
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    vi.stubGlobal('DeviceMotionEvent', undefined);

    beginArMediaPermissionPrime();
    const result = await consumeArMediaPermissionPrime();
    expect(result.camera).toBe('granted');
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('skips getUserMedia in reuse-only mode for same-origin Live View', async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    });
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    vi.stubGlobal('DeviceMotionEvent', undefined);

    await expect(
      primeArMediaPermissions({ camera: 'reuse-only' }),
    ).resolves.toEqual({
      camera: 'prompt',
      motionGranted: true,
    });
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
