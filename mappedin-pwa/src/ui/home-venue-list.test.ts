import { describe, expect, it } from 'vitest';

import type { RecentVenueVisit } from '../home/domain/entities';
import {
  renderHomeVenueCard,
  renderHomeVenueSections,
} from './home-venue-list';

const stadium: RecentVenueVisit = {
  id: 'venue-la-stadium',
  name: 'LA Stadium',
  visitedLabel: '3 days ago',
  postCount: 86,
  icon: 'pin',
};

const riverside: RecentVenueVisit = {
  id: '3',
  name: 'Riverside',
  visitedLabel: 'Lagos',
  postCount: 0,
  icon: 'pin',
};

describe('renderHomeVenueCard', () => {
  it('keeps the home venue tap hook and post-count meta', () => {
    const html = renderHomeVenueCard(stadium);
    expect(html).toContain('data-home-venue-id="venue-la-stadium"');
    expect(html).toContain('LA Stadium');
    expect(html).toContain('3 days ago · 86 post(s)');
  });

  it('omits a zero post count from other-venue meta', () => {
    const html = renderHomeVenueCard(riverside);
    expect(html).toContain('Lagos');
    expect(html).not.toContain('0 post(s)');
  });

  it('escapes venue names that look like HTML', () => {
    const html = renderHomeVenueCard({
      ...stadium,
      id: '1',
      name: '<b>hi</b>',
    });
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).not.toContain('<b>hi</b>');
  });
});

describe('renderHomeVenueSections', () => {
  it('shows an empty recent list when nothing has been visited', () => {
    const html = renderHomeVenueSections({
      recentlyVisited: [],
      otherVenues: [riverside],
    });
    expect(html).toContain('No recent venues yet');
    expect(html).toContain('Other venues');
    expect(html).toContain('data-home-venue-id="3"');
  });

  it('hides recent and other sections when a search has no matches', () => {
    const html = renderHomeVenueSections({
      recentlyVisited: [],
      otherVenues: [],
      searching: true,
    });
    expect(html).toContain('No matching venues');
    expect(html).not.toContain('Recently visited');
    expect(html).not.toContain('Other venues');
  });
});
