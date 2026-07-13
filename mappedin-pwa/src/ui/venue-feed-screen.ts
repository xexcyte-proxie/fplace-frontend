import type { AppState } from '../types';
import {
  filterVenueFeedPosts,
  INITIAL_VENUE_FEED_POSTS,
  VENUE_FEED_EMERGENCY,
  VENUE_FEED_FILTERS,
  VENUE_FEED_QUICK_REPLIES,
  VENUE_FEED_VENUE,
  venuePostsForLocation,
} from './venue-feed-data';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatLiveCount(count: number): string {
  return count.toLocaleString('en-US');
}

function badgeClass(feedType: string): string {
  switch (feedType) {
    case 'hype':
      return 'venue-feed-badge--hype';
    case 'help':
      return 'venue-feed-badge--help';
    case 'food':
      return 'venue-feed-badge--food';
    default:
      return '';
  }
}

function badgeLabel(feedType: string): string {
  switch (feedType) {
    case 'hype':
      return 'HYPE';
    case 'help':
      return 'HELP';
    case 'food':
      return 'FOOD';
    default:
      return feedType.toUpperCase();
  }
}

export function renderVenueFeedScreen(state: AppState): string {
  const sourcePosts = state.venueFeedPosts.length
    ? state.venueFeedPosts
    : INITIAL_VENUE_FEED_POSTS;
  const scopedPosts = state.socialLocation
    ? venuePostsForLocation(sourcePosts, state.socialLocation)
    : sourcePosts;
  const posts = filterVenueFeedPosts(
    scopedPosts,
    state.venueFeedFilter,
    null,
  );
  const draftLength = state.venueFeedDraft.length;

  const filters = VENUE_FEED_FILTERS.map(
    (filter) => `
      <button
        type="button"
        class="venue-feed-filter ${state.venueFeedFilter === filter.id ? 'is-active' : ''} ${filter.id === 'help' ? 'venue-feed-filter--help' : ''}"
        data-venue-filter="${filter.id}"
      >
        ${
          filter.helpIcon
            ? `<svg class="venue-feed-filter-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 10v4M9 8v8M13 6v12M17 9v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>`
            : ''
        }
        ${escapeHtml(filter.label)}
      </button>
    `,
  ).join('');

  const quickReplies = VENUE_FEED_QUICK_REPLIES.map(
    (reply) => `
      <button type="button" class="venue-feed-quick-reply" data-venue-quick-reply="${escapeHtml(reply)}">
        ${escapeHtml(reply)}
      </button>
    `,
  ).join('');

  const feed = posts
    .map((post) => {
      const upvoted = state.upvotedPostIds.includes(post.id);
      const isHelp = post.helpCard || post.feedType === 'help';
      return `
        <article class="venue-feed-card ${isHelp ? 'venue-feed-card--help' : ''}">
          <div class="venue-feed-card-header">
            <div class="venue-feed-user">
              <span class="venue-feed-avatar" style="background:${escapeHtml(post.avatarColor)}">
                ${escapeHtml(post.initials)}
              </span>
              <div class="venue-feed-user-copy">
                <div class="venue-feed-author">${escapeHtml(post.author)}</div>
                <div class="venue-feed-meta">${escapeHtml(post.location)} · ${escapeHtml(post.timeAgo)}</div>
              </div>
            </div>
            <span class="venue-feed-badge ${badgeClass(post.feedType)}">${badgeLabel(post.feedType)}</span>
          </div>
          <p class="venue-feed-card-content">${escapeHtml(post.content)}</p>
          <div class="venue-feed-card-footer">
            <div class="venue-feed-card-actions">
              <button
                type="button"
                class="venue-feed-upvote ${upvoted ? 'is-active' : ''}"
                data-upvote-id="${escapeHtml(post.id)}"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5l6 7h-4v7H10v-7H6l6-7z" fill="currentColor"></path>
                </svg>
                ${post.upvotes}
              </button>
              <button type="button" class="venue-feed-comment" aria-label="${post.comments} comments">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
                </svg>
                ${post.comments}
              </button>
            </div>
            <button type="button" class="venue-feed-flag ${isHelp ? 'venue-feed-flag--danger' : ''}" aria-label="Report">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 4v16M6 4h10l-2 4 2 4H6" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
              </svg>
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  const emergencyBanner =
    state.venueFeedFilter === 'help'
      ? `
        <div class="venue-feed-emergency" role="note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"></circle>
            <path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
          </svg>
          <span>${escapeHtml(VENUE_FEED_EMERGENCY)}</span>
        </div>
      `
      : '';

  return `
    <div class="venue-feed">
      <div class="venue-feed-scroll">
        <header class="venue-feed-header">
          <div class="venue-feed-header-copy">
            <h1 class="venue-feed-title">Venue feed</h1>
            <p class="venue-feed-subtitle">
              <span class="venue-feed-live-dot" aria-hidden="true"></span>
              ${escapeHtml(VENUE_FEED_VENUE.name)} · ${formatLiveCount(VENUE_FEED_VENUE.liveCount)} fans live
            </p>
          </div>
          <button type="button" class="venue-feed-notify-btn" aria-label="Notifications">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 4a4 4 0 00-4 4v1.1c0 .5-.2 1-.5 1.4L6 12.5V14h12v-1.5l-1.5-2c-.3-.4-.5-.9-.5-1.4V8a4 4 0 00-4-4z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
              <path d="M10 18a2 2 0 004 0" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
            </svg>
          </button>
        </header>

        <div class="venue-feed-filters">${filters}</div>
        ${emergencyBanner}
        <div class="venue-feed-list">${feed}</div>
      </div>

      <div class="venue-feed-composer">
        <div class="venue-feed-quick-replies">${quickReplies}</div>
        <div class="venue-feed-input-row">
          <input
            id="venue-feed-input"
            class="venue-feed-input"
            type="text"
            maxlength="140"
            placeholder="Shout out to your section"
            value="${escapeHtml(state.venueFeedDraft)}"
          />
          <button type="button" id="venue-feed-send-btn" class="venue-feed-send-btn" aria-label="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
              <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
            </svg>
          </button>
        </div>
        <div class="venue-feed-char-count">${draftLength} / 140</div>
      </div>
    </div>
  `;
}
