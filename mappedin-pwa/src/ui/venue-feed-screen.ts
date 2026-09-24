import { formatCountNoun } from '../auth/domain/user-stats';
import type { AppState, VenueLiveConnectionStatus } from '../types';
import { FORUM_POST_CONTENT_MAX_LENGTH } from '../forum/domain/entities';
import {
  canCreateVenuePost,
  postingNotAtVenueComposerHint,
  postingNotAtVenueCopy,
} from '../forum/domain/venue-posting';
import { userVenuePresence } from '../location/domain/venue-presence';
import { formatUnreadBadge } from './notifications-data';
import {
  renderBusyIndicator,
  renderBusyLabel,
  renderContentLoadingOverlay,
} from './content-loading-overlay';
import {
  estimateFansLive,
  categoryFiltersFromApi,
  filterVenueFeedPosts,
  helpDisclaimer,
  VENUE_FEED_QUICK_REPLIES,
  venueFeedTimeAgo,
} from './venue-feed-data';
import { escapeHtml } from './escape-html';

function formatLiveCount(count: number): string {
  return count.toLocaleString('en-US');
}

// Keep connection diagnostics out of user-facing copy in every connection state.
function venueLiveStatusMeta(status: VenueLiveConnectionStatus): {
  dotClass: string;
  subtitle: string;
} {
  switch (status) {
    case 'idle':
      return { dotClass: 'venue-feed-live-dot--offline', subtitle: '' };
    case 'connected':
      return { dotClass: 'venue-feed-live-dot--connected', subtitle: '' };
    case 'connecting':
      return { dotClass: 'venue-feed-live-dot--pending', subtitle: 'Connecting…' };
    case 'reconnecting':
      return { dotClass: 'venue-feed-live-dot--pending', subtitle: 'Reconnecting…' };
    case 'auth_missing':
    case 'unavailable':
    case 'disconnected':
    default:
      return { dotClass: 'venue-feed-live-dot--offline', subtitle: 'Live updates paused' };
  }
}

