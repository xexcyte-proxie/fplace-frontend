import { beforeEach, describe, expect, it } from 'vitest';

import { ReturningSessionLocalDatasource } from './returning-session-local-datasource';

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

describe('ReturningSessionLocalDatasource', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('returns null when nothing is stored', () => {
    expect(new ReturningSessionLocalDatasource().load()).toBeNull();
  });

  it('persists and reloads a returning session', () => {
    const ds = new ReturningSessionLocalDatasource();
    ds.save({
      onboardingComplete: true,
      mode: 'guest',
      selectedVenueId: '12',
      selectedGateId: '34',
      guestId: 'guest-1',
    });

    expect(ds.load()).toEqual({
      onboardingComplete: true,
      mode: 'guest',
      selectedVenueId: '12',
      selectedGateId: '34',
      guestId: 'guest-1',
    });
  });

  it('ignores incomplete snapshots', () => {
    localStorage.setItem(
      'fplaces_returning_session',
      JSON.stringify({ onboardingComplete: false, mode: 'auth' }),
    );
    expect(new ReturningSessionLocalDatasource().load()).toBeNull();
  });

  it('clears the session', () => {
    const ds = new ReturningSessionLocalDatasource();
    ds.save({
      onboardingComplete: true,
      mode: 'auth',
      selectedVenueId: '1',
      selectedGateId: '2',
      guestId: null,
    });
    ds.clear();
    expect(ds.load()).toBeNull();
  });
});
