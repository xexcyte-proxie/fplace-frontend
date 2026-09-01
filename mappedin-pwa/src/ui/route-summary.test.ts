import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import { buildRouteSheetSummary } from './route-summary';

describe('buildRouteSheetSummary', () => {
  it('shows live remaining walk distance while the guest is on route', () => {
    const state = initialAppState();
    state.route = {
      legs: [],
      pathCoordinates: [
        { latitude: 43.64, longitude: -79.38, floorId: 'f1' },
        { latitude: 43.641, longitude: -79.381, floorId: 'f1' },
      ],
      maneuvers: [],
      destinationName: 'Apple Store',
      distanceMeters: 100,
      durationSeconds: 80,
      routeId: 'route-live',
      routeVersion: 1,
      generatedAt: 1,
      updatedAt: 1,
      geometryHash: 'h',
      checksum: 'c',
      mapVersion: 'm',
      venueId: 'v',
      routingEngineVersion: 'fplaces-routing/2.0',
      lifecycle: { state: 'navigating', stateChangedAt: 1 },
    };
    state.routeTraveledMeters = 60;
    state.routeRemainingMeters = 40;
    state.markers = {
      destinationLabel: 'Apple Store',
      destinationFloorName: 'Level 1',
      destinationAreaHint: 'Shopping level',
    };

    const summary = buildRouteSheetSummary(state);
    expect(summary.title).toBe('Apple Store');
    expect(summary.walkDistance).toBe('40 M WALK');
    expect(summary.walkTime).toBe('32s');
    expect(summary.needsReset).toBe(false);
  });

  it('prompts reset when Mappedin finds no route between the selected points', () => {
    const state = initialAppState();
    state.routeNotFound = true;
    state.markers = {
      origin: { latitude: 43.64, longitude: -79.38, floorId: 'f1' },
      destination: { latitude: 43.641, longitude: -79.381, floorId: 'f1' },
      destinationLabel: 'End point',
    };

    const summary = buildRouteSheetSummary(state);
    expect(summary.needsReset).toBe(true);
    expect(summary.walkDistance).toBe('NO ROUTE');
    expect(summary.locationLine).toMatch(/no route/i);
  });
});
