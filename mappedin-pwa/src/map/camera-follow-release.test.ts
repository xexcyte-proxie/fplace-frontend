import { describe, expect, it, vi } from 'vitest';

import { installCameraFollowRelease } from './camera-follow-release';

function pointerEvent(
  type: string,
  init: { pointerId: number; clientX: number; clientY: number },
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    pointerId: init.pointerId,
    clientX: init.clientX,
    clientY: init.clientY,
  });
}

const hasPointerDom =
  typeof document !== 'undefined' && typeof PointerEvent !== 'undefined';

describe.skipIf(!hasPointerDom)('installCameraFollowRelease', () => {
  it('does not release follow on a tap', () => {
    const container = document.createElement('div');
    const onUserPan = vi.fn();
    installCameraFollowRelease(container, onUserPan);

    container.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }),
    );
    container.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 12, clientY: 11 }),
    );

    expect(onUserPan).not.toHaveBeenCalled();
  });

  it('releases follow after a pan past the drag threshold', () => {
    const container = document.createElement('div');
    const onUserPan = vi.fn();
    installCameraFollowRelease(container, onUserPan);

    container.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }),
    );
    container.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 40, clientY: 10 }),
    );

    expect(onUserPan).toHaveBeenCalledTimes(1);
  });
});
