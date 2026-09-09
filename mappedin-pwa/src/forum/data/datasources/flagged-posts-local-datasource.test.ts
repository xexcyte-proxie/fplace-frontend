import { beforeEach, describe, expect, it, vi } from 'vitest';

import { flaggedPostsLocalDatasource } from './flagged-posts-local-datasource';

function installMemoryStorage(): Map<string, string> {
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
  return store;
}

describe('flaggedPostsLocalDatasource', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    store = installMemoryStorage();
  });

  it('persists flagged post ids across loads (session restart)', () => {
    flaggedPostsLocalDatasource.add('user:4', '21');
    flaggedPostsLocalDatasource.add('user:4', '33');
    // A fresh load simulates a new session reading the same storage.
    expect(flaggedPostsLocalDatasource.load('user:4')).toEqual(['21', '33']);
  });

  it('toggles: remove clears one id and keeps the rest', () => {
    flaggedPostsLocalDatasource.add('user:4', '21');
    flaggedPostsLocalDatasource.add('user:4', '33');
    flaggedPostsLocalDatasource.remove('user:4', '21');
    expect(flaggedPostsLocalDatasource.load('user:4')).toEqual(['33']);
    flaggedPostsLocalDatasource.add('user:4', '21');
    expect(flaggedPostsLocalDatasource.load('user:4')).toEqual(['33', '21']);
  });

  it('keeps viewers isolated from each other', () => {
    flaggedPostsLocalDatasource.add('user:4', '21');
    flaggedPostsLocalDatasource.add('guest:fp_abc', '99');
    expect(flaggedPostsLocalDatasource.load('user:4')).toEqual(['21']);
    expect(flaggedPostsLocalDatasource.load('guest:fp_abc')).toEqual(['99']);
  });

  it('does not duplicate an id flagged twice', () => {
    flaggedPostsLocalDatasource.add('user:4', '21');
    flaggedPostsLocalDatasource.add('user:4', '21');
    expect(flaggedPostsLocalDatasource.load('user:4')).toEqual(['21']);
  });

  it('tolerates corrupt or non-array payloads', () => {
    store.set('fplaces.flaggedPosts.user:4', '{not json');
    expect(flaggedPostsLocalDatasource.load('user:4')).toEqual([]);
    store.set('fplaces.flaggedPosts.user:4', JSON.stringify({ nope: true }));
    expect(flaggedPostsLocalDatasource.load('user:4')).toEqual([]);
    store.set('fplaces.flaggedPosts.user:4', JSON.stringify(['21', 7, null]));
    expect(flaggedPostsLocalDatasource.load('user:4')).toEqual(['21']);
  });

  it('removes the storage key entirely when the last id is cleared', () => {
    flaggedPostsLocalDatasource.add('user:4', '21');
    flaggedPostsLocalDatasource.remove('user:4', '21');
    expect(store.has('fplaces.flaggedPosts.user:4')).toBe(false);
  });
});
