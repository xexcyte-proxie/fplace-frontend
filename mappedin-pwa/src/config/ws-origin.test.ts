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
  it('uses configured ws on HTTPS LAN', () => {
    const selected = selectWsOrigin({
      configured: FPLACES_BACKEND_WS_ORIGIN,
      api: '',
      pageProtocol: 'https:',
      pageHost: '192.168.118.25:5173',
      fallback: FPLACES_BACKEND_WS_ORIGIN,
    });
    expect(selected).toEqual({
      origin: FPLACES_BACKEND_WS_ORIGIN,
      mixedContent: true,
    });
  });

  it('uses configured ws on public HTTPS', () => {
    const selected = selectWsOrigin({
      configured: FPLACES_BACKEND_WS_ORIGIN,
      api: '',
      pageProtocol: 'https:',
      pageHost: 'fplaces.netlify.app',
      fallback: FPLACES_BACKEND_WS_ORIGIN,
    });
    expect(selected).toEqual({
      origin: FPLACES_BACKEND_WS_ORIGIN,
      mixedContent: true,
    });
  });

  it('uses the backend fallback on HTTPS LAN when no VITE_WS_URL is set', () => {
    const selected = selectWsOrigin({
      configured: '',
      api: '',
      pageProtocol: 'https:',
      pageHost: '192.168.118.25:5173',
      fallback: FPLACES_BACKEND_WS_ORIGIN,
    });
    expect(selected).toEqual({
      origin: FPLACES_BACKEND_WS_ORIGIN,
      mixedContent: true,
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
