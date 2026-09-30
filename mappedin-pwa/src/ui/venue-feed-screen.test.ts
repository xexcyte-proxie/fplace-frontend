import { describe, expect, it } from 'vitest';

import { renderVenueFeedScreen } from './venue-feed-screen';
import { initialAppState } from '../types';
import type { AppState, ForumCategorySummary, VenueFeedPost } from '../types';

const categories: ForumCategorySummary[] = [
  { id: 1, name: 'Fan Vibe', slug: 'fan-vibe', description: '', disclaimer: '', iconUrl: 'https://cdn.example.test/fan.svg', order: 1, is_active: true },
  { id: 2, name: 'Food & Drinks', slug: 'food-and-drinks', description: '', disclaimer: '', order: 2, is_active: true },
];

const post: VenueFeedPost = {
  id: '21', kind: 'post', author: 'Jordan', authorId: 4, initials: 'JO',
  avatarColor: '#3b5998', location: 'North Stand', locationId: '8',
  timeAgo: '1m ago', feedType: 'fan-vibe', categoryId: '1',
  content: 'Hello venue', upvotes: 2, comments: 0,
};

function feedState(overrides?: Partial<AppState>): AppState {
  const state = initialAppState();
  state.activeTab = 'social';
  state.forumCategories = categories;
  return Object.assign(state, overrides);
}

describe('renderVenueFeedScreen', () => {
  it('splits Social into Live Feed and What to Expect tabs', () => {
    const live = renderVenueFeedScreen(feedState());
    expect(live).toContain('data-social-page-tab="live-feed"');
    expect(live).toContain('data-social-page-tab="what-to-expect"');
    expect(live).toMatch(/data-social-page-tab="live-feed"[\s\S]*?aria-selected="true"/);
    expect(live).toContain('id="venue-feed-input"');

    const expectTab = renderVenueFeedScreen(feedState({
      socialPageTab: 'what-to-expect',
    }));
    expect(expectTab).toMatch(/data-social-page-tab="what-to-expect"[\s\S]*?aria-selected="true"/);
    expect(expectTab).toContain('aria-label="What to Expect"');
    expect(expectTab).toContain("From people who've been here");
    expect(expectTab).toContain('data-expect-topic="1"');
    expect(expectTab).toContain('3 tips');
    expect(expectTab).not.toContain('id="venue-feed-input"');
  });

  it('renders What to Expect topic detail cards', () => {
    const html = renderVenueFeedScreen(feedState({
      socialPageTab: 'what-to-expect',
      socialExpectTopic: '1',
      venueFeedPosts: [post],
    }));
    expect(html).toContain('data-expect-topics-back');
    expect(html).toContain('Fan Vibe');
    expect(html).toContain('Hello venue');
    expect(html).toContain('Visited');
    expect(html).toContain('▲ 2');
  });

  it('uses dummy tips when a What to Expect topic has no live posts', () => {
    const html = renderVenueFeedScreen(feedState({
      socialPageTab: 'what-to-expect',
      socialExpectTopic: '2',
      venueFeedPosts: [],
    }));
    expect(html).toContain('The cheesesteak stand at Gate B is worth every cent.');
    expect(html).toContain('RedKestrel');
    expect(html).toContain('Visited Oct 2025');
  });

  it('renders backend categories as tabs instead of map sections', () => {
    const html = renderVenueFeedScreen(feedState({
      forumSections: [{ id: 8, venue: 1, name: 'North Stand', code: 'N', is_active: true }],
    }));
    expect(html).toContain('aria-label="Post categories"');
    expect(html).toContain('data-venue-filter="all"');
    expect(html).toContain('data-venue-filter="1"');
    expect(html).toContain('data-venue-filter="2"');
    expect(html).toContain('Fan Vibe');
    expect(html).toContain('Food &amp; Drinks');
    expect(html).toContain('src="https://cdn.example.test/fan.svg"');
    expect(html).toContain('class="venue-feed-filter-icon-img"');
    expect(html).not.toContain('data-venue-section');
    expect(html).not.toContain('>North Stand</button>');
  });

  it('filters displayed posts by the selected category id', () => {
    const html = renderVenueFeedScreen(feedState({
      venueFeedFilter: '2',
      venueFeedPosts: [post, { ...post, id: '22', categoryId: '2', feedType: 'food-and-drinks', content: 'Tacos available' }],
    }));
    expect(html).toContain('Tacos available');
    expect(html).not.toContain('Hello venue');
    expect(html).toMatch(/data-venue-filter="2"[\s\S]*?aria-selected="true"/);
  });

  it('shows each post category in its chip', () => {
    const html = renderVenueFeedScreen(feedState({ venueFeedPosts: [post] }));
    expect(html).toContain('class="venue-feed-badge-icon"');
    expect(html).toContain('venue-feed-badge--vibe');
    expect(html).toContain('Fan Vibe</span>');
    expect(html).not.toContain('venue-feed-badge--category">North Stand</span>');
  });

  it('requires a category selection before composing', () => {
    const all = renderVenueFeedScreen(feedState({ venueFeedDraft: 'Great play' }));
    expect(all).toContain('Pick a category to post');
    expect(all).toMatch(/id="venue-feed-send-btn"[\s\S]*?disabled/);

    const selected = renderVenueFeedScreen(feedState({ venueFeedFilter: '1', venueFeedDraft: 'Great play' }));
    expect(selected).toContain('Post in Fan Vibe');
    expect(selected).toContain('maxlength="140"');
    const button = /<button[^>]*id="venue-feed-send-btn"[\s\S]*?>/.exec(selected);
    expect(button?.[0]).not.toContain('disabled');
  });

  it('keeps post actions and escapes post content', () => {
    const html = renderVenueFeedScreen(feedState({ venueFeedPosts: [{ ...post, content: '<b>hello</b>' }] }));
    expect(html).toContain('data-upvote-id="21"');
    expect(html).toContain('data-comments-id="21"');
    expect(html).toContain('data-flag-id="21"');
    expect(html).toContain('&lt;b&gt;hello&lt;/b&gt;');
    expect(html).not.toContain('<b>hello</b>');
  });

  it('shows loading and pagination states for posts', () => {
    const loading = renderVenueFeedScreen(feedState({ venueFeedLoading: true, venueFeedPosts: [] }));
    expect(loading).toContain('aria-label="Loading posts"');

    const older = renderVenueFeedScreen(feedState({
      forumFeedNext: 'https://api.example.com/api/forum/posts/?page=2',
      venueFeedLoadingMore: true,
    }));
    expect(older).toContain('Loading older posts…');
    expect(older).toContain('busy-indicator');
  });
});
