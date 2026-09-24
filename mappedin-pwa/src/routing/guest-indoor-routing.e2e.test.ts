import { getMapData, type MapData } from '@mappedin/mappedin-js';
import { describe, expect, it } from 'vitest';

import { FPLACES_BACKEND_HTTP_ORIGIN } from '../config/fplaces-backend';
import type { GuestTokenApiResponse } from '../guest/data/mappers/guest-session-mapper';
import { mapGuestTokenResponse } from '../guest/data/mappers/guest-session-mapper';
import type { RouteCoordinate, RoutePayload } from '../types';
import { haversineMeters } from '../utils/geo-math';
import { buildRoutePayload, serializeCoordinate } from '../utils/route-helpers';
import { coordinateTransformationService } from './coordinate-transformation-service';
import {
  END_TOO_CLOSE_MESSAGE,
  START_TOO_CLOSE_MESSAGE,
  WALKING_SPEED_MPS,
} from './constants';
import {
  computeLiveRemainingMeters,
  estimateLiveWalkSeconds,
} from './route-progress';
import { routeValidationService } from './route-validation-service';

const BACKEND = FPLACES_BACKEND_HTTP_ORIGIN;
const LIVE_TIMEOUT_MS = 90_000;
const MIN_ROUTE_SEPARATION_M = 15;
const TOO_CLOSE_M = 3;

type NamedTarget = {
  name: string;
  target: unknown;
  coord: RouteCoordinate;
};

async function obtainGuestMappedinToken(): Promise<{
  accessToken: string;
  guestJwt: string;
}> {
  const fingerprint = `fp_route_e2e_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const response = await fetch(`${BACKEND}/api/users/guest/`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ip_address: '1.2.3.4',
      device_fingerprint: fingerprint,
    }),
  });
  expect(response.ok, `guest token HTTP ${response.status}`).toBe(true);
  const body = (await response.json()) as GuestTokenApiResponse;
  const session = mapGuestTokenResponse(body, fingerprint);
  return { accessToken: session.mappedin.token, guestJwt: session.access };
}

function collectNamedTargets(mapData: MapData): NamedTarget[] {
  const out: NamedTarget[] = [];
  const seen = new Set<string>();

  const add = (item: { id?: string; name?: string }, target: unknown) => {
    const name = item.name?.trim();
    const coord = serializeCoordinate(target) ?? serializeCoordinate(item);
    if (!name || !coord || coord.floorId === 'unknown') return;
    const key = `${name}|${coord.latitude.toFixed(6)}|${coord.longitude.toFixed(6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, target, coord });
  };

  for (const profile of mapData.getByType('location-profile')) {
    const spaces = (profile as { spaces?: unknown[] }).spaces ?? [];
    add(profile, spaces[0] ?? profile);
  }
  for (const space of mapData.getByType('space')) {
    add(space, space);
  }
  return out;
}

async function routeBetween(
  mapData: MapData,
  from: NamedTarget,
  to: NamedTarget,
  mapId: string,
): Promise<RoutePayload | null> {
  try {
    const directions = await mapData.getDirections(from.target, to.target);
    if (!directions?.coordinates?.length) return null;
    return buildRoutePayload(
      directions,
      to.name,
      mapId,
      from.target,
      to.target,
    );
  } catch {
    return null;
  }
}

async function findWalkableRoute(
  mapData: MapData,
  mapId: string,
): Promise<{ from: NamedTarget; to: NamedTarget; route: RoutePayload }> {
  const targets = collectNamedTargets(mapData);
  expect(targets.length).toBeGreaterThan(1);

  const attempts: Array<[NamedTarget, NamedTarget]> = [];
  for (let i = 0; i < targets.length && attempts.length < 24; i += 1) {
    for (let j = i + 1; j < targets.length && attempts.length < 24; j += 1) {
      const a = targets[i];
      const b = targets[j];
      if (haversineMeters(a.coord, b.coord) < MIN_ROUTE_SEPARATION_M) continue;
      attempts.push([a, b]);
    }
  }
  expect(attempts.length).toBeGreaterThan(0);

  for (const [from, to] of attempts) {
    const route = await routeBetween(mapData, from, to, mapId);
    if (route && (route.distanceMeters ?? 0) >= MIN_ROUTE_SEPARATION_M) {
      return { from, to, route };
    }
  }

  throw new Error('No walkable Mappedin route found between named locations');
}

