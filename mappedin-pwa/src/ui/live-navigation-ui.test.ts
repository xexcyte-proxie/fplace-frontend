import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import {
  classifyUiStateChange,
  isLiveNavigationTelemetryOnlyChange,
  myLocationFabPresentation,
  renderToastHtml,
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

  it('patches venue-select gate taps without rebuilding chrome', () => {
    const previous = initialAppState();
    previous.authStep = 'venue-select';
    previous.selectedVenueId = '1';
    previous.selectedGateId = null;
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        selectedGateId: '2',
      }),
    ).toBe('venue-select-gate');
  });

  it('still rebuilds when venue selection changes', () => {
    const previous = initialAppState();
    previous.authStep = 'venue-select';
    previous.selectedVenueId = '1';
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        selectedVenueId: '2',
        selectedGateId: null,
        forumSections: [],
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

  it('rebuilds the indoor map canvas when a venue switch starts loading', () => {
    const previous = {
      ...initialAppState(),
      startupReady: true,
      onboardingComplete: true,
      activeTab: 'map' as const,
      navigateView: 'map' as const,
      mapStatus: 'ready' as const,
    };
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        mapStatus: 'loading' as const,
        loadingProgress: 12,
        loadingMessage: 'Loading map…',
      }),
    ).toBe('full');
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

  it('patches the social feed in place when live posts or status change', () => {
    const previous = initialAppState();
    previous.activeTab = 'social';
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        venueLiveStatus: 'connected',
      }),
    ).toBe('social-feed');
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
    ).toBe('social-feed');
  });

  it('does not rebuild map chrome for background feed or location live status', () => {
    const previous = initialAppState();
    previous.activeTab = 'map';
    previous.navigateView = 'map';
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
    ).toBe('silent');
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        locationLiveStatus: 'connected',
      }),
    ).toBe('heatmap-map');
  });

  it('patches home venue search without rebuilding chrome', () => {
    const previous = {
      ...initialAppState(),
      activeTab: 'map' as const,
      navigateView: 'home' as const,
    };
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        homeVenueSearchQuery: 'stad',
      }),
    ).toBe('home-search');
  });

  it('patches the notify badge when unread changes on the social feed', () => {
    const previous = initialAppState();
    previous.activeTab = 'social';
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        notificationsUnreadCount: 2,
      }),
    ).toBe('notify-badge');
  });

  it('keeps the notifications inbox on a full rebuild when it is open', () => {
    const previous = initialAppState();
    previous.activeTab = 'social';
    previous.notificationsOpen = true;
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        notificationsUnreadCount: 2,
      }),
    ).toBe('full');
  });

  it('patches live guidance when the route leg or instructions change', () => {
    const previous = initialAppState();
    expect(
      classifyUiStateChange(previous, {
        ...previous,
        currentLegIndex: 1,
        routeInstructions: 'Turn right for 20 meters',
      }),
    ).toBe('live');
  });

  it('keeps comments overlays on a full rebuild for feed updates', () => {
    const previous = initialAppState();
    previous.activeTab = 'social';
    previous.postCommentsOpen = true;
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
            comments: 1,
          },
        ],
      }),
    ).toBe('full');
  });
});

describe('myLocationFabPresentation', () => {
  const atVenue = {
    locationPermission: 'granted' as const,
    userLocation: {
      latitude: 6.5244,
      longitude: 3.3792,
      accuracy: 12,
    },
    selectedVenueId: '1',
    forumVenues: [
      {
        id: 1,
        name: 'LTV-8',
        location: 'Lagos',
        latitude: 6.5244,
        longitude: 3.3792,
      },
    ],
  };

  const away = {
    ...atVenue,
    userLocation: {
      latitude: 6.7,
      longitude: 3.6,
      accuracy: 12,
    },
  };

  it('labels the control as following while locked to the blue dot', () => {
    expect(
      myLocationFabPresentation({
        ...atVenue,
        blueDotStatus: 'active',
        blueDotFollowing: true,
      }),
    ).toEqual({
      trackingActive: true,
      following: true,
      enabled: true,
      label: 'Following your location',
    });
  });

  it('labels the control as live when tracking without follow', () => {
    expect(
      myLocationFabPresentation({
        ...atVenue,
        blueDotStatus: 'active',
        blueDotFollowing: false,
      }),
    ).toEqual({
      trackingActive: true,
      following: false,
      enabled: true,
      label: 'Live location active',
    });
  });

  it('labels the control as My location when tracking is off', () => {
    expect(
      myLocationFabPresentation({
        ...atVenue,
        blueDotStatus: 'off',
        blueDotFollowing: false,
      }),
    ).toEqual({
      trackingActive: false,
      following: false,
      enabled: true,
      label: 'My location',
    });
  });

  it('disables the control when the user is away from the venue', () => {
    expect(
      myLocationFabPresentation({
        ...away,
        blueDotStatus: 'active',
        blueDotFollowing: true,
      }),
    ).toEqual({
      trackingActive: false,
      following: false,
      enabled: false,
      label: "You're not at this venue",
    });
  });
});

describe('renderToastHtml', () => {
  it('keeps toast status markup and the map-pin icon', () => {
    const html = renderToastHtml('You are here.');
    expect(html).toContain('class="toast"');
    expect(html).toContain('role="status"');
    expect(html).toContain('class="toast-message"');
    expect(html).toContain('You are here.');
    expect(html).toContain('src="/onboarding/map-pin-logo.svg"');
  });

  it('escapes toast copy that looks like HTML', () => {
    const html = renderToastHtml('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });
});
