/**
 * Map gesture guard for the 2D venue map.
 *
 * Goals that must hold at the same time:
 * - Pan works even while blue-dot follow is on
 * - HTML location pills never steal pointer events from Mappedin
 * - A tap on a visible pill still opens that location (screen hit-test)
 * - A tap on the floor still sets start/end
 * - A pan does not leave a residual click that plants a wrong pin
 */
const PAN_DETECT_PX = 4;
const CLICK_SUPPRESS_AFTER_PAN_MS = 350;

export type MapPointerClient = { x: number; y: number };

export type MapGestureGuard = {
  dispose: () => void;
  /** True when a map click likely belongs to a just-finished pan/pinch. */
  shouldIgnoreMapClick: () => boolean;
  /** Last pointerup/cancel position inside the map container. */
  getLastPointerClient: () => MapPointerClient | null;
};

export function installCameraFollowRelease(
  container: HTMLElement,
  onUserPan: () => void,
): MapGestureGuard {
  const activePointers = new Map<number, { x: number; y: number }>();
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let panning = false;
  let unlockedFollow = false;
  let ignoreClicksUntil = 0;
  let lastPointerClient: MapPointerClient | null = null;

  const onDown = (event: PointerEvent) => {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    console.debug('[FplacesMapGesture] pointerdown', {
      pointerId: event.pointerId,
      pointers: activePointers.size,
      x: event.clientX,
      y: event.clientY,
    });
    // A second finger belongs to the same camera gesture. Do not replace the
    // primary pointer's pan state or let its eventual pointerup clean up the
    // whole gesture prematurely.
    if (activePointers.size > 1) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    panning = false;
    unlockedFollow = false;
    lastPointerClient = { x: event.clientX, y: event.clientY };
    // Unlock before Mappedin commits the gesture so a drag can pan.
    onUserPan();
    unlockedFollow = true;
  };

  const onMove = (event: PointerEvent) => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pointerId == null || event.pointerId !== pointerId || panning) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (dx * dx + dy * dy < PAN_DETECT_PX * PAN_DETECT_PX) return;
    panning = true;
    console.debug('[FplacesMapGesture] pan-detected', {
      pointerId: event.pointerId,
      pointers: activePointers.size,
      dx,
      dy,
    });
    if (!unlockedFollow) {
      unlockedFollow = true;
      onUserPan();
    }
  };

  const onUp = (event: PointerEvent) => {
    activePointers.delete(event.pointerId);
    console.debug('[FplacesMapGesture] pointerup/cancel', {
      pointerId: event.pointerId,
      remainingPointers: activePointers.size,
      primaryPointerId: pointerId,
      panning,
    });
    if (activePointers.size > 0) return;
    if (event.pointerId !== pointerId) {
      // The primary pointer may have ended before the secondary pointer.
      pointerId = null;
      panning = false;
      unlockedFollow = false;
      return;
    }
    lastPointerClient = { x: event.clientX, y: event.clientY };
    pointerId = null;
    unlockedFollow = false;
    if (panning) {
      ignoreClicksUntil = performance.now() + CLICK_SUPPRESS_AFTER_PAN_MS;
    }
    panning = false;
  };

  container.addEventListener('pointerdown', onDown, true);
  container.addEventListener('pointermove', onMove, true);
  container.addEventListener('pointerup', onUp, true);
  container.addEventListener('pointercancel', onUp, true);

  return {
    shouldIgnoreMapClick: () => performance.now() < ignoreClicksUntil,
    getLastPointerClient: () => lastPointerClient,
    dispose: () => {
      container.removeEventListener('pointerdown', onDown, true);
      container.removeEventListener('pointermove', onMove, true);
      container.removeEventListener('pointerup', onUp, true);
      container.removeEventListener('pointercancel', onUp, true);
    },
  };
}
