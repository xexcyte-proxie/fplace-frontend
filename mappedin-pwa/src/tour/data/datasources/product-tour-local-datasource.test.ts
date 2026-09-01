import { beforeEach, describe, expect, it } from 'vitest';

import { ProductTourLocalDatasource } from './product-tour-local-datasource';

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

describe('ProductTourLocalDatasource', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('persists the completed flag across instances', () => {
    const a = new ProductTourLocalDatasource();
    expect(a.hasCompleted()).toBe(false);
    a.markCompleted();
    expect(new ProductTourLocalDatasource().hasCompleted()).toBe(true);
    a.clear();
    expect(a.hasCompleted()).toBe(false);
  });
});
