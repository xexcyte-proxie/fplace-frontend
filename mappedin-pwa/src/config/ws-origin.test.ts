import { describe, expect, it } from 'vitest';

import { FPLACES_BACKEND_WS_ORIGIN } from './fplaces-backend';
import {
  isLoopbackOrPrivateHost,
  selectWsOrigin,
} from './ws-origin';

describe('isLoopbackOrPrivateHost', () => {
  it('treats localhost and RFC1918 LAN hosts as private', () => {
    expect(isLoopbackOrPrivateHost('localhost:5173')).toBe(true);
    expect(isLoopbackOrPrivateHost('192.168.118.25:5173')).toBe(true);
    expect(isLoopbackOrPrivateHost('10.0.0.8')).toBe(true);
    expect(isLoopbackOrPrivateHost('172.16.1.4')).toBe(true);
    expect(isLoopbackOrPrivateHost('fplaces.netlify.app')).toBe(false);
  });
});

describe('selectWsOrigin', () => {
  it('uses same-origin wss on HTTPS LAN instead of ws:// ALB', () => {
    const selected = selectWsOrigin({
      configured: FPLACES_BACKEND_WS_ORIGIN,
      api: '',
      pageProtocol: 'https:',
      pageHost: '192.168.118.25:5173',
      fallback: FPLACES_BACKEND_WS_ORIGIN,
    });
    expect(selected).toEqual({
      origin: 'wss://192.168.118.25:5173',
      mixedContent: false,
    });
  });

  it('fails closed to same-origin wss on public HTTPS + ws:// backend', () => {
    const selected = selectWsOrigin({
      configured: FPLACES_BACKEND_WS_ORIGIN,
      api: '',
      pageProtocol: 'https:',
      pageHost: 'fplaces.netlify.app',
      fallback: FPLACES_BACKEND_WS_ORIGIN,
    });
    expect(selected).toEqual({
      origin: 'wss://fplaces.netlify.app',
      mixedContent: false,
    });
  });

  it('keeps same-origin wss on HTTPS LAN when no VITE_WS_URL is set', () => {
    const selected = selectWsOrigin({
      configured: '',
      api: '',
      pageProtocol: 'https:',
      pageHost: '192.168.118.25:5173',
      fallback: FPLACES_BACKEND_WS_ORIGIN,
    });
    expect(selected).toEqual({
      origin: 'wss://192.168.118.25:5173',
      mixedContent: false,
    });
  });

  it('keeps ws:// on HTTP pages', () => {
    const selected = selectWsOrigin({
      configured: FPLACES_BACKEND_WS_ORIGIN,
      api: '',
      pageProtocol: 'http:',
      pageHost: '192.168.118.25:5173',
      fallback: FPLACES_BACKEND_WS_ORIGIN,
    });
    expect(selected.origin).toBe(FPLACES_BACKEND_WS_ORIGIN);
    expect(selected.mixedContent).toBe(false);
  });
});
