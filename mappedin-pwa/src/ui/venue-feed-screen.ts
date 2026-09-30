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
  VENUE_FEED_QUICK_REPLIES,
  venueFeedTimeAgo,
} from './venue-feed-data';
import { escapeHtml } from './escape-html';

function formatLiveCount(count: number): string {
  return count.toLocaleString('en-US');
}

function categoryIconHtml(
  iconUrl: string | null | undefined,
  label: string,
  className: string,
): string {
  const trimmed = iconUrl?.trim();
  if (!trimmed) return '';
  return `<img class="${className}" src="${escapeHtml(trimmed)}" alt="" aria-hidden="true" loading="lazy" decoding="async" data-category-icon-label="${escapeHtml(label)}">`;
}

function categoryBadgeIconHtml(
  iconUrl: string | null | undefined,
  label: string,
): string {
  const trimmed = iconUrl?.trim();
  if (!trimmed) return '';
  return `<span class="venue-feed-badge-icon" style="--venue-category-icon: url(&quot;${escapeHtml(trimmed)}&quot;)" aria-hidden="true" data-category-icon-label="${escapeHtml(label)}"></span>`;
}

function categoryIconUrl(
  category: { iconUrl?: string | null; icon_url?: string | null } | null | undefined,
): string | null {
  return category?.iconUrl ?? category?.icon_url ?? null;
}

function categoryToneClass(slug: string | null | undefined): string {
  const normalized = slug?.trim().toLowerCase() ?? '';
  if (/help|security|medical/.test(normalized)) return 'venue-feed-badge--help';
  if (/food|drink|bar|concession/.test(normalized)) return 'venue-feed-badge--food';
  if (/vibe|fan|energy|hype/.test(normalized)) return 'venue-feed-badge--vibe';
  if (/line|crowd|wait|queue/.test(normalized)) return 'venue-feed-badge--crowds';
  return 'venue-feed-badge--default';
}

function topicIconForSlug(slug: string): string {
  if (/food|drink|bar|concession/.test(slug)) return '🍔';
  if (/line|wait|queue/.test(slug)) return '🚶';
  if (/seat|section|stand/.test(slug)) return '🪑';
  if (/park|arrival|gate|entry/.test(slug)) return '🅿️';
  if (/famil|access|ada|kid/.test(slug)) return '👥';
  if (/first|tip|info/.test(slug)) return '💡';
  if (/help|security|medical/.test(slug)) return '🛟';
  return '✨';
}

function visitedLabel(createdAt?: string): string {
  if (!createdAt) return 'Visited recently';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Visited recently';
  return `Visited ${date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })}`;
}

type ExpectTip = {
  author: string;
  initials: string;
  avatarColor: string;
  visited: string;
  content: string;
  upvotes: number;
};

type ExpectTopicFallback = {
  name: string;
  slug: string;
  tips: ExpectTip[];
};

