import { describe, expect, it } from 'vitest';

import { renderVenueSelectScreen } from './venue-select-screen';

const emptyListState = {
  venueSearchQuery: '',
  selectedVenueId: null,
  selectedGateId: null,
  selectedFloorId: null,
  forumFloors: [],
  forumVenues: [],
  forumSections: [],
  authLoading: false,
  authFieldErrors: {},
  locationPermission: 'undecided' as const,
  userLocation: null,
};

describe('renderVenueSelectScreen', () => {
  it('keeps venue-select hooks used by ui-root-events', () => {
    const html = renderVenueSelectScreen({
      ...emptyListState,
      selectedVenueId: '1',
      selectedGateId: '2',
      selectedFloorId: '10',
      forumFloors: [{ id: 10, venue: 1, name: 'Ground floor', order: 0 }],
      forumVenues: [{ id: 1, name: 'Riverside', location: 'Lagos' }],
      forumSections: [
        { id: 2, venue: 1, floor: 10, name: 'North', code: 'N1', is_active: true },
      ],
    });
    expect(html).toContain('id="venue-select-back-btn"');
    // Inline SVG — avoids a full rebuild reloading /auth/back-chevron.svg.
    expect(html).toContain('class="auth-back-icon"');
    expect(html).not.toContain('/auth/back-chevron.svg');
    expect(html).toContain('id="venue-select-search-input"');
    expect(html).toContain('id="venue-select-venues-heading"');
    expect(html).toContain('id="venue-select-gates-heading"');
    expect(html).toContain('id="venue-select-enter-btn"');
    // ui-root restores scroll on this host across full rebuilds (gate tap, live location).
    expect(html).toContain('class="venue-select-body"');
    expect(html).toContain('data-venue-id="1"');
    expect(html).toContain('data-gate-id="2"');
    expect(html).toContain('Where are you today?');
  });

  it('disables Enter venue until a venue and gate are selected', () => {
    const html = renderVenueSelectScreen({
      ...emptyListState,
      forumVenues: [{ id: 1, name: 'Riverside', location: 'Lagos' }],
    });
    expect(html).toMatch(
      /id="venue-select-enter-btn"[\s\S]*disabled/,
    );
    expect(html).not.toContain('id="venue-select-gates-heading"');
  });

  it('shows empty copy when the catalog has no venues', () => {
    const html = renderVenueSelectScreen(emptyListState);
    expect(html).toContain('No venues available right now.');
    expect(html).not.toContain('data-venue-id=');
  });

  it('shows empty copy when search matches nothing', () => {
    const html = renderVenueSelectScreen({
      ...emptyListState,
      venueSearchQuery: 'airport',
      forumVenues: [{ id: 1, name: 'Riverside', location: 'Lagos' }],
    });
    expect(html).toContain('No venues match your search.');
    expect(html).not.toContain('data-venue-id="1"');
  });

  it('shows empty copy when the selected venue has no floors', () => {
    const html = renderVenueSelectScreen({
      ...emptyListState,
      selectedVenueId: '1',
      forumVenues: [{ id: 1, name: 'Riverside', location: 'Lagos' }],
    });
    expect(html).toContain('No floors for this venue.');
  });

  it('escapes search, names, and form errors that look like HTML', () => {
    const html = renderVenueSelectScreen({
      ...emptyListState,
      venueSearchQuery: '"quoted"',
      selectedVenueId: '1',
      selectedGateId: '2',
      selectedFloorId: '10',
      forumFloors: [{ id: 10, venue: 1, name: 'Ground floor', order: 0 }],
      forumVenues: [
        {
          id: 1,
          name: '<b>Riverside</b> "quoted"',
          location: '<i>Lagos</i>',
        },
      ],
      forumSections: [
        {
          id: 2,
          venue: 1,
          floor: 10,
          name: '<em>North</em>',
          code: '<N>',
          is_active: true,
        },
      ],
      authFieldErrors: { _form: '<img src=x>' },
    });
    expect(html).toContain('value="&quot;quoted&quot;"');
    expect(html).toContain('&lt;b&gt;Riverside&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;Lagos&lt;/i&gt;');
    expect(html).toContain('&lt;em&gt;North&lt;/em&gt;');
    expect(html).toContain('&lt;N&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<b>Riverside</b>');
    expect(html).not.toContain('<i>Lagos</i>');
    expect(html).not.toContain('<em>North</em>');
    expect(html).not.toContain('<img src=x>');
  });
});

it('expands floors under their venue and sections under their floor before the next choices', () => {
  const state = {
    ...emptyListState,
    selectedVenueId: '1',
    selectedFloorId: '10',
    forumVenues: [
      { id: 1, name: 'Zulu', location: 'Lagos' },
      { id: 2, name: 'Alpha', location: 'Lagos' },
    ],
    forumFloors: [
      { id: 10, venue: 1, name: 'Ground', order: 0 },
      { id: 11, venue: 1, name: 'Upper', order: 1 },
    ],
    forumSections: [{ id: 20, venue: 1, floor: 10, name: 'North', code: 'N', is_active: true }],
  };
  const html = renderVenueSelectScreen(state);
  const hooks = ['data-venue-id="1"', 'data-floor-id="10"', 'data-gate-id="20"', 'data-floor-id="11"', 'data-venue-id="2"'];
  for (let i = 1; i < hooks.length; i++) {
    expect(html.indexOf(hooks[i])).toBeGreaterThan(html.indexOf(hooks[i - 1]));
  }
  const noFloor = renderVenueSelectScreen({ ...state, selectedFloorId: null });
  expect(noFloor).toContain('data-floor-id="10"');
  expect(noFloor).not.toContain('data-gate-id=');
  expect(noFloor).not.toContain('Select your section');
  const otherVenue = renderVenueSelectScreen({ ...state, selectedVenueId: '2', selectedFloorId: null });
  expect(otherVenue).not.toContain('data-floor-id="10"');
  expect(otherVenue).not.toContain('data-gate-id=');
});
