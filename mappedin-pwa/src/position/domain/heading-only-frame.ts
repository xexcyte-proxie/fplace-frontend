/**
 * True when a live position sample has the same fix as the previous one.
 * Heading-only compass ticks should not re-snap the route or rebuild UI.
 */
export function isHeadingOnlyPositionFix(
  previous: { latitude: number; longitude: number } | null,
  next: { latitude: number; longitude: number },
): boolean {
  if (!previous) return false;
  return previous.latitude === next.latitude && previous.longitude === next.longitude;
}