const EXPECT_TOPIC_FALLBACKS: ExpectTopicFallback[] = [
  {
    name: 'Food and Drinks',
    slug: 'food-and-drinks',
    tips: [
      {
        author: 'RedKestrel',
        initials: 'RK',
        avatarColor: '#c9561f',
        visited: 'Visited Oct 2025',
        content: 'The cheesesteak stand at Gate B is worth every cent. Get there before kick-off - line doubles at half time. Cash only.',
        upvotes: 84,
      },
      {
        author: 'MapleNine',
        initials: 'MN',
        avatarColor: '#1f7772',
        visited: 'Visited Sep 2025',
        content: 'Skip the main concourse food - overpriced and slow. The hot food stands on Level 2 are half the price and no queue.',
        upvotes: 61,
      },
      {
        author: 'QuietPelican',
        initials: 'QP',
        avatarColor: '#7b5ab6',
        visited: 'Visited Aug 2025',
        content: 'Water is expensive inside. Bring an empty bottle through security and fill it at the fountains near Section 108.',
        upvotes: 129,
      },
    ],
  },
  {
    name: 'Lines and Wait Times',
    slug: 'lines-and-wait-times',
    tips: [
      {
        author: 'GateRunner',
        initials: 'GR',
        avatarColor: '#3a5ba0',
        visited: 'Visited Sep 2025',
        content: 'North entrance moves fastest after doors open. The east gate looks shorter, but security checks are slower there.',
        upvotes: 47,
      },
      {
        author: 'AisleScout',
        initials: 'AS',
        avatarColor: '#2e9e68',
        visited: 'Visited Aug 2025',
        content: 'Restrooms beside the main stairs back up badly at intermission. Walk one section over and you will save ten minutes.',
        upvotes: 72,
      },
    ],
  },
  {
    name: 'Seats and Sections',
    slug: 'seats-and-sections',
    tips: [
      {
        author: 'SeatSage',
        initials: 'SS',
        avatarColor: '#8b63d4',
        visited: 'Visited Jul 2025',
        content: 'Rows 12-16 in the lower bowl have the cleanest sightline without paying center-section prices.',
        upvotes: 55,
      },
    ],
  },
  {
    name: 'Parking and Arrival',
    slug: 'parking-and-arrival',
    tips: [
      {
        author: 'LotPilot',
        initials: 'LP',
        avatarColor: '#d97706',
        visited: 'Visited Oct 2025',
        content: 'Park one block west if you plan to leave right away. The official lot is convenient going in and slow going out.',
        upvotes: 39,
      },
    ],
  },
  {
    name: 'Families and Access',
    slug: 'families-and-access',
    tips: [
      {
        author: 'FamilyLane',
        initials: 'FL',
        avatarColor: '#0284c7',
        visited: 'Visited Jun 2025',
        content: 'Guest services near the south lobby can tag strollers and point you to the quieter elevator.',
        upvotes: 28,
      },
    ],
  },
  {
    name: 'First Timer Tips',
    slug: 'first-timer-tips',
    tips: [
      {
        author: 'FreshFan',
        initials: 'FF',
        avatarColor: '#16a085',
        visited: 'Visited Sep 2025',
        content: 'Take your entry photo before the crowd builds. The best backdrop is just inside the west concourse.',
        upvotes: 64,
      },
    ],
  },
];

