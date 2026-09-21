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
  it('unlocks follow on pointerdown so the same stroke can pan', () => {
    const container = document.createElement('div');
    const onUserPan = vi.fn();
    const guard = installCameraFollowRelease(container, onUserPan);

    container.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }),
    );

    expect(onUserPan).toHaveBeenCalledTimes(1);
    guard.dispose();
  });

  it('records the pointer position for pill hit-testing', () => {
    const container = document.createElement('div');
    const guard = installCameraFollowRelease(container, vi.fn());

    container.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 12, clientY: 34 }),
    );
    container.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 15, clientY: 40 }),
    );

    expect(guard.getLastPointerClient()).toEqual({ x: 15, y: 40 });
    expect(guard.shouldIgnoreMapClick()).toBe(false);
    guard.dispose();
  });

  it('suppresses the next map click after a pan', () => {
    const container = document.createElement('div');
    const guard = installCameraFollowRelease(container, vi.fn());

    container.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }),
    );
    container.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 16, clientY: 10 }),
    );
    container.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 16, clientY: 10 }),
    );

    expect(guard.shouldIgnoreMapClick()).toBe(true);
    guard.dispose();
  });
});
