import { describe, expect, it } from 'vitest';

import { positioningReadiness } from './positioning-readiness';

describe('positioningReadiness', () => {
  it('does not claim room-level indoor positioning for browser GPS aliases', () => {
    expect(positioningReadiness('gps').roomLevelCapable).toBe(false);
    expect(positioningReadiness('apple_indoor').roomLevelCapable).toBe(false);
  });

  it.each(['indoor_atlas', 'ble_beacon'] as const)(
    'marks %s as capable but still requiring on-site verification',
    (source) => {
      const result = positioningReadiness(source);
      expect(result.roomLevelCapable).toBe(true);
      expect(result.message).toContain('on-site');
    },
  );
});
