import { describe, expect, it } from 'vitest';

import { isHeadingOnlyPositionFix } from './heading-only-frame';

describe('isHeadingOnlyPositionFix', () => {
  it('is false for the first sample', () => {
    expect(
      isHeadingOnlyPositionFix(null, { latitude: 43.64, longitude: -79.38 }),
    ).toBe(false);
  });

  it('is true when latitude and longitude are unchanged', () => {
    expect(
      isHeadingOnlyPositionFix(
        { latitude: 43.64, longitude: -79.38 },
        { latitude: 43.64, longitude: -79.38 },
      ),
    ).toBe(true);
  });

  it('is false when the fix moved', () => {
    expect(
      isHeadingOnlyPositionFix(
        { latitude: 43.64, longitude: -79.38 },
        { latitude: 43.6401, longitude: -79.38 },
      ),
    ).toBe(false);
  });
});
