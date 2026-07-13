/** Routing engine semantic version — bump when payload schema or algorithms change. */
export const ROUTING_ENGINE_VERSION = 'fplaces-routing/2.0';

/** Default walking speed (m/s) for duration estimates when Mappedin omits duration. */
export const WALKING_SPEED_MPS = 1.4;

/** Route delivery acknowledgement timeout (ms). */
export const ROUTE_ACK_TIMEOUT_MS = 2500;

/** Max route delivery retries before giving up. */
export const ROUTE_DELIVERY_MAX_RETRIES = 4;
