import { beforeEach, describe, expect, it } from 'vitest';

import {
  countDistinctFans,
  formatFansHereLabel,
  resolveFirstVisitCategory,
  resolveHomeExperience,
} from '../home/domain/entities';
import {
  buildFirstVisitVenueHomeContent,
  buildFirstVisitVenueHomeViewModel,
} from '../home/presentation/first-visit-venue-home-data';
import { VenueVisitLocalDatasource } from '../home/data/datasources/venue-visit-local-datasource';
import { renderFirstVisitVenueScreen } from './first-visit-venue-screen';

/** Minimal localStorage stub for Node/vitest (no happy-dom). */
function installMemoryLocalStorage(): void {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  });
}

describe('first-visit venue home', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('formats fans label and category chips', () => {
    expect(formatFansHereLabel(1204)).toBe('1,204 fans here right now');
    expect(countDistinctFans([{ authorId: 1 }, { authorId: 1 }, { authorId: 2 }])).toBe(
      2,
    );
    expect(resolveFirstVisitCategory('crowds')).toEqual({
      label: 'CROWDS',
      tone: 'crowds',
    });
    expect(resolveFirstVisitCategory('food')).toEqual({
      label: 'FOOD',
      tone: 'food',
    });
  });

  it('falls back to demo posts when the feed is empty', () => {
    const content = buildFirstVisitVenueHomeContent({
      venueName: 'LA Stadium',
      sectionLabel: 'North Stand, Level 1',
      posts: [],
    });
    expect(content.venueName).toBe('LA Stadium');
    expect(content.sectionLabel).toBe('North Stand, Level 1');
    expect(content.fansHereLabel).toContain('1,204');
    expect(content.previewPosts).toHaveLength(2);
    expect(content.previewPosts[0]?.author).toBe('SwiftOtter_21');
  });

  it('tracks first vs returning venue visits', () => {
    const ds = new VenueVisitLocalDatasource();
    expect(ds.has('12')).toBe(false);
    ds.mark('12');
    expect(ds.has('12')).toBe(true);
    ds.mark('12');
    expect(ds.list()).toEqual(['12']);
  });

  it('sends signed-in returners to Recently visited, not first-visit', () => {
    expect(resolveHomeExperience(null, false)).toBe('returning');
    expect(resolveHomeExperience('12', false)).toBe('first-visit');
    expect(resolveHomeExperience('12', true)).toBe('returning');
  });

  it('renders first-visit markup hooks', () => {
    const content = buildFirstVisitVenueHomeContent({
      venueName: 'LA Stadium',
      sectionLabel: 'North Stand, Level 1',
      posts: [],
    });
    const view = buildFirstVisitVenueHomeViewModel({
      displayName: 'RowdyGull_47',
      content,
    });
    expect(view.greeting).toBe('Welcome back, RowdyGull_47');

    const html = renderFirstVisitVenueScreen({
      authUser: {
        id: 1,
        email: 'fan@email.com',
        pseudo_name: 'RowdyGull_47',
        is_email_verified: true,
        created_at: '',
        updated_at: '',
      },
      pseudoNameDraft: '',
      guestId: null,
      selectedVenueId: '1',
      selectedGateId: '2',
      forumVenues: [
        { id: 1, name: 'LA Stadium', location: 'Los Angeles' },
      ],
      forumSections: [
        {
          id: 2,
          venue: 1,
          name: 'North Stand, Level 1',
          code: 'N1',
          is_active: true,
        },
      ],
      venueFeedPosts: [],
      arRoutePromptOpen: false,
    });

    expect(html).toContain('Welcome back, RowdyGull_47');
    expect(html).toContain('LA Stadium');
    expect(html).toContain('North Stand, Level 1');
    expect(html).toContain('Discover');
    expect(html).toContain('Try AR');
    expect(html).toContain('Live from the crowd');
    expect(html).toContain('id="first-visit-discover-btn"');
    expect(html).toContain('id="first-visit-ar-btn"');
    expect(html).toContain('See all posts');
  });

  it('renders the Try AR route prompt on the same screen', () => {
    const html = renderFirstVisitVenueScreen({
      authUser: {
        id: 1,
        email: 'fan@email.com',
        pseudo_name: 'RowdyGull_47',
        is_email_verified: true,
        created_at: '',
        updated_at: '',
      },
      pseudoNameDraft: '',
      guestId: null,
      selectedVenueId: '1',
      selectedGateId: '2',
      forumVenues: [{ id: 1, name: 'LA Stadium', location: 'Los Angeles' }],
      forumSections: [
        {
          id: 2,
          venue: 1,
          name: 'North Stand, Level 1',
          code: 'N1',
          is_active: true,
        },
      ],
      venueFeedPosts: [],
      arRoutePromptOpen: true,
    });

    expect(html).toContain('Set a route for AR');
    expect(html).toContain('id="first-visit-ar-open-map-btn"');
    expect(html).toContain('Open map');
    expect(html).toContain('id="first-visit-ar-prompt-dismiss"');
  });
});
