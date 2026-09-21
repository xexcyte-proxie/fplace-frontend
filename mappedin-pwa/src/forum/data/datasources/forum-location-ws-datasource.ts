import { resolveWsOrigin } from '../../../config/ws-origin';
import { connectReconnectingWebSocket } from '../../../config/reconnecting-websocket';
import { tokenLocalDatasource } from '../../../auth/data/datasources/token-local-datasource';
import type {
  LocationLiveEvent,
  LocationLiveEventHandler,
  LocationLiveStatusHandler,
  LocationLiveSubscription,
} from '../../domain/entities';
import { coerceLocationMessage } from '../mappers/location-message-mapper';

/**
 * Receive-only WebSocket to
 * `ws/venues/<venue_id>/locations/<location_id>/?token=<access_token>`.
 * Never sends application payloads upstream.
 */
export class ForumLocationWsDatasource {
  connect(
    venueId: number,
    locationId: string,
    onEvent: LocationLiveEventHandler,
    onStatus?: LocationLiveStatusHandler,
  ): LocationLiveSubscription {
    return connectReconnectingWebSocket({
      logTag: 'LocationWS',
      buildUrl: () => {
        const token = tokenLocalDatasource.getUserAccessToken();
        if (!token) return null;
        return buildLocationWsUrl(venueId, locationId, token);
      },
      onMessage: (parsed) => {
        const liveEvent = parseLocationLiveMessage(parsed);
        if (!liveEvent) return;
        onEvent(liveEvent);
      },
      onStatus,
    });
  }
}

export function buildLocationWsUrl(
  venueId: number,
  locationId: string,
  accessToken: string,
): string {
  const origin = resolveWsOrigin();
  const encodedLocation = encodeURIComponent(locationId);
  const url = new URL(
    `/ws/venues/${venueId}/locations/${encodedLocation}/`,
    `${origin}/`,
  );
  url.searchParams.set('token', accessToken);
  return url.toString();
}

export function parseLocationLiveMessage(
  raw: unknown,
): LocationLiveEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const message = raw as Record<string, unknown>;
  const type = String(message.type ?? message.event ?? '').trim();
  if (type !== 'new_location_message' && type !== 'location_message') {
    return null;
  }

  const payload =
    extractObject(message, ['message', 'payload', 'data']) ?? message;
  const cleaned = { ...payload };
  if (
    cleaned.type === 'new_location_message' ||
    cleaned.type === 'location_message'
  ) {
    delete cleaned.type;
  }
  const locationMessage = coerceLocationMessage(cleaned);
  if (!locationMessage) return null;
  return { type: 'new_location_message', message: locationMessage };
}

function extractObject(
  message: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = message[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

export const forumLocationWsDatasource = new ForumLocationWsDatasource();
