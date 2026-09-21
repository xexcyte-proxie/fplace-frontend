/**
 * Venue map camera rules. The 2D map is indoor-only: no outdoor/world globe.
 */

/** Mercator zoom below this is a world/continent view, not the venue. */
export const VENUE_MAP_MIN_ZOOM = 16;

export const SHOW_VENUE_MAP_OPTIONS = {
  outdoorView: { enabled: false },
} as const;

/**
 * One-finger drag should pan the floor plan. Tilt/rotate fights that on
 * touch and is why guests fall back to the zoom buttons.
 */
export const VENUE_CAMERA_INTERACTIONS = {
  pan: true,
  zoom: true,
  bearingAndPitch: false,
} as const;

export function isWorldScaleZoom(zoomLevel: number | null | undefined): boolean {
  return typeof zoomLevel === 'number' && Number.isFinite(zoomLevel)
    ? zoomLevel < VENUE_MAP_MIN_ZOOM
    : false;
}

export function clampVenueZoom(
  zoomLevel: number,
  cameraMin: number,
  cameraMax: number,
): number {
  const lo = Math.max(cameraMin, VENUE_MAP_MIN_ZOOM);
  const hi = Math.max(lo, cameraMax);
  return Math.min(hi, Math.max(lo, zoomLevel));
}
