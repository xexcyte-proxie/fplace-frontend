import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { permissionChoiceLocalDatasource } from './permission-choice-local-datasource';

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

describe('permissionChoiceLocalDatasource', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installMemoryStorage();
  });

  afterEach(() => {
    permissionChoiceLocalDatasource.clearAll();
  });

  it('starts undecided and remembers the first location choice', () => {
    expect(permissionChoiceLocalDatasource.loadLocation()).toBe('undecided');
    permissionChoiceLocalDatasource.saveLocation('denied');
    expect(permissionChoiceLocalDatasource.loadLocation()).toBe('denied');
    permissionChoiceLocalDatasource.saveLocation('granted');
    expect(permissionChoiceLocalDatasource.loadLocation()).toBe('granted');
  });

  it('stores camera and motion independently', () => {
    permissionChoiceLocalDatasource.saveCamera('granted');
    permissionChoiceLocalDatasource.saveMotion('denied');
    expect(permissionChoiceLocalDatasource.loadCamera()).toBe('granted');
    expect(permissionChoiceLocalDatasource.loadMotion()).toBe('denied');
    expect(permissionChoiceLocalDatasource.loadLocation()).toBe('undecided');
  });
});