function slugifyTopicName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function fallbackForTopic(name: string, slug: string): ExpectTopicFallback {
  const normalizedSlug = slug || slugifyTopicName(name);
  return (
    EXPECT_TOPIC_FALLBACKS.find(
      (topic) =>
        topic.slug === normalizedSlug ||
        topic.name.toLowerCase() === name.toLowerCase(),
    ) ?? {
      name,
      slug: normalizedSlug,
      tips: [
        {
          author: 'VenueRegular',
          initials: 'VR',
          avatarColor: '#3a5ba0',
          visited: 'Visited recently',
          content: `Check ${name.toLowerCase()} before the rush. A small detour usually saves time once the venue fills up.`,
          upvotes: 24,
        },
      ],
    }
  );
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
  const liveStatus = venueLiveStatusMeta(
    state.venueLiveStatus,
  );
  // Only claim "fans live" while the matching socket is actually connected;
  // otherwise describe the feed as recent posts/messages (idle) or show the status.
  const liveConnection = state.venueLiveStatus;
  const activeSocialPageTab = state.socialPageTab;
  const showingLiveFeed = activeSocialPageTab === 'live-feed';
  const liveSubtitle = liveStatus.subtitle
    ? liveStatus.subtitle
    : liveConnection === 'connected'
      ? 'Live'
      : 'Recent activity';
  // The API exposes feed authors, not attendance or event metadata.
  const participantCount = estimateFansLive(state.venueFeedPosts);
  const filters = categoryFiltersFromApi(state.forumCategories)
    .map(
      (filter) => `
      <button
        type="button"
        class="venue-feed-filter ${filter.id === state.venueFeedFilter ? 'is-active' : ''}"
        data-venue-filter="${escapeHtml(filter.id)}"
        aria-selected="${filter.id === state.venueFeedFilter ? 'true' : 'false'}"
      >
        ${categoryIconHtml(filter.iconUrl, filter.label, 'venue-feed-filter-icon-img')}
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
          const chipTone = categoryToneClass(category?.slug ?? post.feedType);
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
            <span class="venue-feed-badge venue-feed-badge--category ${chipTone}">${categoryBadgeIconHtml(categoryIconUrl(category), chipLabel)}${escapeHtml(chipLabel)}</span>
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

  const socialPageTabs = `
        <div class="venue-feed-page-tabs ${showingLiveFeed ? '' : 'venue-feed-page-tabs--expect'}" role="tablist" aria-label="Social sections">
          <button
            type="button"
            class="venue-feed-page-tab ${showingLiveFeed ? 'is-active' : ''}"
            data-social-page-tab="live-feed"
            role="tab"
            aria-selected="${showingLiveFeed ? 'true' : 'false'}"
          >Live Feed</button>
          <button
            type="button"
            class="venue-feed-page-tab ${!showingLiveFeed ? 'is-active' : ''}"
            data-social-page-tab="what-to-expect"
            role="tab"
            aria-selected="${!showingLiveFeed ? 'true' : 'false'}"
          >What to Expect</button>
        </div>
      `;
  const categoriesForExpect =
    state.forumCategories.length > 0
      ? state.forumCategories
      : EXPECT_TOPIC_FALLBACKS.map((topic, index) => ({
          id: index + 1,
          name: topic.name,
          slug: topic.slug,
          description: '',
          disclaimer: '',
          iconUrl: null,
          order: index + 1,
          is_active: true,
        }));
  const expectTopics = categoriesForExpect.map((category) => {
    const categoryPosts = state.venueFeedPosts.filter(
      (post) => post.categoryId === String(category.id),
    );
    const fallback = fallbackForTopic(category.name, category.slug);
    return {
      id: String(category.id),
      name: category.name,
      slug: category.slug || fallback.slug,
      iconUrl: categoryIconUrl(category),
      count: categoryPosts.length || fallback.tips.length,
      posts: categoryPosts,
      fallbackTips: fallback.tips,
    };
  });
  const selectedExpectTopic =
    expectTopics.find((topic) => topic.id === state.socialExpectTopic) ??
    null;
  const expectTopicGrid = expectTopics.length
    ? expectTopics
        .map(
          (topic, index) => `
          <button
            type="button"
            class="venue-feed-expect-topic ${index === 0 ? 'is-featured' : ''}"
            data-expect-topic="${escapeHtml(topic.id)}"
          >
            <span class="venue-feed-expect-topic-icon" aria-hidden="true">${categoryIconHtml(topic.iconUrl, topic.name, 'venue-feed-expect-topic-icon-img') || topicIconForSlug(topic.slug)}</span>
            <span class="venue-feed-expect-topic-name">${escapeHtml(topic.name)}</span>
            <span class="venue-feed-expect-topic-count">${formatLiveCount(topic.count)} ${topic.count === 1 ? 'tip' : 'tips'}</span>
          </button>
        `,
        )
        .join('')
    : `<p class="venue-feed-expect-empty">Topics will appear here when this venue publishes them.</p>`;
  const expectTopicPosts = selectedExpectTopic?.posts.length
    ? selectedExpectTopic.posts
        .map((post) => {
          const category = categoriesForExpect.find(
            (item) => String(item.id) === post.categoryId,
          );
          return `
            <article class="venue-feed-expect-card">
              <div class="venue-feed-expect-card-top">
                <div class="venue-feed-expect-author">
                  <span class="venue-feed-expect-avatar" style="background:${escapeHtml(post.avatarColor)}">${escapeHtml(post.initials)}</span>
                  <strong>${escapeHtml(post.author)}</strong>
                </div>
                <span class="venue-feed-expect-visited">✓ ${escapeHtml(visitedLabel(post.createdAt))}</span>
              </div>
              <p>${escapeHtml(post.content)}</p>
              <div class="venue-feed-expect-card-meta">
                <span class="venue-feed-expect-upvotes">▲ ${formatLiveCount(post.upvotes)}</span>
                <span class="venue-feed-expect-chip">${categoryIconHtml(categoryIconUrl(category), category?.name ?? post.feedType, 'venue-feed-expect-chip-icon')}${escapeHtml(category?.name ?? post.feedType)}</span>
              </div>
            </article>
          `;
        })
        .join('')
    : selectedExpectTopic
      ? selectedExpectTopic.fallbackTips
          .map(
            (tip) => `
            <article class="venue-feed-expect-card">
              <div class="venue-feed-expect-card-top">
                <div class="venue-feed-expect-author">
                  <span class="venue-feed-expect-avatar" style="background:${escapeHtml(tip.avatarColor)}">${escapeHtml(tip.initials)}</span>
                  <strong>${escapeHtml(tip.author)}</strong>
                </div>
                <span class="venue-feed-expect-visited">✓ ${escapeHtml(tip.visited)}</span>
              </div>
              <p>${escapeHtml(tip.content)}</p>
              <div class="venue-feed-expect-card-meta">
                <span class="venue-feed-expect-upvotes">▲ ${formatLiveCount(tip.upvotes)}</span>
                <span class="venue-feed-expect-chip">${categoryIconHtml(selectedExpectTopic.iconUrl, selectedExpectTopic.name, 'venue-feed-expect-chip-icon')}${escapeHtml(selectedExpectTopic.name)}</span>
              </div>
            </article>
          `,
          )
          .join('')
      : `<p class="venue-feed-expect-empty">No tips yet for this topic.</p>`;
  const whatToExpect = selectedExpectTopic
    ? `
        <section class="venue-feed-expect" aria-label="What to Expect">
          <div class="venue-feed-expect-detail-head">
            <button type="button" class="venue-feed-expect-back" data-expect-topics-back>← All topics</button>
            <h2><span aria-hidden="true">${topicIconForSlug(selectedExpectTopic.slug)}</span> ${escapeHtml(selectedExpectTopic.name)}</h2>
            <span>${formatLiveCount(selectedExpectTopic.count)} ${selectedExpectTopic.count === 1 ? 'tip' : 'tips'}</span>
          </div>
          <div class="venue-feed-expect-cards">${expectTopicPosts}</div>
        </section>
      `
    : `
        <section class="venue-feed-expect" aria-label="What to Expect">
          <p class="venue-feed-expect-intro">From people who've been here. Tap a topic to read their tips.</p>
          <div class="venue-feed-expect-grid">${expectTopicGrid}</div>
        </section>
      `;

  return `
    <div class="venue-feed">
      <div class="venue-feed-scroll">
        <header class="venue-feed-header">
          <div class="venue-feed-header-copy">
            <span class="venue-feed-eyebrow">At this venue</span>
            <h1 class="venue-feed-title">${escapeHtml(venueName)}</h1>
            <div class="venue-feed-header-meta" aria-label="Venue activity">
              <p class="venue-feed-subtitle" role="status" aria-live="polite" aria-atomic="true">
                <span class="venue-feed-live-dot ${liveStatus.dotClass}" aria-hidden="true"></span>
                ${escapeHtml(liveSubtitle)}
              </p>
              <span class="venue-feed-meta-divider" aria-hidden="true"></span>
              <p class="venue-feed-participants">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.75"></circle>
                  <path d="M3 20v-2a6 6 0 0112 0v2M16 5a3 3 0 010 6M21 20v-2a6 6 0 00-3-5.2" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
                </svg>
                <span><strong>${formatLiveCount(participantCount)}</strong> ${participantCount === 1 ? 'participant' : 'participants'}</span>
              </p>
            </div>
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

        ${socialPageTabs}
        ${showingLiveFeed
          ? `
        <div class="venue-feed-filters" role="tablist" aria-label="Post categories">${filters}</div>
        <div class="venue-feed-list screen-loading-host" role="tabpanel" aria-label="Live Feed">
          ${feed}
          ${
            feedLoading
              ? renderContentLoadingOverlay(
                  'Loading posts',
                )
              : ''
          }
        </div>
        ${loadMore}`
          : whatToExpect}
      </div>

      ${showingLiveFeed
        ? `
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
      </div>`
        : ''}
    </div>
  `;
}
