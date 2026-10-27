/**
 * Venue map camera rules. The 2D map is indoor-only: no outdoor/world globe.
 */

/** Mercator zoom below this is a world/continent view, not the venue. */
export const VENUE_MAP_MIN_ZOOM = 16;

export const SHOW_VENUE_MAP_OPTIONS = {
  outdoorView: { enabled: false },
} as const;

/**
 * Standard Mappedin camera gestures for the venue floor plan.
 * Keep all of these on so drag-pan, pinch-zoom, and two-finger
 * tilt/rotate work together without falling back to zoom buttons only.
 */
export const VENUE_CAMERA_INTERACTIONS = {
  pan: true,
  zoom: true,
  bearingAndPitch: true,
} as const;

export function isWorldScaleZoom(zoomLevel: number | null | undefined): boolean {
  return typeof zoomLevel === 'number' && Number.isFinite(zoomLevel)
    ? zoomLevel < VENUE_MAP_MIN_ZOOM
    : false;
}

export function clampVenueZoom(
  zoomLevel: number,
  cameraMin: number | null | undefined,
  cameraMax: number | null | undefined,
): number {
  // Some Mappedin versions expose min/max as undefined until the first
  // camera frame has rendered. Never pass NaN to animateTo in that window.
  const lo = Math.max(
    typeof cameraMin === 'number' && Number.isFinite(cameraMin)
      ? cameraMin
      : VENUE_MAP_MIN_ZOOM,
    VENUE_MAP_MIN_ZOOM,
  );
  const hi = Math.max(
    lo,
    typeof cameraMax === 'number' && Number.isFinite(cameraMax)
      ? cameraMax
      : lo + 8,
  );
  return Math.min(hi, Math.max(lo, zoomLevel));
}