export function renderVenueFeedScreen(state: AppState): string {
  const posts = filterVenueFeedPosts(
    state.venueFeedPosts,
    state.venueFeedFilter,
    null,
  );
  const selectedVenue = state.forumVenues.find(
    (venue) => String(venue.id) === state.selectedVenueId,
  );
  const canPostHere = canCreateVenuePost(
    userVenuePresence(
      state.locationPermission,
      state.userLocation,
      selectedVenue,
    ),
  );
  const selectedCategory = state.forumCategories.find(
    (category) => String(category.id) === state.venueFeedFilter,
  );
  const canCompose = Boolean(selectedCategory) && canPostHere;
  const composerMax = FORUM_POST_CONTENT_MAX_LENGTH;
  const draftLength = Math.min(state.venueFeedDraft.length, composerMax);
  const venueName = selectedVenue?.name ?? 'Venue';
  const scopeLabel = selectedCategory?.name ?? venueName;
  const feedTitle = 'Posts';
  const liveCount = estimateFansLive(
    posts,
    state.authUser?.id ?? null,
  );
  const liveStatus = venueLiveStatusMeta(
    state.venueLiveStatus,
  );
  // Only claim "fans live" while the matching socket is actually connected;
  // otherwise describe the feed as recent posts/messages (idle) or show the status.
  const liveConnection = state.venueLiveStatus;
  const liveSubtitle = liveStatus.subtitle
    ? liveStatus.subtitle
    : liveConnection === 'connected'
      ? `${scopeLabel} · ${formatLiveCount(liveCount)} fan(s) live`
      : `${scopeLabel} · recent posts`;
  // The API exposes feed authors, not attendance or event metadata.
  const participantCount = estimateFansLive(state.venueFeedPosts);
  const contextStatus = state.venueLiveStatus === 'connected'
    ? 'Live'
    : state.venueLiveStatus === 'connecting'
      ? 'Connecting'
      : state.venueLiveStatus === 'reconnecting'
        ? 'Reconnecting'
        : state.venueLiveStatus === 'idle' ? 'Recent activity' : 'Live updates paused';
  const contextDot = venueLiveStatusMeta(state.venueLiveStatus).dotClass;
  const filters = categoryFiltersFromApi(state.forumCategories)
    .map(
      (filter) => `
      <button
        type="button"
        class="venue-feed-filter ${filter.id === state.venueFeedFilter ? 'is-active' : ''}"
        data-venue-filter="${escapeHtml(filter.id)}"
        aria-selected="${filter.id === state.venueFeedFilter ? 'true' : 'false'}"
      >
        ${escapeHtml(filter.label)}
      </button>
    `,
    )
    .join('');

  const quickReplies = canCompose
    ? VENUE_FEED_QUICK_REPLIES.map(
        (reply) => `
      <button type="button" class="venue-feed-quick-reply" data-venue-quick-reply="${escapeHtml(reply)}">
        ${escapeHtml(reply)}
      </button>
    `,
      ).join('')
    : '';

  const feedLoading =
    state.venueFeedLoading &&
    posts.length === 0 &&
    !state.venueFeedSubmitting;
  const sending = state.venueFeedSubmitting;
  const loadingMore = state.venueFeedLoadingMore && !sending;
  const feed = posts.length
    ? posts
        .map((post) => {
          const upvoted =
            state.upvotedPostIds.includes(post.id) || Boolean(post.hasUpvoted);
          const flagged = state.flaggedPostIds.includes(post.id);
          const isHelp = post.helpCard || post.feedType === 'help';
          const category = state.forumCategories.find(
            (item) => String(item.id) === post.categoryId,
          );
          const chipLabel = category?.name ?? post.feedType.replaceAll('-', ' ');
          return `
        <article class="venue-feed-card ${isHelp ? 'venue-feed-card--help' : ''}">
          <div class="venue-feed-card-header">
            <div class="venue-feed-user">
              <span class="venue-feed-avatar" style="background:${escapeHtml(post.avatarColor)}">
                ${escapeHtml(post.initials)}
              </span>
              <div class="venue-feed-user-copy">
                <div class="venue-feed-author">${escapeHtml(post.author)}</div>
                <div class="venue-feed-meta">${escapeHtml(venueName)} · ${escapeHtml(venueFeedTimeAgo(post))}</div>
              </div>
            </div>
            <span class="venue-feed-badge venue-feed-badge--category">${escapeHtml(chipLabel)}</span>
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
                aria-label="${formatCountNoun(post.comments, 'comment')}"
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
              title="${flagged ? 'Reported. Tap to remove your report' : 'Report this post'}"
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
          selectedCategory ? escapeHtml(selectedCategory.name) : 'this venue'
        }. Be the first to shout out.</p>`;

  const loadMore = state.forumFeedNext && !feedLoading
    ? `
        <button
          type="button"
          id="venue-feed-load-more-btn"
          class="venue-feed-load-more${loadingMore ? ' is-loading' : ''}"
          ${loadingMore || sending ? 'disabled' : ''}
          aria-busy="${loadingMore ? 'true' : 'false'}"
        >${
          loadingMore
            ? renderBusyLabel(
                'Loading older posts…',
              )
            : 'Show older posts'
        }</button>
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

  return `
    <div class="venue-feed">
      <div class="venue-feed-scroll">
        <section class="venue-feed-context" aria-label="Event context">
          <div class="venue-feed-context-top">
            <span class="venue-feed-context-eyebrow">At this venue</span>
            <span class="venue-feed-context-status" role="status">
              <span class="venue-feed-live-dot ${contextDot}" aria-hidden="true"></span>
              ${contextStatus}
            </span>
          </div>
          <p class="venue-feed-context-venue">${escapeHtml(venueName)}</p>
          <p class="venue-feed-context-event">Event details unavailable</p>
          <div class="venue-feed-context-crowd">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.75"></circle>
              <path d="M3 20v-2a6 6 0 0112 0v2M16 5a3 3 0 010 6M21 20v-2a6 6 0 00-3-5.2" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
            </svg>
            <span><strong>${formatLiveCount(participantCount)}</strong> ${participantCount === 1 ? 'participant' : 'participants'} in loaded feed</span>
          </div>
        </section>
        <header class="venue-feed-header">
          <div class="venue-feed-header-copy">
            <h1 class="venue-feed-title">${escapeHtml(feedTitle)}</h1>
            <p class="venue-feed-subtitle" role="status" aria-live="polite" aria-atomic="true">
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

        <div class="venue-feed-filters" role="tablist" aria-label="Post categories">${filters}</div>
        ${emergencyBanner}
        <div class="venue-feed-list screen-loading-host">
          ${feed}
          ${
            feedLoading
              ? renderContentLoadingOverlay(
                  'Loading posts',
                )
              : ''
          }
        </div>
        ${loadMore}
      </div>

      <div class="venue-feed-composer" data-tour-id="venue-composer">
        ${
          !canPostHere
            ? `<p class="venue-feed-composer-note" role="status">${escapeHtml(
                postingNotAtVenueCopy(venueName).body,
              )}</p>`
            : `<div class="venue-feed-quick-replies">${quickReplies}</div>`
        }
        <div class="venue-feed-input-row">
          <input
            id="venue-feed-input"
            class="venue-feed-input"
            type="text"
            maxlength="${composerMax}"
            placeholder="${escapeHtml(
              !canPostHere
                ? postingNotAtVenueComposerHint()
                : !canCompose
                  ? 'Pick a category to post'
                  : `Post in ${scopeLabel}`,
            )}"
            value="${escapeHtml(state.venueFeedDraft)}"
            ${sending || !canCompose ? 'disabled' : ''}
          />
          <button
            type="button"
            id="venue-feed-send-btn"
            class="venue-feed-send-btn${sending ? ' is-loading' : ''}"
            aria-label="${sending ? 'Sending' : 'Send'}"
            aria-busy="${sending ? 'true' : 'false'}"
            ${
              sending || !canCompose || !state.venueFeedDraft.trim()
                ? 'disabled'
                : ''
            }
          >
            ${
              sending
                ? renderBusyIndicator()
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
              <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
            </svg>`
            }
          </button>
        </div>
        ${
          canPostHere
            ? `<div class="venue-feed-char-count">${draftLength} / ${composerMax}</div>`
            : ''
        }
      </div>
    </div>
  `;
}