describe('Guest indoor wayfinding (live Mappedin + backend token)', () => {
  it(
    'builds a validated walk route from a guest Mappedin token',
    async () => {
      const { accessToken } = await obtainGuestMappedinToken();
      const catalogResponse = await fetch(`${BACKEND}/api/forum/venues/`);
      expect(catalogResponse.ok).toBe(true);
      const catalog = await catalogResponse.json() as { results: Array<{ mappedin_map_id?: string | null }> };
      const mapId = catalog.results.find(venue => venue.mappedin_map_id?.trim())?.mappedin_map_id?.trim();
      expect(mapId, 'A catalog venue must have a Mappedin map').toBeTruthy();
      const mapData = await getMapData({ accessToken, mapId: mapId! });
      const { from, to, route } = await findWalkableRoute(mapData, mapId!);

      expect(haversineMeters(from.coord, to.coord)).toBeGreaterThan(TOO_CLOSE_M);

      const validation = routeValidationService.validate(route);
      expect(validation.valid, validation.errors.join('; ')).toBe(true);
      expect(route.pathCoordinates.length).toBeGreaterThanOrEqual(2);
      expect(route.distanceMeters).toBeGreaterThan(TOO_CLOSE_M);
      expect(route.durationSeconds).toBeCloseTo(
        (route.distanceMeters ?? 0) / WALKING_SPEED_MPS,
        5,
      );
      expect(route.routingEngineVersion).toBe('fplaces-routing/2.0');
      expect(route.navigationMode).toBe('walk');
      expect(route.destinationName).toBe(to.name);
      expect(
        route.pathCoordinates.every((point) => point.floorId.length > 0),
      ).toBe(true);

      const pathMeters = coordinateTransformationService.totalPathLengthMeters(
        route.pathCoordinates,
      );
      expect(pathMeters).toBeGreaterThan(TOO_CLOSE_M);

      const atStart = computeLiveRemainingMeters({
        totalPathMeters: pathMeters,
        alongPathMeters: 0,
      });
      expect(atStart).toBeCloseTo(pathMeters, 5);

      const midAlong = pathMeters / 2;
      const remainingMid = computeLiveRemainingMeters({
        totalPathMeters: pathMeters,
        alongPathMeters: midAlong,
      });
      expect(remainingMid).toBeCloseTo(pathMeters / 2, 5);
      expect(
        estimateLiveWalkSeconds({
          remainingMeters: remainingMid,
          totalPathMeters: pathMeters,
          routeDurationSeconds: route.durationSeconds,
        }),
      ).toBeGreaterThan(0);

      const midPoint = coordinateTransformationService.snapAtDistanceAlongPath(
        route.pathCoordinates,
        midAlong,
      );
      expect(midPoint).not.toBeNull();
      const snapped = coordinateTransformationService.snapToRoute(
        route.pathCoordinates,
        midPoint!.latitude,
        midPoint!.longitude,
        { floorId: midPoint!.floorId },
      );
      expect(snapped).not.toBeNull();
      expect(snapped!.offRouteMeters ?? 0).toBeLessThan(2);

      const samePointGap = haversineMeters(from.coord, from.coord);
      expect(samePointGap).toBeLessThan(TOO_CLOSE_M);
      expect(START_TOO_CLOSE_MESSAGE).toMatch(/too close/i);
      expect(END_TOO_CLOSE_MESSAGE).toMatch(/too close/i);
    },
    LIVE_TIMEOUT_MS,
  );

  it(
    'records the guest 2D trial after a successful indoor route',
    async () => {
      const { guestJwt } = await obtainGuestMappedinToken();
      const patched = await fetch(`${BACKEND}/api/users/guest/update/`, {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${guestJwt}`,
        },
        body: JSON.stringify({ has_tried_2d_view: true }),
      });
      expect(patched.ok, `PATCH 2D HTTP ${patched.status}`).toBe(true);

      const read = await fetch(`${BACKEND}/api/users/guest/update/`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${guestJwt}`,
        },
      });
      expect(read.ok).toBe(true);
      const prefs = (await read.json()) as { has_tried_2d_view?: boolean };
      expect(prefs.has_tried_2d_view).toBe(true);
    },
    LIVE_TIMEOUT_MS,
  );
});
