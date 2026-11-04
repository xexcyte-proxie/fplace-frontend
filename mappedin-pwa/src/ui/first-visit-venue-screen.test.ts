import { initialAppState } from '../types';
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
    expect(content.fansHereLabel).toBe('0 fan(s) here right now');
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
    expect(html).toContain('id="first-visit-discover-btn"');
    expect(html).toContain('id="first-visit-ar-btn"');
    expect(html).toContain('Live from the crowd');
    expect(html).toContain('data-tour-id="home-hero"');
    expect(html).toContain('View category updates');
    expect(html).toContain('No venue updates yet for this category.');
    expect(html).not.toContain('Recently visited');
    expect(html).not.toContain('Other venues');
    expect(html).not.toContain('data-home-venue-id="1"');
    expect(html).toContain('class="first-visit-fans"');
    expect(html).not.toContain('SwiftOtter_21');
    expect(html).not.toContain('HungryHawk88');
    expect(html).not.toContain('1,204');
    expect(html).not.toContain('/home/location.png');
    expect(html).not.toContain('/home/camera.png');
  });

  it('offers the venue catalog with the current venue selected and escapes names', () => {
    const html = renderFirstVisitVenueScreen(firstVisitScreenState({
      forumVenues: [
        { id: 1, name: 'LA Stadium', location: 'Los Angeles' },
        { id: 3, name: 'Arts & Events', location: 'Lagos' },
      ],
    }));
    expect(html).toContain('id="first-visit-venue-select" aria-label="Change venue"');
    expect(html).toContain('<option value="1" selected>LA Stadium</option>');
    expect(html).toContain('<option value="3">Arts &amp; Events</option>');
  });

  it('does not render venue lists on first-visit home', () => {
    const html = renderFirstVisitVenueScreen(firstVisitScreenState());
    expect(html).not.toContain('Recently visited');
    expect(html).not.toContain('Other venues');
  });

  it('keeps the live fan count visible even when there are no feed posts', () => {
    const html = renderFirstVisitVenueScreen(firstVisitScreenState({
      venueOnlineCount: 2,
      venueFeedPosts: [],
      venueFeedLoading: true,
    }));
    expect(html).toContain('2 fan(s) here right now');
    expect(html).toContain('class="first-visit-fans"');
  });

  it('overlays the feed while posts load', () => {
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

it('disables venue selection and actions while switching, then allows recovery after failure', () => {
  const state = initialAppState();
  state.selectedVenueId = '1';
  state.forumVenues = [{ id: 1, name: 'Venue', location: 'Lagos' }];
  state.venueSwitchStatus = 'loading';
  state.venueSwitchMessage = 'Opening Venue…';
  let html = renderFirstVisitVenueScreen(state);
  expect(html).toContain('aria-label="Change venue" disabled aria-busy="true"');
  expect(html).toContain('Opening Venue…');
  expect(html).toContain('inert aria-busy="true"');
  state.venueSwitchStatus = 'error';
  state.venueSwitchMessage = 'Please choose another venue.';
  html = renderFirstVisitVenueScreen(state);
  expect(html).not.toContain('Please choose another venue.');
  expect(html).not.toContain('first-visit-venue-retry');
  expect(html).not.toContain('aria-label="Change venue" disabled');
  expect(html).not.toContain('inert aria-busy="true"');
});
