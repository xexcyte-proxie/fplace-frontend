/** Response from GET /api/maps/token/ (Mappedin short-lived credentials). */
export interface MapsToken {
  /** Opaque token / key payload from the backend. */
  token?: string;
  key?: string;
  secret?: string;
  mapId?: string;
  expiresAt?: string;
  /** Preserve unknown backend fields. */
  [key: string]: unknown;
}
