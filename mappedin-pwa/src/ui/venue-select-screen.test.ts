import { describe, expect, it } from 'vitest';

import { renderVenueSelectScreen } from './venue-select-screen';

const emptyListState = {
  venueSearchQuery: '',
  selectedVenueId: null,
  selectedGateId: null,
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
      forumVenues: [{ id: 1, name: 'Riverside', location: 'Lagos' }],
      forumSections: [
        { id: 2, venue: 1, name: 'North', code: 'N1', is_active: true },
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

  it('shows empty copy when the selected venue has no gates', () => {
    const html = renderVenueSelectScreen({
      ...emptyListState,
      selectedVenueId: '1',
      forumVenues: [{ id: 1, name: 'Riverside', location: 'Lagos' }],
    });
    expect(html).toContain('No entry gates for this venue.');
  });

  it('escapes search, names, and form errors that look like HTML', () => {
    const html = renderVenueSelectScreen({
      ...emptyListState,
      venueSearchQuery: '"quoted"',
      selectedVenueId: '1',
      selectedGateId: '2',
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
