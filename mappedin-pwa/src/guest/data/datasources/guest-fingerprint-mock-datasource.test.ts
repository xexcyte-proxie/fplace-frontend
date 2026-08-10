import { beforeEach, describe, expect, it } from 'vitest';
import { GuestFingerprintMockDatasource } from './guest-fingerprint-mock-datasource';

/** Minimal localStorage stub for Node/vitest (no happy-dom). */
function installMemoryLocalStorage(): void {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  });
}

describe('GuestFingerprintMockDatasource', () => {
  let datasource: GuestFingerprintMockDatasource;

  beforeEach(() => {
    installMemoryLocalStorage();
    datasource = new GuestFingerprintMockDatasource();
  });

  it('registers an unknown visitor and allows access', async () => {
    const response = await datasource.validateGuestFingerprint('visitor_a');

    expect(response.allowed).toBe(true);
    expect(response.guestId).toMatch(/^guest_/);
    expect(response.reason).toBeNull();
  });

  it('returns the same guestId for a returning visitor', async () => {
    const first = await datasource.registerGuestFingerprint('visitor_b');
    const second = await datasource.validateGuestFingerprint('visitor_b');

    expect(second.allowed).toBe(true);
    expect(second.guestId).toBe(first.guestId);
    expect(second.reason).toBeNull();
  });

  it('denies access after markGuestLimitReached', async () => {
    await datasource.registerGuestFingerprint('visitor_c');
    await datasource.markGuestLimitReached('visitor_c');

    const response = await datasource.validateGuestFingerprint('visitor_c');

    expect(response).toEqual({
      allowed: false,
      guestId: expect.stringMatching(/^guest_/),
      reason: 'Guest limit reached',
    });
  });

  it('persists limitReached across datasource instances via localStorage', async () => {
    await datasource.registerGuestFingerprint('visitor_d');
    await datasource.markGuestLimitReached('visitor_d');

    const reloaded = new GuestFingerprintMockDatasource();
    const response = await reloaded.validateGuestFingerprint('visitor_d');

    expect(response.allowed).toBe(false);
    expect(response.reason).toBe('Guest limit reached');
  });
});
