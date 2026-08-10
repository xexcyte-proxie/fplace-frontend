/**
 * Maps service façade — Mappedin token issuance for authenticated clients.
 */
import type { MapsToken } from '../maps/domain/entities';
import { mapsRepository } from '../maps/data/maps-repository-impl';

export type { MapsToken };

/** GET /api/maps/token/ — short-lived Mappedin credentials. */
export function fetchMapsToken(): Promise<MapsToken> {
  return mapsRepository.getToken();
}
