import { describe, expect, it } from 'vitest';

import { resolveMapBootErrorMessage } from './map-boot-error';

describe('resolveMapBootErrorMessage', () => {
  it('replaces bare HTTP status codes with a clear fallback', () => {
    expect(resolveMapBootErrorMessage('401')).toBe(
      'Map failed to load. Please try again.',
    );
    expect(resolveMapBootErrorMessage('Unauthorized')).toBe(
      'Map failed to load. Please try again.',
    );
  });

  it('keeps meaningful map failure copy', () => {
    expect(resolveMapBootErrorMessage('This venue has no indoor map yet.')).toBe(
      'This venue has no indoor map yet.',
    );
  });
});
