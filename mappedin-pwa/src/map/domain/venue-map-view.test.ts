import { describe, expect, it } from 'vitest';

import {
  clampVenueZoom,
  isWorldScaleZoom,
  SHOW_VENUE_MAP_OPTIONS,
  VENUE_CAMERA_INTERACTIONS,
  VENUE_MAP_MIN_ZOOM,
} from './venue-map-view';

describe('venue map view', () => {
  it('disables Mappedin outdoor/world tiles', () => {
    expect(SHOW_VENUE_MAP_OPTIONS.outdoorView.enabled).toBe(false);
  });

  it('keeps pan and zoom but disables tilt/rotate for 2D dragging', () => {
    expect(VENUE_CAMERA_INTERACTIONS).toEqual({
      pan: true,
      zoom: true,
      bearingAndPitch: false,
    });
  });

  it('treats globe-scale zoom as a world view', () => {
    expect(isWorldScaleZoom(2)).toBe(true);
    expect(isWorldScaleZoom(12)).toBe(true);
    expect(isWorldScaleZoom(VENUE_MAP_MIN_ZOOM)).toBe(false);
    expect(isWorldScaleZoom(19)).toBe(false);
  });

  it('will not zoom out past the venue', () => {
    expect(clampVenueZoom(3, 0, 22)).toBe(VENUE_MAP_MIN_ZOOM);
    expect(clampVenueZoom(18, 0, 22)).toBe(18);
    expect(clampVenueZoom(40, 0, 22)).toBe(22);
  });
});
