import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import {
  classifyUiStateChange,
  isLiveNavigationTelemetryOnlyChange,
  myLocationFabPresentation,
} from './live-navigation-ui';

describe('isLiveNavigationTelemetryOnlyChange', () => {
  it('is true when only live remaining distance changes', () => {
    const previous = initialAppState();
    const next = {
      ...previous,
      routeTraveledMeters: 12,
      routeRemainingMeters: 88,
    };

    expect(isLiveNavigationTelemetryOnlyChange(previous, next)).toBe(true);
  });

  it('is true when only blue-dot tracking flags change', () => {
    const previous = initialAppState();
    const next = {
      ...previous,
      blueDotStatus: 'active' as const,
      blueDotFollowing: true,
    };

    expect(isLiveNavigationTelemetryOnlyChange(previous, next)).toBe(true);
  });

  it('is false when chrome-relevant state also changes', () => {
    const previous = initialAppState();
    const next = {
      ...previous,
      routeRemainingMeters: 40,
      routeSimulating: true,
    };

    expect(isLiveNavigationTelemetryOnlyChange(previous, next)).toBe(false);
  });

  it('is false when the same snapshot is compared', () => {
    const state = initialAppState();
    expect(isLiveNavigationTelemetryOnlyChange(state, state)).toBe(false);
  });
});

describe('classifyUiStateChange', () => {
  it('patches toasts without a full chrome rebuild', () => {
    const previous = initialAppState();
    expect(
      classifyUiStateChange(previous, { ...previous, toast: 'You are here.' }),
    ).toBe('toast');
  });

  it('patches search results without a full chrome rebuild', () => {
    const previous = initialAppState();
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        searchQuery: 'cafe',
        isSearching: true,
      }),
    ).toBe('search');
  });

  it('skips heatmap-only updates while the map tab is showing', () => {
    const previous = initialAppState();
    previous.activeTab = 'map';
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        sectionHeatmapActive: true,
      }),
    ).toBe('heatmap-map');
  });
});

describe('myLocationFabPresentation', () => {
  it('labels the control as following while locked to the blue dot', () => {
    expect(
      myLocationFabPresentation({
        blueDotStatus: 'active',
        blueDotFollowing: true,
      }),
    ).toEqual({
      trackingActive: true,
      following: true,
      label: 'Following your location',
    });
  });
});
