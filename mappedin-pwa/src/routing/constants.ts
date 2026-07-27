/** Routing engine semantic version — bump when payload schema or algorithms change. */
export const ROUTING_ENGINE_VERSION = 'fplaces-routing/2.0';

/** Default walking speed (m/s) for duration estimates when Mappedin omits duration. */
export const WALKING_SPEED_MPS = 1.4;

/** Route delivery acknowledgement timeout (ms). */
export const ROUTE_ACK_TIMEOUT_MS = 2500;

/** Max route delivery retries before giving up. */
export const ROUTE_DELIVERY_MAX_RETRIES = 4;

/** Persistent: location has no map geometry — picking again won't help. */
export const LOCATION_NOT_ROUTABLE_MESSAGE =
  "This location isn't on the map, so it can't be used for directions. Try another place.";

/** Persistent: Mappedin found no path between the selected points. */
export const ROUTE_NOT_FOUND_MESSAGE =
  'No route found between the selected points. Try a different start or end.';

export const START_TOO_CLOSE_MESSAGE =
  'Start point is too close to the end point. Tap farther apart on the map.';

export const END_TOO_CLOSE_MESSAGE =
  'End point is too close to the start point. Tap farther apart on the map.';

export const ROUTE_POINTS_REQUIRED_MESSAGE =
  'Set both a start and end point before getting directions.';

const USER_FACING_ROUTE_MESSAGES = new Set<string>([
  LOCATION_NOT_ROUTABLE_MESSAGE,
  ROUTE_NOT_FOUND_MESSAGE,
  START_TOO_CLOSE_MESSAGE,
  END_TOO_CLOSE_MESSAGE,
  ROUTE_POINTS_REQUIRED_MESSAGE,
]);

const NULL_COORD_ERROR =
  /cannot read propert(?:y|ies) of (?:null|undefined).*(?:latitude|longitude)|(?:latitude|longitude).*(?:null|undefined)/i;

/**
 * Maps routing/SDK failures to stable, user-facing copy.
 * Persistent failures (missing geometry, no path) get explicit guidance.
 */
export function toUserFacingRouteError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (!message) return fallback;
  if (USER_FACING_ROUTE_MESSAGES.has(message)) return message;
  if (message.includes('too close')) return message;
  if (NULL_COORD_ERROR.test(message)) return LOCATION_NOT_ROUTABLE_MESSAGE;
  return fallback;
}
