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

  it('defaults to enabled and not completed', () => {
    const datasource = new ProductTourLocalDatasource();
    expect(datasource.load()).toEqual({ completed: false, enabled: true });
  });

  it('persists enabled and completed across instances', () => {
    const a = new ProductTourLocalDatasource();
    a.save({ completed: true, enabled: false });
    expect(new ProductTourLocalDatasource().load()).toEqual({
      completed: true,
      enabled: false,
    });
    a.clear();
    expect(a.load()).toEqual({ completed: false, enabled: true });
  });

  it('migrates the legacy completed flag into an opted-out preference', () => {
    localStorage.setItem('fplaces_product_tour_completed', '1');
    const datasource = new ProductTourLocalDatasource();
    expect(datasource.load()).toEqual({ completed: true, enabled: false });
    expect(localStorage.getItem('fplaces_product_tour_completed')).toBeNull();
    expect(localStorage.getItem('fplaces_product_tour_preference')).toContain(
      '"enabled":false',
    );
  });
});
