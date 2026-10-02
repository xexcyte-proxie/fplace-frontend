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

const signedInUser = {
  id: 1,
  email: 'fan@email.com',
  pseudo_name: 'RowdyGull_47',
  is_email_verified: true,
  created_at: '',
  updated_at: '',
} as const;

function firstVisitScreenState(
  overrides: Partial<Parameters<typeof renderFirstVisitVenueScreen>[0]> = {},
): Parameters<typeof renderFirstVisitVenueScreen>[0] {
  return {
    authUser: signedInUser,
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
    venueFeedLoading: false,
    upvotedPostIds: [],
    arRoutePromptOpen: false,
    arNotAtVenuePromptOpen: false,
    homeContent: {
      recentlyVisited: [
        {
          id: '1',
          name: 'LA Stadium',
          visitedLabel: 'Los Angeles',
          postCount: 0,
          icon: 'pin',
        },
      ],
      otherVenues: [
        {
          id: '3',
          name: 'Riverside',
          visitedLabel: 'Lagos',
          postCount: 0,
          icon: 'pin',
        },
        {
          id: '8',
          name: 'LTV 8',
          visitedLabel: 'Agidigbi',
          postCount: 0,
          icon: 'pin',
        },
      ],
      stats: { venues: 2, upvotesLabel: '0', posts: 0 },
    },
    ...overrides,
  };
}

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
    expect(formatFansHereLabel(1204)).toBe('1,204 fan(s) here right now');
    expect(formatFansHereLabel(1)).toBe('1 fan(s) here right now');
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

  it('keeps an empty crowd preview when the feed has no posts', () => {
    const content = buildFirstVisitVenueHomeContent({
      venueName: 'LA Stadium',
      sectionLabel: 'North Stand, Level 1',
      posts: [],
    });
    expect(content.venueName).toBe('LA Stadium');
    expect(content.sectionLabel).toBe('North Stand, Level 1');
    expect(content.fansHereLabel).toBe('');
    expect(content.previewPosts).toEqual([]);
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

    const html = renderFirstVisitVenueScreen(firstVisitScreenState());

    expect(html).toContain('Welcome back, RowdyGull_47');
    expect(html).toContain('LA Stadium');
    expect(html).toContain('North Stand, Level 1');
    expect(html).toContain('Discover');
    expect(html).toContain('Try AR');
    expect(html).toContain('What to expect');
    expect(html).toContain('id="first-visit-discover-btn"');
    expect(html).toContain('id="first-visit-ar-btn"');
    expect(html).toContain('data-tour-id="home-hero"');
    expect(html).toContain('View category updates');
    expect(html).toContain('No venue updates yet for this category.');
    expect(html).toContain('Recently visited');
    expect(html).toContain('Other venues');
    expect(html).toContain('data-home-venue-id="1"');
    expect(html).toContain('data-home-venue-id="3"');
    expect(html).toContain('data-home-venue-id="8"');
    expect(html.indexOf('Recently visited')).toBeLessThan(html.indexOf('Other venues'));
    expect(html).not.toContain('class="first-visit-fans"');
    expect(html).not.toContain('SwiftOtter_21');
    expect(html).not.toContain('HungryHawk88');
    expect(html).not.toContain('1,204');
    expect(html).toContain('<svg');
    expect(html).toContain('currentColor');
    expect(html).not.toContain('/home/location.png');
    expect(html).not.toContain('/home/camera.png');
  });

  it('omits venue lists until home catalog content has loaded', () => {
    const html = renderFirstVisitVenueScreen(
      firstVisitScreenState({ homeContent: null }),
    );
    expect(html).not.toContain('Recently visited');
    expect(html).not.toContain('Other venues');
  });

  it('renders the Try AR route prompt on the same screen', () => {
    const html = renderFirstVisitVenueScreen(
      firstVisitScreenState({ arRoutePromptOpen: true }),
    );

    expect(html).toContain('Set a route for AR');
    expect(html).toContain('id="first-visit-ar-open-map-btn"');
    expect(html).toContain('Open map');
    expect(html).toContain('id="first-visit-ar-prompt-dismiss"');
  });

  it('tells the user they are not at the location when Try AR is blocked', () => {
    const html = renderFirstVisitVenueScreen(
      firstVisitScreenState({ arNotAtVenuePromptOpen: true }),
    );

    expect(html).toContain("You're not at the location");
    expect(html).toContain("You're not at LA Stadium. Head there to try AR navigation.");
    expect(html).toContain('id="first-visit-ar-away-dismiss-btn"');
    expect(html).toContain('Got it');
    expect(html).not.toContain('Set a route for AR');
  });

  it('keeps action chrome visible and overlays the feed while posts load', () => {
    const html = renderFirstVisitVenueScreen(
      firstVisitScreenState({ venueFeedLoading: true, venueFeedPosts: [] }),
    );

    expect(html).toContain('id="first-visit-discover-btn"');
    expect(html).toContain('id="first-visit-ar-btn"');
    expect(html).toContain('Discover');
    expect(html).toContain('Try AR');
    expect(html).toContain('screen-loading-overlay');
    expect(html).toContain('aria-label="Loading posts"');
    expect(html).not.toContain('SwiftOtter_21');
    expect(html).not.toContain('class="first-visit-post"');
    expect(html).not.toContain('No venue updates yet for this category.');
  });

  it('does not overlay a feed that already has posts', () => {
    const html = renderFirstVisitVenueScreen(
      firstVisitScreenState({
        venueFeedLoading: true,
        venueFeedPosts: [
          {
            id: 'p1',
            author: 'LiveFan',
            authorId: 9,
            initials: 'LF',
            avatarColor: '#3b5998',
            location: 'North Stand',
            locationId: '2',
            timeAgo: '1m',
            feedType: 'crowds',
            categoryId: '1',
            content: 'Gate C is moving.',
            upvotes: 4,
            comments: 0,
          },
        ],
      }),
    );

    expect(html).not.toContain('screen-loading-overlay');
    expect(html).toContain('LiveFan');
    expect(html).toContain('Gate C is moving.');
    expect(html).toContain('data-upvote-id="p1"');
    expect(html).toContain(
      'class="first-visit-post-upvote-count venue-feed-upvote-count">4</span>',
    );
    expect(html).toContain('data-comments-id="p1"');
    expect(html).toContain('class="first-visit-fans"');
    expect(html).toContain('1 fan(s) here right now');
  });

  it('does not attach post action controls to location conversation rows', () => {
    const html = renderFirstVisitVenueScreen(
      firstVisitScreenState({
        venueFeedPosts: [
          {
            id: '9',
            kind: 'conversation',
            author: 'ChatFan',
            authorId: 4,
            initials: 'CF',
            avatarColor: '#3b5998',
            location: 'North Stand',
            locationId: '2',
            timeAgo: '1m',
            feedType: 'vibe',
            categoryId: '1',
            content: 'Anyone at the rail?',
            upvotes: 0,
            comments: 0,
          },
        ],
      }),
    );

    expect(html).toContain('Anyone at the rail?');
    expect(html).not.toContain('data-upvote-id');
    expect(html).not.toContain('data-comments-id');
  });

  it('keeps the see-all posts hook used by ui-root-events', () => {
    const html = renderFirstVisitVenueScreen(firstVisitScreenState());
    expect(html).toContain('id="first-visit-see-all-btn"');
    expect(html).toContain('aria-label="Venue home"');
  });

  it('falls back to Entry zone and a guest label without a signed-in user', () => {
    const html = renderFirstVisitVenueScreen(
      firstVisitScreenState({
        authUser: null,
        guestId: 'abcdef123456',
        selectedGateId: null,
        forumSections: [],
      }),
    );
    expect(html).toContain('Welcome back, Guest_abcdef');
    expect(html).toContain('Entry zone');
  });

  it('escapes crowd post content that looks like HTML', () => {
    const html = renderFirstVisitVenueScreen(
      firstVisitScreenState({
        venueFeedPosts: [
          {
            id: 'p1',
            author: 'LiveFan',
            authorId: 9,
            initials: 'LF',
            avatarColor: '#3b5998',
            location: 'North Stand',
            locationId: '2',
            timeAgo: '1m',
            feedType: 'crowds',
            categoryId: '1',
            content: '<b>hi</b>',
            upvotes: 4,
            comments: 0,
          },
        ],
      }),
    );
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).not.toContain('<b>hi</b>');
    expect(html).toContain('data-upvote-id="p1"');
  });
});
