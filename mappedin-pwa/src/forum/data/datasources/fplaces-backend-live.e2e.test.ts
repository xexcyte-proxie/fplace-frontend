import { describe, expect, it } from 'vitest';

import {
  FPLACES_BACKEND_HTTP_ORIGIN,
  FPLACES_BACKEND_WS_ORIGIN,
  toWebSocketOrigin,
} from '../../../config/fplaces-backend';
import { parsePersonalNotificationMessage } from '../../../notifications/data/datasources/notifications-ws-datasource';
import {
  parseVenueLiveMessage,
} from './forum-ws-datasource';

const LIVE_TIMEOUT_MS = 60_000;
const WS_WAIT_MS = 15_000;

type JsonRecord = Record<string, unknown>;

async function requestJson(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; ok: boolean; body: unknown }> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${FPLACES_BACKEND_HTTP_ORIGIN}${path}`, {
    ...init,
    headers,
  });
  let body: unknown = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { status: response.status, ok: response.ok, body };
}

function resultsOf(body: unknown): JsonRecord[] {
  const rows = (body as JsonRecord | null)?.results;
  return Array.isArray(rows) ? (rows as JsonRecord[]) : [];
}

async function obtainUserAccess(): Promise<string> {
  const stamp = Date.now();
  const email = `e2e.live.${stamp}@example.com`;
  const password = 'SuperSecret123!';
  await requestJson('/api/users/register/', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      password_confirm: password,
    }),
  });
  const login = await requestJson('/api/users/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  expect(login.ok, `login HTTP ${login.status}`).toBe(true);
  const access = String((login.body as JsonRecord).access ?? '');
  expect(access).toMatch(/^eyJ/);

  const pseudo = `e2e_${stamp}`;
  const me = await requestJson('/api/users/me/', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${access}` },
    body: JSON.stringify({ pseudo_name: pseudo }),
  });
  expect(me.ok, `PATCH /me HTTP ${me.status}`).toBe(true);
  return access;
}

function venueWsUrl(venueId: number, token: string): string {
  const url = new URL(
    `/ws/venues/${venueId}/`,
    `${FPLACES_BACKEND_WS_ORIGIN}/`,
  );
  url.searchParams.set('token', token);
  return url.toString();
}

function notificationsWsUrl(token: string): string {
  const url = new URL(
    '/ws/notifications/',
    `${FPLACES_BACKEND_WS_ORIGIN}/`,
  );
  url.searchParams.set('token', token);
  return url.toString();
}

function waitForSocketOpen(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let opened = false;
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`WebSocket open timed out: ${url}`));
    }, WS_WAIT_MS);
    socket.addEventListener('open', () => {
      opened = true;
      clearTimeout(timer);
      resolve(socket);
    });
    socket.addEventListener('error', () => {
      // `close` follows on handshake failure.
    });
    socket.addEventListener('close', (event) => {
      if (opened) return;
      clearTimeout(timer);
      reject(
        new Error(`WebSocket closed before open (${event.code} ${event.reason})`),
      );
    });
  });
}

