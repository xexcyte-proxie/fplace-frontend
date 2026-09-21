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
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let panning = false;
  let unlockedFollow = false;
  let ignoreClicksUntil = 0;
  let lastPointerClient: MapPointerClient | null = null;

  const onDown = (event: PointerEvent) => {
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
    if (pointerId == null || event.pointerId !== pointerId || panning) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (dx * dx + dy * dy < PAN_DETECT_PX * PAN_DETECT_PX) return;
    panning = true;
    if (!unlockedFollow) {
      unlockedFollow = true;
      onUserPan();
    }
  };

  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
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
