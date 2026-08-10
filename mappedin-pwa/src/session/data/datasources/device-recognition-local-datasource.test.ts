import { beforeEach, describe, expect, it } from 'vitest';

import { resolveStartupDestination } from '../../domain/entities';
import { DeviceRecognitionLocalDatasource } from './device-recognition-local-datasource';

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

describe('startup destination', () => {
  it('routes brand-new devices to marketing', () => {
    expect(
      resolveStartupDestination({
        hasReturningSession: false,
        hasAuthTokens: false,
        deviceHasUsedApp: false,
      }),
    ).toBe('marketing');
  });

  it('routes known devices without a session to sign-in', () => {
    expect(
      resolveStartupDestination({
        hasReturningSession: false,
        hasAuthTokens: false,
        deviceHasUsedApp: true,
      }),
    ).toBe('sign-in');
  });

  it('routes returning sessions and tokens to the app', () => {
    expect(
      resolveStartupDestination({
        hasReturningSession: true,
        hasAuthTokens: false,
        deviceHasUsedApp: true,
      }),
    ).toBe('app');
    expect(
      resolveStartupDestination({
        hasReturningSession: false,
        hasAuthTokens: true,
        deviceHasUsedApp: false,
      }),
    ).toBe('app');
  });
});

describe('DeviceRecognitionLocalDatasource', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('persists the used-app flag across instances', () => {
    const a = new DeviceRecognitionLocalDatasource();
    expect(a.hasUsedApp()).toBe(false);
    a.markUsed();
    expect(new DeviceRecognitionLocalDatasource().hasUsedApp()).toBe(true);
    a.clear();
    expect(a.hasUsedApp()).toBe(false);
  });
});