describe('Live ALB REST + WebSocket', () => {
  it('maps the ALB HTTP origin to ws://', () => {
    expect(toWebSocketOrigin(FPLACES_BACKEND_HTTP_ORIGIN)).toBe(
      FPLACES_BACKEND_HTTP_ORIGIN.replace("http://", "ws://"),
    );
    expect(venueWsUrl(1, 'abc')).toBe(
      `${FPLACES_BACKEND_WS_ORIGIN}/ws/venues/1/?token=abc`,
    );
    expect(notificationsWsUrl('abc')).toBe(
      `${FPLACES_BACKEND_WS_ORIGIN}/ws/notifications/?token=abc`,
    );
  });

  it(
    'serves the public venue catalog without a user JWT',
    async () => {
      const venues = await requestJson('/api/forum/venues/');
      expect(venues.ok, `venues HTTP ${venues.status}`).toBe(true);
      const venueRows = resultsOf(venues.body);
      expect(venueRows.length).toBeGreaterThan(0);
      expect(Number(venueRows[0].id)).toBe(1);
      expect(String(venueRows[0].name)).toContain('Riverside');

      const categories = await requestJson('/api/forum/categories/');
      expect(categories.ok, `categories HTTP ${categories.status}`).toBe(true);
      expect(resultsOf(categories.body).length).toBeGreaterThan(0);

      const sections = await requestJson('/api/forum/sections/?venue=1');
      expect(sections.ok, `sections HTTP ${sections.status}`).toBe(true);
      expect(resultsOf(sections.body).length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT_MS,
  );

  it(
    'rejects guest JWTs on the venue-scoped feed (user access token required)',
    async () => {
      const guest = await requestJson('/api/users/guest/', {
        method: 'POST',
        body: JSON.stringify({
          ip_address: '1.2.3.4',
          device_fingerprint: `fp_live_${Date.now()}`,
        }),
      });
      expect(guest.ok).toBe(true);
      const access = String((guest.body as JsonRecord).access ?? '');
      const posts = await requestJson('/api/forum/posts/?venue=1', {
        headers: { Authorization: `Bearer ${access}` },
      });
      expect(posts.status).toBe(401);
    },
    LIVE_TIMEOUT_MS,
  );

  it(
    'opens venue + notification sockets and broadcasts a new post live',
    async () => {
      const access = await obtainUserAccess();
      const auth = { Authorization: `Bearer ${access}` };

      const feed = await requestJson('/api/forum/posts/?venue=1', {
        headers: auth,
      });
      expect(feed.ok, `posts HTTP ${feed.status}`).toBe(true);

      const categories = resultsOf(
        (await requestJson('/api/forum/categories/')).body,
      );
      const sections = resultsOf(
        (await requestJson('/api/forum/sections/?venue=1')).body,
      );
      const categoryId = Number(categories[0]?.id);
      const sectionId = Number(sections[0]?.id);
      expect(Number.isFinite(categoryId)).toBe(true);
      expect(Number.isFinite(sectionId)).toBe(true);

      const venueSocket = await waitForSocketOpen(venueWsUrl(1, access));
      const notifySocket = await waitForSocketOpen(notificationsWsUrl(access));
      const liveRaw: unknown[] = [];
      venueSocket.addEventListener('message', (event) => {
        try {
          liveRaw.push(JSON.parse(String(event.data)));
        } catch {
          /* ignore non-JSON */
        }
      });

      const created = await requestJson('/api/forum/posts/', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          venue: 1,
          category: categoryId,
          section: sectionId,
          content: `live e2e ${Date.now()}`,
        }),
      });
      expect(created.ok, `create post HTTP ${created.status}`).toBe(true);
      const postId = Number((created.body as JsonRecord).id);
      expect(Number.isFinite(postId)).toBe(true);

      const deadline = Date.now() + 8_000;
      let parsed = liveRaw.map((raw) => parseVenueLiveMessage(raw));
      while (
        Date.now() < deadline &&
        (!parsed.some((event) => event?.type === 'new_post') ||
          !parsed.some((event) => event?.type === 'section_heat_update'))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        parsed = liveRaw.map((raw) => parseVenueLiveMessage(raw));
      }

      const newPost = parsed.find((event) => event?.type === 'new_post');
      const heat = parsed.find((event) => event?.type === 'section_heat_update');
      expect(newPost?.type, `live frames: ${JSON.stringify(liveRaw)}`).toBe(
        'new_post',
      );
      if (newPost?.type === 'new_post') {
        expect(newPost.post.id).toBe(postId);
      }
      expect(heat?.type).toBe('section_heat_update');

      notifySocket.close(1000, 'live-e2e');
      venueSocket.close(1000, 'live-e2e');
      expect(parsePersonalNotificationMessage({ type: 'ignored' })).toBeNull();
    },
    LIVE_TIMEOUT_MS,
  );

  it(
    'rejects a venue socket that omits the token',
    async () => {
      await expect(
        waitForSocketOpen(`${FPLACES_BACKEND_WS_ORIGIN}/ws/venues/1/`),
      ).rejects.toThrow(/closed before open/i);
    },
    LIVE_TIMEOUT_MS,
  );
});
