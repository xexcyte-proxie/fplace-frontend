/**
 * Convert a browser client point into map-canvas pixel coordinates.
 * Mappedin screen APIs are relative to the canvas top-left, not the page.
 */
export function clientPointToCanvasPoint(
  clientX: number,
  clientY: number,
  canvasRect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } | null {
  if (!(canvasRect.width > 0) || !(canvasRect.height > 0)) return null;
  const x = clientX - canvasRect.left;
  const y = clientY - canvasRect.top;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x > canvasRect.width || y > canvasRect.height) {
    return null;
  }
  return { x, y };
}

/**
 * Prefer the canvas under the map container; fall back to the container itself.
 */
export function resolveMapCanvasRect(
  mapContainer: HTMLElement,
): { left: number; top: number; width: number; height: number } {
  const canvas = mapContainer.querySelector('canvas');
  const el = canvas instanceof HTMLElement ? canvas : mapContainer;
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/** Pixel radius around an anchor for treating a tap as a location-pill hit. */
// Include the label and the underlying ordinary Mappedin location in the
// same tap target, so a section opens its modal consistently.
export const SOCIAL_PILL_HIT_RADIUS_PX = 72;

export function pickNearestScreenAnchorId(
  anchors: Array<{ id: string; screen: { x: number; y: number } | null }>,
  canvasX: number,
  canvasY: number,
  maxRadiusPx: number = SOCIAL_PILL_HIT_RADIUS_PX,
): string | null {
  let bestId: string | null = null;
  let bestDist2 = maxRadiusPx * maxRadiusPx;

  for (const anchor of anchors) {
    if (!anchor.screen) continue;
    const dx = anchor.screen.x - canvasX;
    const dy = anchor.screen.y - canvasY;
    const dist2 = dx * dx + dy * dy;
    if (dist2 <= bestDist2) {
      bestDist2 = dist2;
      bestId = anchor.id;
    }
  }

  return bestId;
}
