import { describe, expect, it } from 'vitest';

import type { ForumPost } from '../forum/domain/entities';
import {
  appendOlderVenueFeedPosts,
  applyCommentCounts,
  mapForumPostToVenueFeed,
  nextFeedPageFromUrl,
  resolveVenueFeedAreaName,
  scopeVenueFeedPostsToLocation,
  venueFeedTimeAgo,
} from './venue-feed-data';
import type { ForumSectionSummary, VenueFeedPost } from '../types';

const post: ForumPost = {
  id: 21,
  user: { id: 4, display_name: 'Jordan' },
  venue: 1,
  section: 8,
  category: 2,
  content: 'Line is moving',
  upvotes_count: 5,
  flags_count: 0,
  status: 'visible',
  has_upvoted: true,
  created_at: '2026-09-02T10:00:00.000Z',
  updated_at: '2026-09-02T10:00:00.000Z',
};

describe('mapForumPostToVenueFeed', () => {
  it('preserves comment counts when a live post update is merged', () => {
    const existing: VenueFeedPost = {
      id: '21',
      author: 'Jordan',
      authorId: 4,
      initials: 'JO',
      avatarColor: '#000',
      location: 'North',
      locationId: '8',
      timeAgo: '1m ago',
      feedType: 'lines-and-crowds',
      categoryId: '2',
      content: 'Line is moving',
      upvotes: 4,
      comments: 6,
      hasUpvoted: true,
    };

    const mapped = mapForumPostToVenueFeed(
      post,
      new Map([[8, { id: 8, venue: 1, name: 'North', code: 'N', is_active: true }]]),
      new Map([
        [
          2,
          {
            id: 2,
            name: 'Lines',
            slug: 'lines-and-crowds',
            description: '',
            disclaimer: '',
            order: 1,
            is_active: true,
          },
        ],
      ]),
      existing,
    );

    expect(mapped.comments).toBe(6);
    expect(mapped.upvotes).toBe(5);
    expect(mapped.location).toBe('North');
  });
});

