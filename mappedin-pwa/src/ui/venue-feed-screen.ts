import type { AppState, VenueLiveConnectionStatus } from '../types';
import { formatUnreadBadge } from './notifications-data';
import { renderContentLoadingOverlay } from './content-loading-overlay';
import {
  categoryFiltersFromApi,
  estimateFansLive,
  filterVenueFeedPosts,
  helpDisclaimer,
  resolveVenueFeedAreaName,
  scopeVenueFeedPostsToLocation,
  VENUE_FEED_QUICK_REPLIES,
  venueFeedTimeAgo,
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

function venueLiveStatusMeta(status: VenueLiveConnectionStatus): {
  dotClass: string;
  subtitle: string;
  banner: string | null;
} {
  switch (status) {
    case 'idle':
      return { dotClass: 'venue-feed-live-dot--pending', subtitle: '', banner: null };
    case 'connected':
      return { dotClass: 'venue-feed-live-dot--connected', subtitle: '', banner: null };
    case 'connecting':
      return {
        dotClass: 'venue-feed-live-dot--pending',
        subtitle: 'Connecting live updates…',
        banner: 'Connecting live updates. Recent posts below already come from the venue.',
      };
    case 'reconnecting':
      return {
        dotClass: 'venue-feed-live-dot--pending',
        subtitle: 'Reconnecting live updates…',
        banner: 'Live connection dropped. Retrying. Recent posts below still come from the venue.',
      };
    case 'auth_missing':
      return {
        dotClass: 'venue-feed-live-dot--offline',
        subtitle: 'Live updates paused',
        banner: 'Sign in required for live updates. Recent posts below still come from the venue.',
      };
    case 'unavailable':
      return {
        dotClass: 'venue-feed-live-dot--offline',
        subtitle: 'Live updates unavailable',
        banner:
          'This page is HTTPS but the live server is not (ws://). Recent posts still load. Heatmap needs a secure wss host.',
      };
    case 'disconnected':
      return {
        dotClass: 'venue-feed-live-dot--offline',
        subtitle: 'Live updates offline',
        banner:
          'Live updates are offline. Recent posts below still come from the venue.',
      };
    default:
      return { dotClass: 'venue-feed-live-dot--offline', subtitle: 'Live updates offline', banner: null };
  }
}

function badgeClass(feedType: string): string {
  switch (feedType) {
    case 'fan-vibe':
    case 'hype':
      return 'venue-feed-badge--hype';
    case 'help':
      return 'venue-feed-badge--help';
    case 'food-and-drinks':
    case 'food':
      return 'venue-feed-badge--food';
    case 'lines-and-crowds':
      return 'venue-feed-badge--lines';
    default:
      return '';
  }
}

function badgeLabel(feedType: string, categoryName?: string): string {
  if (categoryName) {
    const normalized = categoryName.trim().toUpperCase();
    if (normalized === 'FAN VIBE' || normalized === 'VIBE') return 'HYPE';
    return normalized;
  }
  switch (feedType) {
    case 'fan-vibe':
    case 'hype':
      return 'HYPE';
    case 'help':
      return 'HELP';
    case 'food-and-drinks':
    case 'food':
      return 'FOOD';
    case 'lines-and-crowds':
      return 'LINES';
    default:
      return feedType.replaceAll('-', ' ').toUpperCase();
  }
}

export function renderVenueFeedScreen(state: AppState): string {
  const scope = scopeVenueFeedPostsToLocation(
    state.venueFeedPosts,
    state.socialLocation,
    state.forumSections,
  );
  const posts = filterVenueFeedPosts(
    scope.posts,
    state.venueFeedFilter,
    null,
  );
  const draftLength = state.venueFeedDraft.length;
  const venueName =
    state.forumVenues.find((venue) => String(venue.id) === state.selectedVenueId)
      ?.name ?? 'Venue';
  const areaName = resolveVenueFeedAreaName(scope, state.socialLocationName);
  const scopeLabel = areaName
    ?? (scope.scoped ? state.socialLocation : null)
    ?? venueName;
  const feedTitle = areaName ?? 'Venue feed';
  const liveCount = estimateFansLive(
    scope.posts,
    state.authUser?.id ?? null,
  );
  const liveStatus = venueLiveStatusMeta(state.venueLiveStatus);
  // Only claim "fans live" while the venue socket is actually connected;
  // otherwise describe the feed as recent posts (idle) or show the status.
  const liveSubtitle = liveStatus.subtitle
    ? liveStatus.subtitle
    : state.venueLiveStatus === 'connected'
      ? `${scopeLabel} · ${formatLiveCount(liveCount)} fan(s) live`
      : `${scopeLabel} · recent posts`;
  const filters = categoryFiltersFromApi(state.forumCategories)
    .map(
      (filter) => `
      <button
        type="button"
        class="venue-feed-filter ${state.venueFeedFilter === filter.id ? 'is-active' : ''} ${filter.helpIcon ? 'venue-feed-filter--help' : ''}"
        data-venue-filter="${escapeHtml(filter.id)}"
      >
        ${
          filter.helpIcon
            ? `<svg class="venue-feed-filter-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 10v4M9 8v8M13 6v12M17 9v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>`
            : ''
        }
        ${escapeHtml(filter.label)}
      </button>
    `,
    )
    .join('');

  const quickReplies = VENUE_FEED_QUICK_REPLIES.map(
    (reply) => `
      <button type="button" class="venue-feed-quick-reply" data-venue-quick-reply="${escapeHtml(reply)}">
        ${escapeHtml(reply)}
      </button>
    `,
  ).join('');

  const categoryNameById = new Map(
    state.forumCategories.map((category) => [String(category.id), category.name]),
  );

  const feedLoading = state.venueFeedLoading && posts.length === 0;
  const feed = posts.length
    ? posts
        .map((post) => {
          const upvoted =
            state.upvotedPostIds.includes(post.id) || Boolean(post.hasUpvoted);
          const flagged = state.flaggedPostIds.includes(post.id);
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
                <div class="venue-feed-meta">${escapeHtml(post.location)} · ${escapeHtml(venueFeedTimeAgo(post))}</div>
              </div>
            </div>
            <span class="venue-feed-badge ${badgeClass(post.feedType)}">${escapeHtml(badgeLabel(post.feedType, categoryNameById.get(post.categoryId)))}</span>
          </div>
          <p class="venue-feed-card-content">${escapeHtml(post.content)}</p>
          <div class="venue-feed-card-footer">
            <div class="venue-feed-card-actions">
              <button
                type="button"
                class="venue-feed-upvote ${upvoted ? 'is-active' : ''}"
                data-upvote-id="${escapeHtml(post.id)}"
                aria-pressed="${upvoted ? 'true' : 'false'}"
                aria-label="${upvoted ? 'Remove upvote' : 'Upvote'}"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5l6 7h-4v7H10v-7H6l6-7z" fill="currentColor"></path>
                </svg>
                <span class="venue-feed-upvote-count">${post.upvotes}</span>
              </button>
              <button
                type="button"
                class="venue-feed-comment"
                data-comments-id="${escapeHtml(post.id)}"
                aria-label="${post.comments} comments"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
                </svg>
                ${post.comments}
              </button>
            </div>
            <button
              type="button"
              class="venue-feed-flag ${isHelp ? 'venue-feed-flag--danger' : ''} ${flagged ? 'is-active' : ''}"
              data-flag-id="${escapeHtml(post.id)}"
              aria-pressed="${flagged ? 'true' : 'false'}"
              aria-label="${flagged ? 'Remove report' : 'Report'}"
              title="${flagged ? 'Reported — tap to remove your report' : 'Report this post'}"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                ${
                  flagged
                    ? `<path d="M6 4h10l-2 4 2 4H6V4z" fill="currentColor"></path><path d="M6 4v16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>`
                    : `<path d="M6 4v16M6 4h10l-2 4 2 4H6" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>`
                }
              </svg>
            </button>
          </div>
        </article>
      `;
        })
        .join('')
    : feedLoading
      ? ''
      : `<p class="venue-feed-empty">No posts yet for ${
        scope.scoped ? escapeHtml(scopeLabel) : 'this venue'
      }. Be the first to shout out.</p>`;

  const locationScopeChip = scope.scoped
    ? `
        <div class="venue-feed-location-scope" role="status">
          <span class="venue-feed-location-scope-label">Posts for ${escapeHtml(scopeLabel)}</span>
          <button
            type="button"
            id="venue-feed-clear-location-btn"
            class="venue-feed-location-scope-clear"
            aria-label="Show all venue posts"
          >All venue ✕</button>
        </div>
      `
    : '';

  const loadMore = state.forumFeedNext
    ? `
        <button
          type="button"
          id="venue-feed-load-more-btn"
          class="venue-feed-load-more"
          ${state.venueFeedLoadingMore ? 'disabled' : ''}
        >${state.venueFeedLoadingMore ? 'Loading older posts…' : 'Show older posts'}</button>
      `
    : '';

  const emergencyText =
    helpDisclaimer(state.forumCategories, state.venueFeedFilter) ??
    helpDisclaimer(state.forumCategories, 'all') ??
    'For medical or security emergencies, please contact stadium staff directly.';
  const emergencyBanner = `
        <div class="venue-feed-emergency" role="note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"></circle>
            <path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
          </svg>
          <span>${escapeHtml(emergencyText)}</span>
        </div>
      `;
  const liveBanner = liveStatus.banner
    ? `
        <div class="venue-feed-live-banner" role="status" aria-live="polite">
          <span class="venue-feed-live-dot ${liveStatus.dotClass}" aria-hidden="true"></span>
          <span>${escapeHtml(liveStatus.banner)}</span>
        </div>
      `
    : '';

  return `
    <div class="venue-feed">
      <div class="venue-feed-scroll">
        <header class="venue-feed-header">
          <div class="venue-feed-header-copy">
            <h1 class="venue-feed-title">${escapeHtml(feedTitle)}</h1>
            <p class="venue-feed-subtitle">
              <span class="venue-feed-live-dot ${liveStatus.dotClass}" aria-hidden="true"></span>
              ${escapeHtml(liveSubtitle)}
            </p>
          </div>
          <button
            type="button"
            id="venue-feed-notify-btn"
            class="venue-feed-notify-btn"
            aria-label="Notifications${
              state.notificationsUnreadCount > 0
                ? ` (${state.notificationsUnreadCount} unread)`
                : ''
            }"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 4a4 4 0 00-4 4v1.1c0 .5-.2 1-.5 1.4L6 12.5V14h12v-1.5l-1.5-2c-.3-.4-.5-.9-.5-1.4V8a4 4 0 00-4-4z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
              <path d="M10 18a2 2 0 004 0" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
            </svg>
            ${
              state.notificationsEnabled && state.notificationsUnreadCount > 0
                ? `<span class="venue-feed-notify-badge">${escapeHtml(formatUnreadBadge(state.notificationsUnreadCount))}</span>`
                : ''
            }
          </button>
        </header>

        <div class="venue-feed-filters">${filters}</div>
        ${locationScopeChip}
        ${liveBanner}
        ${emergencyBanner}
        <div class="venue-feed-list screen-loading-host">
          ${feed}
          ${feedLoading ? renderContentLoadingOverlay('Loading posts') : ''}
        </div>
        ${loadMore}
      </div>

      <div class="venue-feed-composer" data-tour-id="venue-composer">
        <div class="venue-feed-quick-replies">${quickReplies}</div>
        <div class="venue-feed-input-row">
          <input
            id="venue-feed-input"
            class="venue-feed-input"
            type="text"
            maxlength="140"
            placeholder="${escapeHtml(scope.scoped ? `Shout out to ${scopeLabel}` : 'Shout out to your section')}"
            value="${escapeHtml(state.venueFeedDraft)}"
          />
          <button
            type="button"
            id="venue-feed-send-btn"
            class="venue-feed-send-btn"
            aria-label="Send"
            ${state.venueFeedDraft.trim() ? '' : 'disabled'}
          >
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
