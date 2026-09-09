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

  it('rebuilds venue select when live user location changes', () => {
    const previous = initialAppState();
    previous.authStep = 'venue-select';
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        userLocation: { latitude: 43.64, longitude: -79.38, accuracy: 8 },
      }),
    ).toBe('full');
  });

  it('patches search distances when the live user origin moves', () => {
    const previous = initialAppState();
    previous.searchQuery = 'cafe';
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        userLocation: { latitude: 43.64, longitude: -79.38, accuracy: 8 },
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

  it('does not rebuild chrome when the first 2D trial flag is recorded', () => {
    const previous = initialAppState();
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        guestHasTried2dView: true,
      }),
    ).toBe('silent');
  });

  it('does not rebuild home when the map becomes ready in the background', () => {
    const previous = {
      ...initialAppState(),
      startupReady: true,
      onboardingComplete: true,
      activeTab: 'map' as const,
      navigateView: 'home' as const,
      mapStatus: 'loading' as const,
    };
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        mapStatus: 'ready' as const,
        loadingProgress: 100,
      }),
    ).toBe('silent');
  });

  it('does not rebuild onboarding when the map loads in the background', () => {
    const previous = {
      ...initialAppState(),
      startupReady: true,
      mapStatus: 'loading' as const,
      loadingProgress: 32,
    };
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        loadingProgress: 55,
        loadingMessage: 'Starting 3D map…',
      }),
    ).toBe('silent');
  });

  it('rebuilds the indoor map canvas when Mappedin becomes ready', () => {
    const previous = {
      ...initialAppState(),
      startupReady: true,
      onboardingComplete: true,
      activeTab: 'map' as const,
      navigateView: 'map' as const,
      mapStatus: 'loading' as const,
    };
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        mapStatus: 'ready' as const,
        loadingProgress: 100,
      }),
    ).toBe('full');
  });

  it('rebuilds map-language settings when map languages finish loading', () => {
    const previous = {
      ...initialAppState(),
      startupReady: true,
      onboardingComplete: true,
      activeTab: 'profile' as const,
      profileView: 'language' as const,
      mapStatus: 'loading' as const,
    };
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        mapStatus: 'ready' as const,
        mapLanguages: [{ code: 'en', name: 'English' }],
        mapLanguageCode: 'en',
        mapLanguageName: 'English',
      }),
    ).toBe('full');
  });

  it('rebuilds the social tab when live feed posts or heatmap status change', () => {
    const previous = initialAppState();
    previous.activeTab = 'social';
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        venueLiveStatus: 'connected',
      }),
    ).toBe('full');
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        venueFeedPosts: [
          {
            id: '1',
            author: 'Alex',
            authorId: 2,
            initials: 'AL',
            avatarColor: '#000',
            location: 'North',
            locationId: '4',
            timeAgo: 'just now',
            feedType: 'fan-vibe',
            categoryId: '1',
            content: 'Go',
            upvotes: 0,
            comments: 0,
          },
        ],
      }),
    ).toBe('full');
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
