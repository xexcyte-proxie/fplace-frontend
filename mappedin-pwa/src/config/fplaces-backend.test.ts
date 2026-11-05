import { describe, expect, it } from 'vitest';

import { describeWsUrl } from './ws-origin';
import {
  FPLACES_BACKEND_WS_ORIGIN,
  toWebSocketOrigin,
} from './fplaces-backend';

describe('toWebSocketOrigin', () => {
  it('converts HTTP origins to ws', () => {
    expect(toWebSocketOrigin('http://example.com')).toBe('ws://example.com');
    expect(toWebSocketOrigin('http://example.com/')).toBe('ws://example.com');
  });

  it('preserves transport security when converting origins', () => {
    expect(toWebSocketOrigin('https://example.com')).toBe('wss://example.com');
    expect(toWebSocketOrigin('wss://example.com')).toBe('wss://example.com');
    expect(toWebSocketOrigin('api.fplaces.com/')).toBe('wss://api.fplaces.com');
    expect(toWebSocketOrigin('ws://example.com')).toBe('ws://example.com');
  });
});

describe('describeWsUrl', () => {
  it('strips the access token from venue, location, and notification URLs', () => {
    expect(
      describeWsUrl(
        `${FPLACES_BACKEND_WS_ORIGIN}/ws/venues/1/?token=secret.jwt`,
      ),
    ).toBe(`${FPLACES_BACKEND_WS_ORIGIN}/ws/venues/1/`);
    expect(
      describeWsUrl(
        `${FPLACES_BACKEND_WS_ORIGIN}/ws/venues/1/locations/loc-north/?token=secret.jwt`,
      ),
    ).toBe(`${FPLACES_BACKEND_WS_ORIGIN}/ws/venues/1/locations/loc-north/`);
  });
});