describe('applyCommentCounts', () => {
  const feedPost = (id: string, comments: number): VenueFeedPost => ({
    id,
    author: 'Jordan',
    authorId: 4,
    initials: 'JO',
    avatarColor: '#000',
    location: 'North',
    locationId: '8',
    timeAgo: '1m ago',
    feedType: 'lines-and-crowds',
    categoryId: '2',
    content: 'Line is moving',
    upvotes: 4,
    comments,
    hasUpvoted: false,
  });

  it('overlays fetched counts onto matching posts', () => {
    const posts = [feedPost('21', 0), feedPost('22', 0)];
    const next = applyCommentCounts(
      posts,
      new Map([
        ['21', 3],
        ['22', 1],
      ]),
    );
    expect(next.map((post) => post.comments)).toEqual([3, 1]);
  });

  it('keeps current counts for posts without a fetched entry', () => {
    const posts = [feedPost('21', 5), feedPost('22', 2)];
    const next = applyCommentCounts(posts, new Map([['21', 7]]));
    expect(next[0].comments).toBe(7);
    expect(next[1].comments).toBe(2);
  });

  it('returns the same array when there is nothing to apply', () => {
    const posts = [feedPost('21', 5)];
    expect(applyCommentCounts(posts, new Map())).toBe(posts);
  });

  describe('nextFeedPageFromUrl', () => {
    it('extracts the page number from a DRF next URL', () => {
      expect(
        nextFeedPageFromUrl(
          'https://api.example.com/api/forum/posts/?latest=true&page=3&venue=1',
        ),
      ).toBe(3);
    });

    it('returns null when there is no next page', () => {
      expect(nextFeedPageFromUrl(null)).toBeNull();
      expect(
        nextFeedPageFromUrl('https://api.example.com/api/forum/posts/'),
      ).toBeNull();
    });

    it('rejects page numbers below 2', () => {
      expect(
        nextFeedPageFromUrl('https://api.example.com/api/forum/posts/?page=1'),
      ).toBeNull();
    });
  });

  describe('appendOlderVenueFeedPosts', () => {
    it('appends older posts after the existing feed', () => {
      const next = appendOlderVenueFeedPosts(
        [feedPost('21', 0)],
        [feedPost('20', 0), feedPost('19', 0)],
      );
      expect(next.map((post) => post.id)).toEqual(['21', '20', '19']);
    });

    it('drops posts already in the feed (live events race pagination)', () => {
      const next = appendOlderVenueFeedPosts(
        [feedPost('21', 0), feedPost('20', 0)],
        [feedPost('20', 0), feedPost('19', 0)],
      );
      expect(next.map((post) => post.id)).toEqual(['21', '20', '19']);
    });

    it('returns the same array when every older post is a duplicate', () => {
      const existing = [feedPost('21', 0)];
      expect(appendOlderVenueFeedPosts(existing, [feedPost('21', 0)])).toBe(
        existing,
      );
    });
  });

  describe('scopeVenueFeedPostsToLocation', () => {
    const sections: ForumSectionSummary[] = [
      { id: 8, venue: 1, name: 'North Stand', code: 'N', is_active: true },
      { id: 9, venue: 1, name: 'Church', code: '', is_active: true },
    ];
    const posts = [
      { ...feedPost('21', 0), locationId: '8' },
      { ...feedPost('22', 0), locationId: '9' },
    ];

    it('strictly scopes the feed to the section behind a tapped location slug', () => {
      const scope = scopeVenueFeedPostsToLocation(posts, 'church', sections);
      expect(scope.scoped).toBe(true);
      expect(scope.sectionId).toBe(9);
      expect(scope.sectionName).toBe('Church');
      expect(scope.posts.map((post) => post.id)).toEqual(['22']);
    });

    it('returns an empty scoped feed when the section has no posts yet', () => {
      const scope = scopeVenueFeedPostsToLocation(
        [{ ...feedPost('21', 0), locationId: '8' }],
        'church',
        sections,
      );
      expect(scope.scoped).toBe(true);
      expect(scope.posts).toEqual([]);
    });

    it('keeps an empty conversation for locations with no section', () => {
      const scope = scopeVenueFeedPostsToLocation(posts, 'car-park', sections);
      expect(scope.scoped).toBe(true);
      expect(scope.sectionId).toBeNull();
      expect(scope.posts).toEqual([]);
    });

    it('is a no-op without a location', () => {
      const scope = scopeVenueFeedPostsToLocation(posts, null, sections);
      expect(scope.scoped).toBe(false);
      expect(scope.posts).toBe(posts);
    });
  });

  describe('resolveVenueFeedAreaName', () => {
    it('prefers the matched section name over the map card name', () => {
      expect(
        resolveVenueFeedAreaName(
          { posts: [], scoped: true, sectionId: 9, sectionName: 'Church' },
          'The Church',
        ),
      ).toBe('Church');
    });

    it('uses the map card name when the location has no section', () => {
      expect(
        resolveVenueFeedAreaName(
          { posts: [], scoped: false, sectionId: null, sectionName: null },
          'Car Park',
        ),
      ).toBe('Car Park');
    });

    it('returns null when neither name is available', () => {
      expect(
        resolveVenueFeedAreaName(
          { posts: [], scoped: false, sectionId: null, sectionName: null },
          null,
        ),
      ).toBeNull();
    });
  });

  describe('venueFeedTimeAgo', () => {
    it('recomputes the label from createdAt at render time', () => {
      const post = {
        ...feedPost('21', 0),
        timeAgo: 'just now',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      };
      expect(venueFeedTimeAgo(post)).toBe('2h ago');
    });

    it('falls back to the mapped label when createdAt is missing', () => {
      expect(venueFeedTimeAgo(feedPost('21', 0))).toBe('1m ago');
    });
  });
});
