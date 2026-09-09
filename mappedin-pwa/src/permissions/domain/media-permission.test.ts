import { describe, expect, it } from 'vitest';

import {
  mediaPermissionFromBrowserState,
  mediaPermissionFromGetUserMediaError,
  shouldReuseGrantedArCamera,
  shouldSkipCameraPrompt,
} from './media-permission';

describe('mediaPermissionFromBrowserState', () => {
  it('passes through Permissions API states', () => {
    expect(mediaPermissionFromBrowserState('granted')).toBe('granted');
    expect(mediaPermissionFromBrowserState('denied')).toBe('denied');
    expect(mediaPermissionFromBrowserState('prompt')).toBe('prompt');
  });

  it('treats unknown values as prompt', () => {
    expect(mediaPermissionFromBrowserState(undefined)).toBe('prompt');
    expect(mediaPermissionFromBrowserState('unknown')).toBe('prompt');
  });
});

describe('mediaPermissionFromGetUserMediaError', () => {
  it('maps denial names to denied', () => {
    expect(
      mediaPermissionFromGetUserMediaError({ name: 'NotAllowedError' }),
    ).toBe('denied');
    expect(
      mediaPermissionFromGetUserMediaError({ name: 'PermissionDeniedError' }),
    ).toBe('denied');
  });

  it('maps missing-hardware names to unsupported', () => {
    expect(
      mediaPermissionFromGetUserMediaError({ name: 'NotFoundError' }),
    ).toBe('unsupported');
  });

  it('maps other failures to prompt', () => {
    expect(mediaPermissionFromGetUserMediaError(new Error('timeout'))).toBe(
      'prompt',
    );
  });
});

describe('shouldReuseGrantedArCamera', () => {
  it('reuses a grant only for same-origin AR', () => {
    expect(shouldReuseGrantedArCamera('granted', true)).toBe(true);
    expect(shouldReuseGrantedArCamera('granted', false)).toBe(false);
    expect(shouldReuseGrantedArCamera('prompt', true)).toBe(false);
  });
});

describe('shouldSkipCameraPrompt', () => {
  it('skips getUserMedia after the first allow or deny', () => {
    expect(shouldSkipCameraPrompt('granted')).toBe(true);
    expect(shouldSkipCameraPrompt('denied')).toBe(true);
    expect(shouldSkipCameraPrompt('undecided')).toBe(false);
  });
});
