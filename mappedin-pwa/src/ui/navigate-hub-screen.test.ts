import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import { renderNavigateHubScreen } from './navigate-hub-screen';

describe('renderNavigateHubScreen', () => {
  it('shows the first-visit AR route prompt from the navigate Try AR action', () => {
    const state = initialAppState();
    state.selectedVenueId = '1';
    state.selectedGateId = '2';
    state.forumVenues = [{ id: 1, name: 'LA Stadium', location: 'Los Angeles' }];
    state.forumSections = [
      { id: 2, venue: 1, name: 'North Stand', code: 'N', is_active: true },
    ];
    state.arRoutePromptOpen = true;

    const html = renderNavigateHubScreen(state);

    expect(html).toContain('id="navigate-ar-btn"');
    expect(html).toContain('Set a route for AR');
    expect(html).toContain('id="product-tour-dont-show"');
    expect(html).toContain("Don't show this again");
    expect(html).toContain('id="first-visit-ar-open-map-btn"');
    expect(html).toContain('id="first-visit-ar-prompt-dismiss"');
  });

  it('shows venue choices for the navigate Try AR action', () => {
    const state = initialAppState();
    state.navigateDiscoverVenuePickerOpen = true;
    state.navigateVenuePickerMode = 'ar';
    state.homeContent = {
      recentlyVisited: [
        {
          id: '1',
          name: 'LA Stadium',
          visitedLabel: 'Los Angeles',
          postCount: 0,
          icon: 'pin',
        },
      ],
      otherVenues: [],
      stats: { venues: 1, upvotesLabel: '0', posts: 0 },
    };

    const html = renderNavigateHubScreen(state);

    expect(html).toContain('Which venue?');
    expect(html).toContain('data-navigate-ar-venue-id="1"');
    expect(html).not.toContain('data-navigate-expect-venue-id="1"');
  });
});
