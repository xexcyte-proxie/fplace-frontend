import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  connectReconnectingWebSocket,
  WS_RECONNECT_BASE_MS,
} from './reconnecting-websocket';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  url: string;
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (event: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', { code: 1006, reason: '', wasClean: false });
  }

  emit(type: string, event: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }

  openNow() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open', {});
  }
}

describe('connectReconnectingWebSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('emits auth_missing and does not open a socket without a user token', () => {
    const statuses: string[] = [];
    const sub = connectReconnectingWebSocket({
      logTag: 'TestWS',
      buildUrl: () => null,
      onMessage: () => {},
      onStatus: (status) => statuses.push(status),
    });

    expect(statuses).toEqual(['auth_missing']);
    expect(FakeWebSocket.instances).toHaveLength(0);
    sub.disconnect();
  });

  it('stays on connecting while retrying a failed handshake', () => {
    vi.useFakeTimers();
    const statuses: string[] = [];
    const sub = connectReconnectingWebSocket({
      logTag: 'TestWS',
      buildUrl: () => 'ws://example.test/ws/venues/1/?token=user',
      onMessage: () => {},
      onStatus: (status) => statuses.push(status),
    });

    expect(statuses).toEqual(['connecting']);
    FakeWebSocket.instances[0]?.close();
    expect(statuses).toEqual(['connecting']);
    expect(statuses).not.toContain('disconnected');

    vi.advanceTimersByTime(WS_RECONNECT_BASE_MS);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(statuses).toEqual(['connecting']);

    sub.disconnect();
  });

  it('opens ws sockets even from an HTTPS page', () => {
    vi.stubGlobal('window', {
      location: { protocol: 'https:', host: 'fplaces.netlify.app' },
    });

    const statuses: string[] = [];
    const sub = connectReconnectingWebSocket({
      logTag: 'TestWS',
      buildUrl: () => 'ws://alb.example/ws/venues/1/?token=user',
      onMessage: () => {},
      onStatus: (status) => statuses.push(status),
    });

    expect(statuses).toEqual(['connecting']);
    expect(FakeWebSocket.instances).toHaveLength(1);
    sub.disconnect();
  });
});
