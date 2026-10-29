/**
 * Which Mappedin map a venue should load.
 *
 * Catalog venues use `mappedin_map_id` plus a backend Mappedin token.
 */

export const DEFAULT_MAPPEDIN_MAP_ID = '65c0ff7430b94e3fabd5bb8c';

export interface VenueMapLoadRequest {
  mapId: string;
}

/**
 * Resolve the map to load for the selected venue.
 * Uses the venue's bundled map id, then the Demo Mall fallback.
 */
export function venueMapLoadRequest(input: {
  mappedinMapId: string | null | undefined;
  defaultMapId?: string;
}): VenueMapLoadRequest {
  const fallback = input.defaultMapId?.trim() || DEFAULT_MAPPEDIN_MAP_ID;
  return {
    mapId: input.mappedinMapId?.trim() || fallback,
  };
}

export function venueMapLoadKey(request: VenueMapLoadRequest): string {
  return request.mapId;
}
