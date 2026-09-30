/**
 * Maps service façade - Mappedin credentials from the backend.
 * Guests: mappedin.token from POST /api/users/guest/
 * Users: token from GET /api/maps/token/
 */
import { DEFAULT_MAPPEDIN_MAP_ID } from '../forum/domain/venue-map-source';
import {
  clearAuthSessionLocally,
  isAuthCredentialFailure,
  isInvalidAccessTokenFailure,
} from '../auth/data/datasources/api-client';
import { tokenLocalDatasource } from '../auth/data/datasources/token-local-datasource';
import { hasStoredAuthTokens } from './auth-service';
import {
  getStoredGuestMappedinToken,
  guestDenialUserMessage,
  validateCurrentGuestAccess,
} from './guest-access-service';
import type { MapsToken } from '../maps/domain/entities';
import { mapsRepository } from '../maps/data/maps-repository-impl';

export type { MapsToken };

/** Auth + map id for getMapData (backend Mappedin token). */
export type MappedinMapCredentials = {
  mapId: string;
  accessToken: string;
};

export type MappedinGetMapDataAuth = { accessToken: string };

/** GET /api/maps/token/ - short-lived Mappedin credentials (registered users). */
export function fetchMapsToken(): Promise<MapsToken> {
  return mapsRepository.getToken();
}

export function toGetMapDataAuth(
  credentials: MappedinMapCredentials,
): MappedinGetMapDataAuth {
  return { accessToken: credentials.accessToken };
}

/**
 * Prefer the venue's map id. The maps-token payload may also include a map id;
 * that is only a fallback when the caller did not request one.
 */
export function mapIdFromMapsToken(
  maps: MapsToken,
  requestedMapId: string | null | undefined,
  fallbackMapId: string = DEFAULT_MAPPEDIN_MAP_ID,
): string {
  const requested = requestedMapId?.trim();
  if (requested) return requested;
  if (typeof maps.mapId === 'string' && maps.mapId.trim()) {
    return maps.mapId.trim();
  }
  return fallbackMapId;
}

/**
 * Resolve Mappedin credentials for a specific map.
 *
 * If a stored user session is invalid (401/expired), falls back to guest
 * credentials so the splash can finish and the app can route to sign-in.
 */
export async function resolveMappedinMapCredentials(options?: {
  mapId?: string | null;
}): Promise<MappedinMapCredentials> {
  const mapId = options?.mapId?.trim() || DEFAULT_MAPPEDIN_MAP_ID;
  if (!mapId) {
    throw new Error('No Mappedin map id is available for this venue.');
  }

  // Registered user session → dedicated maps token endpoint.
  if (hasStoredAuthTokens() && !tokenLocalDatasource.isGuestToken()) {
    try {
      const maps = await fetchMapsToken();
      const accessToken = extractMappedinAccessToken(maps);
      if (!accessToken) {
        throw new Error('Map credentials from the server were incomplete.');
      }
      return {
        accessToken,
        mapId: mapIdFromMapsToken(maps, mapId),
      };
    } catch (error) {
      if (!isAuthCredentialFailure(error)) {
        throw error;
      }
      const wasGuestAuth = tokenLocalDatasource.isGuestToken();
      // Invalid/expired session: drop user tokens (notifies → sign-in or
      // create-account) and continue as guest so the map can finish loading.
      clearAuthSessionLocally(
        wasGuestAuth
          ? 'guest-expired'
          : isInvalidAccessTokenFailure(error)
            ? 'invalid-token'
            : 'expired',
      );
    }
  }

  // Guest: reuse cached Mappedin token, otherwise POST /api/users/guest/.
  let accessToken = getStoredGuestMappedinToken();
  if (!accessToken) {
    const result = await validateCurrentGuestAccess();
    if (!result.allowed) {
      throw new Error(guestDenialUserMessage(result.reason));
    }
    accessToken =
      result.session?.mappedin.token?.trim() || getStoredGuestMappedinToken();
  }

  if (!accessToken) {
    throw new Error('Could not obtain Mappedin credentials from the server.');
  }

  return { accessToken, mapId };
}

/** Normalize GET /api/maps/token/ body shapes used by the backend. */
export function extractMappedinAccessToken(maps: MapsToken): string | null {
  if (typeof maps.token === 'string' && maps.token.trim()) {
    return maps.token.trim();
  }
  const nested = maps.mappedin;
  if (nested && typeof nested === 'object') {
    const token = (nested as { token?: unknown }).token;
    if (typeof token === 'string' && token.trim()) {
      return token.trim();
    }
  }
  return null;
}
