/**
 * Maps service façade - Mappedin credentials from the backend only.
 * Guests: mappedin.token from POST /api/users/guest/
 * Users: token from GET /api/maps/token/
 */
import { appConfig } from '../config';
import {
  clearAuthSessionLocally,
  isAuthCredentialFailure,
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

/** Short-lived Mappedin access token + map id for getMapData. */
export interface MappedinMapCredentials {
  accessToken: string;
  mapId: string;
}

/** GET /api/maps/token/ - short-lived Mappedin credentials (registered users). */
export function fetchMapsToken(): Promise<MapsToken> {
  return mapsRepository.getToken();
}

/**
 * Resolve Mappedin map credentials exclusively from the fplaces backend.
 * Never uses client-side Mappedin API key/secret.
 *
 * If a stored user session is invalid (401/expired), falls back to guest
 * credentials so the splash can finish and the app can route to sign-in.
 */
export async function resolveMappedinMapCredentials(options?: {
  mapId?: string | null;
}): Promise<MappedinMapCredentials> {
  const mapId =
    options?.mapId?.trim() || appConfig.mappedin.mapId.trim();
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
      const remoteMapId =
        typeof maps.mapId === 'string' && maps.mapId.trim()
          ? maps.mapId.trim()
          : mapId;
      return { accessToken, mapId: remoteMapId };
    } catch (error) {
      if (!isAuthCredentialFailure(error)) {
        throw error;
      }
      // Invalid/expired session — drop user tokens (notifies → sign-in) and
      // continue as guest so the map can finish loading.
      clearAuthSessionLocally();
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
