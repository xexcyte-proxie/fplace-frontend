import { describe, expect, it } from 'vitest';

import {
  clientPointToCanvasPoint,
  pickNearestScreenAnchorId,
  SOCIAL_PILL_HIT_RADIUS_PX,
} from './map-tap-screen';

describe('map tap screen projection', () => {
  it('converts client coordinates into canvas-local pixels', () => {
    expect(
      clientPointToCanvasPoint(120, 220, {
        left: 100,
        top: 200,
        width: 300,
        height: 400,
      }),
    ).toEqual({ x: 20, y: 20 });
  });

  it('rejects points outside the canvas', () => {
    expect(
      clientPointToCanvasPoint(50, 220, {
        left: 100,
        top: 200,
        width: 300,
        height: 400,
      }),
    ).toBeNull();
  });

  it('picks the nearest in-radius screen anchor', () => {
    expect(
      pickNearestScreenAnchorId(
        [
          { id: 'far', screen: { x: 200, y: 200 } },
          { id: 'near', screen: { x: 12, y: 10 } },
        ],
        10,
        10,
        SOCIAL_PILL_HIT_RADIUS_PX,
      ),
    ).toBe('near');
  });

  it('ignores anchors outside the hit radius', () => {
    expect(
      pickNearestScreenAnchorId(
        [{ id: 'far', screen: { x: 400, y: 400 } }],
        10,
        10,
        30,
      ),
    ).toBeNull();
  });
});
