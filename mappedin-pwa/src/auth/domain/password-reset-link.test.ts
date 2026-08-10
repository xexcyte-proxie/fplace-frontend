import { describe, expect, it } from 'vitest';

import {
  clearPasswordResetLinkFromUrl,
  parsePasswordResetLink,
} from './password-reset-link';

describe('parsePasswordResetLink', () => {
  it('reads uid and token from the query string', () => {
    expect(parsePasswordResetLink('?uid=abc&token=xyz')).toEqual({
      uid: 'abc',
      token: 'xyz',
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
});
