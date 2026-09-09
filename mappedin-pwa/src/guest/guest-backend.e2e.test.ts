import { describe, expect, it } from 'vitest';

import { FPLACES_BACKEND_HTTP_ORIGIN } from '../config/fplaces-backend';
import {
  guestCanUseArTrial,
  type GuestSession,
} from './domain/entities';
import type { GuestTokenApiResponse } from './data/mappers/guest-session-mapper';
import {
  mapGuestSessionPreferences,
  mapGuestTokenResponse,
} from './data/mappers/guest-session-mapper';

/**
 * Live e2e against the deployed guest API.
 * Uses unique fingerprints so runs do not exhaust a shared trial window.
 */
const BACKEND = FPLACES_BACKEND_HTTP_ORIGIN;
const LIVE_TIMEOUT_MS = 45_000;

function uniqueFingerprint(): string {
  return `fp_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('JWT missing payload');
  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

async function requestJson(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; ok: boolean; body: unknown }> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${BACKEND}${path}`, { ...init, headers });
  let body: unknown = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { status: response.status, ok: response.ok, body };
}

async function obtainGuest(
  fingerprint: string,
  ipAddress = '1.2.3.4',
): Promise<{
  status: number;
  ok: boolean;
  body: GuestTokenApiResponse;
  session: GuestSession;
}> {
  const result = await requestJson('/api/users/guest/', {
    method: 'POST',
    body: JSON.stringify({
      ip_address: ipAddress,
      device_fingerprint: fingerprint,
    }),
  });
  expect(result.ok, `POST /api/users/guest/ HTTP ${result.status}`).toBe(true);
  const body = result.body as GuestTokenApiResponse;
  const session = mapGuestTokenResponse(body, fingerprint);
  return { status: result.status, ok: result.ok, body, session };
}

describe('Guest API live (fplaces-backend)', () => {
  it(
    'issues a guest JWT + Mappedin token that the client mapper accepts',
    async () => {
      const fingerprint = uniqueFingerprint();
      const { body, session } = await obtainGuest(fingerprint);

      expect(body.token_type).toBe('guest');
      expect(body.access).toMatch(/^eyJ/);
      expect(body.expires_in).toBeGreaterThan(0);
      expect(body.mappedin.token.length).toBeGreaterThan(8);
      expect(body.mappedin.expires_in).toBeGreaterThan(0);
      expect(typeof body.has_tried_ar_view).toBe('boolean');
      expect(typeof body.has_tried_2d_view).toBe('boolean');

      const claims = decodeJwtPayload(body.access);
      expect(claims.token_type).toBe('guest');

      expect(session.tokenType).toBe('guest');
      expect(session.deviceFingerprint).toBe(fingerprint);
      expect(session.mappedin.token).toBe(body.mappedin.token);
      expect(guestCanUseArTrial(session)).toBe(true);
    },
    LIVE_TIMEOUT_MS,
  );

  it(
    're-issues a fresh JWT for the same fingerprint on the same calendar day',
    async () => {
      const fingerprint = uniqueFingerprint();
      const first = await obtainGuest(fingerprint);
      const second = await obtainGuest(fingerprint);

      expect(second.body.access).toMatch(/^eyJ/);
      expect(second.body.access).not.toBe(first.body.access);
      expect(second.body.token_type).toBe('guest');
      expect(second.body.trial_expires_at).toBe(first.body.trial_expires_at);
      expect(second.body.has_tried_ar_view).toBe(first.body.has_tried_ar_view);
      expect(second.body.has_tried_2d_view).toBe(first.body.has_tried_2d_view);
    },
    LIVE_TIMEOUT_MS,
  );

  it(
    'reads and persists AR / 2D trial flags via GET/PATCH /api/users/guest/update/',
    async () => {
      const fingerprint = uniqueFingerprint();
      const { session } = await obtainGuest(fingerprint);
      const authHeaders = { Authorization: `Bearer ${session.access}` };

      const initial = await requestJson('/api/users/guest/update/', {
        method: 'GET',
        headers: authHeaders,
      });
      expect(initial.ok, `GET preferences HTTP ${initial.status}`).toBe(true);
      expect(mapGuestSessionPreferences(initial.body)).toEqual({
        hasTriedArView: false,
        hasTried2dView: false,
      });

      const patchedAr = await requestJson('/api/users/guest/update/', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ has_tried_ar_view: true }),
      });
      expect(patchedAr.ok, `PATCH AR HTTP ${patchedAr.status}`).toBe(true);

      const afterAr = await requestJson('/api/users/guest/update/', {
        method: 'GET',
        headers: authHeaders,
      });
      expect(afterAr.ok).toBe(true);
      const arPrefs = mapGuestSessionPreferences(afterAr.body);
      expect(arPrefs.hasTriedArView).toBe(true);
      expect(guestCanUseArTrial(arPrefs)).toBe(false);

      const patched2d = await requestJson('/api/users/guest/update/', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ has_tried_2d_view: true }),
      });
      expect(patched2d.ok, `PATCH 2D HTTP ${patched2d.status}`).toBe(true);

      const afterBoth = await requestJson('/api/users/guest/update/', {
        method: 'GET',
        headers: authHeaders,
      });
      expect(mapGuestSessionPreferences(afterBoth.body)).toEqual({
        hasTriedArView: true,
        hasTried2dView: true,
      });

      const reissued = await obtainGuest(fingerprint);
      expect(reissued.body.has_tried_ar_view).toBe(true);
      expect(reissued.body.has_tried_2d_view).toBe(true);
    },
    LIVE_TIMEOUT_MS,
  );

  it(
    'rejects a guest token request with missing fingerprint',
    async () => {
      const result = await requestJson('/api/users/guest/', {
        method: 'POST',
        body: JSON.stringify({ ip_address: '1.2.3.4' }),
      });
      expect(result.status).toBe(400);
      expect(result.ok).toBe(false);
    },
    LIVE_TIMEOUT_MS,
  );

  it(
    'rejects guest preference reads without a bearer token',
    async () => {
      const result = await requestJson('/api/users/guest/update/', {
        method: 'GET',
      });
      expect([401, 403]).toContain(result.status);
    },
    LIVE_TIMEOUT_MS,
  );
});
