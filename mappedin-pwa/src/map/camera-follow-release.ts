/**
 * Release blue-dot camera follow after the guest actually pans the map,
 * not on a tap used to set a route point.
 */
const PAN_RELEASE_PX = 8;

export function installCameraFollowRelease(
  container: HTMLElement,
  onUserPan: () => void,
): () => void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let released = false;

  const onDown = (event: PointerEvent) => {
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    released = false;
  };

  const onMove = (event: PointerEvent) => {
    if (pointerId == null || event.pointerId !== pointerId || released) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (dx * dx + dy * dy < PAN_RELEASE_PX * PAN_RELEASE_PX) return;
    released = true;
    onUserPan();
  };

  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    released = false;
  };

  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);

  return () => {
    container.removeEventListener('pointerdown', onDown);
    container.removeEventListener('pointermove', onMove);
    container.removeEventListener('pointerup', onUp);
    container.removeEventListener('pointercancel', onUp);
  };
}
