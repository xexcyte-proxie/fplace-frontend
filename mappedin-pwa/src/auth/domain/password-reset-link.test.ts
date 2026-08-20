import { beforeEach, describe, expect, it } from 'vitest';

import {
  capturePasswordResetLinkFromLocation,
  clearPasswordResetLinkFromUrl,
  consumePasswordResetLink,
  parsePasswordResetLink,
} from './password-reset-link';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe('parsePasswordResetLink', () => {
  it('reads uid and token from the query string', () => {
    expect(parsePasswordResetLink('?uid=abc&token=xyz')).toEqual({
      uid: 'abc',
      token: 'xyz',
    });
  });

  it('reads the production email link shape on /reset-password', () => {
    expect(
      parsePasswordResetLink(
        '?uid=OQ&token=ddlws8-33e5424f8d34a4f09d99cd3d0d598a38',
        '',
        '/reset-password',
      ),
    ).toEqual({
      uid: 'OQ',
      token: 'ddlws8-33e5424f8d34a4f09d99cd3d0d598a38',
    });
  });

  it('reads uid and token from a hash query', () => {
    expect(
      parsePasswordResetLink('', '#/reset-password?uid=u1&token=t1'),
    ).toEqual({ uid: 'u1', token: 't1' });
  });

  it('returns null when either value is missing', () => {
    expect(parsePasswordResetLink('?uid=only')).toBeNull();
    expect(parsePasswordResetLink('?token=only')).toBeNull();
  });
});

describe('capture + consume password reset link', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it('captures production /reset-password links and normalizes the path to /', () => {
    const calls: string[] = [];
    const params = capturePasswordResetLinkFromLocation(
      {
        pathname: '/reset-password',
        search: '?uid=OQ&token=ddlws8-33e5424f8d34a4f09d99cd3d0d598a38',
        hash: '',
      },
      {
        replaceState: (_state, _title, url) => {
          calls.push(String(url));
        },
      },
      storage,
    );

    expect(params).toEqual({
      uid: 'OQ',
      token: 'ddlws8-33e5424f8d34a4f09d99cd3d0d598a38',
    });
    expect(calls).toEqual(['/']);
    expect(consumePasswordResetLink({ pathname: '/', search: '', hash: '' }, {
      replaceState: () => undefined,
    }, storage)).toEqual({
      uid: 'OQ',
      token: 'ddlws8-33e5424f8d34a4f09d99cd3d0d598a38',
    });
    // Second consume is empty.
    expect(consumePasswordResetLink({ pathname: '/', search: '', hash: '' }, {
      replaceState: () => undefined,
    }, storage)).toBeNull();
  });
});

describe('clearPasswordResetLinkFromUrl', () => {
  it('removes uid and token from search without a reload', () => {
    const calls: string[] = [];
    clearPasswordResetLinkFromUrl(
      { pathname: '/', search: '?uid=a&token=b&x=1', hash: '' },
      {
        replaceState: (_state, _title, url) => {
          calls.push(String(url));
        },
      },
    );
    expect(calls).toEqual(['/?x=1']);
  });

  it('rewrites /reset-password to / after consuming params', () => {
    const calls: string[] = [];
    clearPasswordResetLinkFromUrl(
      {
        pathname: '/reset-password',
        search: '?uid=OQ&token=secret',
        hash: '',
      },
      {
        replaceState: (_state, _title, url) => {
          calls.push(String(url));
        },
      },
    );
    expect(calls).toEqual(['/']);
  });
});
