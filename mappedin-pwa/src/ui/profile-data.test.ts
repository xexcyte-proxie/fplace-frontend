import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import {
  buildProfileViewModel,
  mapProfileRecentPosts,
} from './profile-data';

describe('buildProfileViewModel', () => {
  it('maps profile stat and recent posts from the user payload', () => {
    const state = initialAppState();
    state.authUser = {
      id: 1,
      email: 'fan@email.com',
      pseudo_name: 'RowdyGull_47',
      is_email_verified: true,
      interests: ['Live music'],
      stat: { posts_count: 86, upvotes_count: 3200, venues_count: 14 },
      recent_posts: [
        {
          id: 21,
          content: 'That goal just shook the whole north stand.',
          section: 8,
          venue: 1,
          upvotes_count: 248,
          created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        },
      ],
      created_at: '',
      updated_at: '',
    };
    state.forumVenues = [{ id: 1, name: 'LA Stadium', location: 'LA' }];
    state.forumSections = [
      { id: 8, venue: 1, name: 'Section 118', code: '118', is_active: true },
    ];
    state.selectedVenueId = '1';
    state.selectedGateId = '8';

    const view = buildProfileViewModel(state, 'RowdyGull_47');
    expect(view.initials).toBe('RG');
    expect(view.stats).toEqual({
      posts: 86,
      upvotesLabel: '3.2k',
      venues: 14,
    });
    expect(view.recentPosts[0]).toMatchObject({
      content: 'That goal just shook the whole north stand.',
      upvotesLabel: '248',
      hasUpvoted: false,
    });
    expect(view.recentPosts[0]?.meta).toContain('Section 118');
    expect(view.interests).toEqual(['Live music']);
  });

  it('marks recent posts the viewer has upvoted', () => {
    const state = initialAppState();
    state.upvotedPostIds = ['21'];
    state.authUser = {
      id: 1,
      email: 'fan@email.com',
      pseudo_name: 'RowdyGull_47',
      is_email_verified: true,
      recent_posts: [
        {
          id: 21,
          content: 'That goal just shook the whole north stand.',
          section: null,
          venue: 1,
          upvotes_count: 248,
          created_at: new Date().toISOString(),
        },
      ],
      created_at: '',
      updated_at: '',
    };

    expect(buildProfileViewModel(state, 'RowdyGull_47').recentPosts[0]).toMatchObject({
      id: '21',
      hasUpvoted: true,
    });
  });

  it('shows zeros and empty lists when the profile has no stats or interests yet', () => {
    const view = buildProfileViewModel(initialAppState(), 'Guest');
    expect(view.stats).toEqual({ posts: 0, upvotesLabel: '0', venues: 0 });
    expect(view.recentPosts).toEqual([]);
    expect(view.interests).toEqual([]);
  });

  it('uses selected onboarding interests when the user payload has none', () => {
    const state = initialAppState();
    state.selectedInterests = ['Live music'];
    const view = buildProfileViewModel(state, 'Guest');
    expect(view.interests).toEqual(['Live music']);
  });
});

describe('mapProfileRecentPosts', () => {
  it('falls back to venue name when the section is unknown', () => {
    const mapped = mapProfileRecentPosts(
      [
        {
          id: 3,
          content: 'Hello',
          section: 99,
          venue: 1,
          upvotes_count: 1,
          created_at: new Date().toISOString(),
        },
      ],
      [],
      [{ id: 1, name: 'LA Stadium', location: 'LA' }],
    );
    expect(mapped[0]?.meta).toContain('LA Stadium');
  });
});
