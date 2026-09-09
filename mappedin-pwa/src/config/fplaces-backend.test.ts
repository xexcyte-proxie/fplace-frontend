import { describe, expect, it } from 'vitest';

import { describeWsUrl } from './ws-origin';
import {
  FPLACES_BACKEND_HOST,
  FPLACES_BACKEND_HTTP_ORIGIN,
  FPLACES_BACKEND_WS_ORIGIN,
  toWebSocketOrigin,
} from './fplaces-backend';

describe('toWebSocketOrigin', () => {
  it('converts the ALB HTTP origin to ws', () => {
    expect(toWebSocketOrigin(FPLACES_BACKEND_HTTP_ORIGIN)).toBe(
      FPLACES_BACKEND_WS_ORIGIN,
    );
    expect(toWebSocketOrigin(`http://${FPLACES_BACKEND_HOST}/`)).toBe(
      FPLACES_BACKEND_WS_ORIGIN,
    );
  });

  it('converts https to wss and leaves ws/wss unchanged', () => {
    expect(toWebSocketOrigin('https://example.com')).toBe('wss://example.com');
    expect(toWebSocketOrigin('wss://example.com')).toBe('wss://example.com');
    expect(toWebSocketOrigin('ws://example.com')).toBe('ws://example.com');
  });
});

describe('describeWsUrl', () => {
  it('strips the access token from venue and notification URLs', () => {
    expect(
      describeWsUrl(
        `${FPLACES_BACKEND_WS_ORIGIN}/ws/venues/1/?token=secret.jwt`,
      ),
    ).toBe(`${FPLACES_BACKEND_WS_ORIGIN}/ws/venues/1/`);
  });
});
