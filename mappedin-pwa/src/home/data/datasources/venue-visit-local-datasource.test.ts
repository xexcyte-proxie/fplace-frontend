import { beforeEach, describe, expect, it } from 'vitest';

import { VenueVisitLocalDatasource } from './venue-visit-local-datasource';

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

describe('VenueVisitLocalDatasource', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('moves a repeat visit to the end so it ranks as most recent', () => {
    const visits = new VenueVisitLocalDatasource();
    visits.mark('1');
    visits.mark('2');
    visits.mark('1');
    expect(visits.list()).toEqual(['2', '1']);
  });
});
