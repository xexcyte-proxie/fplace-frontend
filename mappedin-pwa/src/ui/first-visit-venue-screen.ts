import {
  buildFirstVisitVenueHomeViewModel,
  buildFirstVisitVenueHomeContent,
} from '../home/presentation/first-visit-venue-home-data';
import type { ReturningHomeContent } from '../home/domain/entities';
import { arNotAtVenueCopy } from '../location/domain/venue-presence';
import { resolveDisplayName, type AppState } from '../types';
import { renderContentLoadingOverlay } from './content-loading-overlay';
import { renderHomeVenueSections } from './home-venue-list';
import { escapeHtml } from './escape-html';

/** Inline SVGs so action chrome paints without waiting on PNG downloads. */
const locationIcon = `
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 21s6.5-4.5 6.5-10.2A6.5 6.5 0 0012 4.3a6.5 6.5 0 00-6.5 6.5C5.5 16.5 12 21 12 21z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
    <circle cx="12" cy="10.8" r="2.2" stroke="currentColor" stroke-width="1.75"></circle>
  </svg>
`;

const cameraIcon = `
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4.5 8.5h2.1l1.2-2.1h8.4l1.2 2.1h2.1A1.5 1.5 0 0121 10v8.5A1.5 1.5 0 0119.5 20h-15A1.5 1.5 0 013 18.5V10a1.5 1.5 0 011.5-1.5z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
    <circle cx="12" cy="14" r="3.25" stroke="currentColor" stroke-width="1.75"></circle>
  </svg>
`;

const upvoteIcon = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 19V7M12 7l-5 5M12 7l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

export function renderFirstVisitVenueScreen(
  state: Pick<
    AppState,
    | 'authUser'
    | 'pseudoNameDraft'
    | 'guestId'
    | 'selectedVenueId'
    | 'selectedGateId'
    | 'forumVenues'
    | 'forumSections'
    | 'venueFeedPosts'
    | 'venueFeedLoading'
    | 'upvotedPostIds'
    | 'arRoutePromptOpen'
    | 'arNotAtVenuePromptOpen'
    | 'homeContent'
  >,
): string {
  const displayName = state.authUser
    ? resolveDisplayName(state.authUser)
    : state.pseudoNameDraft.trim() ||
      (state.guestId ? `Guest_${state.guestId.slice(0, 6)}` : resolveDisplayName(null));

  const venue = state.forumVenues.find(
    (item) => String(item.id) === state.selectedVenueId,
  );
  const section = state.forumSections.find(
    (item) => String(item.id) === state.selectedGateId,
  );

  const content = buildFirstVisitVenueHomeContent({
    venueName: venue?.name ?? '',
    sectionLabel: section?.name ?? 'Entry zone',
    posts: state.venueFeedPosts,
    upvotedPostIds: state.upvotedPostIds,
  });
  const view = buildFirstVisitVenueHomeViewModel({ displayName, content });
  const feedLoading = state.venueFeedLoading && state.venueFeedPosts.length === 0;
  const homeContent: ReturningHomeContent | null = state.homeContent;
  const venueSections = homeContent
    ? renderHomeVenueSections({
        recentlyVisited: homeContent.recentlyVisited,
        otherVenues: homeContent.otherVenues,
      })
    : '';

  const postsMarkup = feedLoading
    ? ''
    : view.previewPosts.length
      ? view.previewPosts
          .map(
            (post) => `
      <article class="first-visit-post">
        <div class="first-visit-post-top">
          <span class="first-visit-post-author">${escapeHtml(post.author)}</span>
          <span class="first-visit-post-tag first-visit-post-tag--${escapeHtml(post.categoryTone)}">${escapeHtml(post.categoryLabel)}</span>
        </div>
        <p class="first-visit-post-body">${escapeHtml(post.content)}</p>
        ${
          post.upvoteable
            ? `<button
          type="button"
          class="first-visit-post-meta ${post.upvoted ? 'is-upvoted' : ''}"
          data-upvote-id="${escapeHtml(post.id)}"
          aria-pressed="${post.upvoted ? 'true' : 'false'}"
          aria-label="${post.upvoted ? 'Remove upvote' : 'Upvote'}"
        >
          ${upvoteIcon}
          <span>${post.upvotes}</span>
        </button>`
            : `<div class="first-visit-post-meta">
          ${upvoteIcon}
          <span>${post.upvotes}</span>
        </div>`
        }
      </article>
    `,
          )
          .join('')
      : `<p class="first-visit-empty" role="status">No posts yet. Be the first to shout out.</p>`;

  const awayCopy = arNotAtVenueCopy(venue?.name);
  const arPrompt = state.arNotAtVenuePromptOpen
    ? `
    <div class="location-dialog-backdrop first-visit-ar-prompt" role="presentation">
      <div
        class="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-visit-ar-away-title"
        aria-describedby="first-visit-ar-away-desc"
      >
        <h2 id="first-visit-ar-away-title" class="location-dialog-title">${escapeHtml(awayCopy.title)}</h2>
        <p id="first-visit-ar-away-desc" class="location-dialog-body">
          ${escapeHtml(awayCopy.body)}
        </p>
        <button
          type="button"
          id="first-visit-ar-away-dismiss-btn"
          class="location-dialog-primary"
        >
          Got it
        </button>
      </div>
    </div>
  `
    : state.arRoutePromptOpen
      ? `
    <div class="location-dialog-backdrop first-visit-ar-prompt" role="presentation">
      <div
        class="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-visit-ar-prompt-title"
        aria-describedby="first-visit-ar-prompt-desc"
      >
        <h2 id="first-visit-ar-prompt-title" class="location-dialog-title">Set a route for AR</h2>
        <p id="first-visit-ar-prompt-desc" class="location-dialog-body">
          Pick a start and end on the map (search or tap), then open AR to
          navigate with your camera.
        </p>
        <button
          type="button"
          id="first-visit-ar-open-map-btn"
          class="location-dialog-primary"
        >
          Open map
        </button>
        <button
          type="button"
          id="first-visit-ar-prompt-dismiss"
          class="first-visit-ar-prompt-dismiss"
        >
          Not now
        </button>
      </div>
    </div>
  `
      : '';

  return `
    <section class="first-visit-venue-screen" aria-label="Venue home">
      <header class="first-visit-hero" data-tour-id="home-hero">
        <p class="first-visit-greeting">${escapeHtml(view.greeting)}</p>
        ${
          view.venueName
            ? `<h1 class="first-visit-venue-name">${escapeHtml(view.venueName)}</h1>`
            : ''
        }
        <p class="first-visit-section">${escapeHtml(view.sectionLabel)}</p>
        ${
          view.fansHereLabel
            ? `<div class="first-visit-fans" role="status">
          <span class="first-visit-fans-dot" aria-hidden="true"></span>
          <span>${escapeHtml(view.fansHereLabel)}</span>
        </div>`
            : ''
        }
      </header>

      <div class="first-visit-sheet">
        <div class="first-visit-actions" role="group" aria-label="Quick actions">
          <button type="button" class="first-visit-action first-visit-action--discover" id="first-visit-discover-btn">
            <span class="first-visit-action-icon" aria-hidden="true">
              ${locationIcon}
            </span>
            <span class="first-visit-action-title">Discover</span>
            <span class="first-visit-action-copy">See what the crowd is saying</span>
          </button>
          <button type="button" class="first-visit-action first-visit-action--ar" id="first-visit-ar-btn">
            <span class="first-visit-action-icon" aria-hidden="true">
              ${cameraIcon}
            </span>
            <span class="first-visit-action-title">Try AR</span>
            <span class="first-visit-action-copy">Point your camera to navigate</span>
          </button>
        </div>

        <div class="first-visit-feed">
          <h2 class="first-visit-feed-title">Live from the crowd</h2>
          <div class="first-visit-post-list screen-loading-host">
            ${postsMarkup}
            ${feedLoading ? renderContentLoadingOverlay('Loading posts') : ''}
          </div>
          <button type="button" class="first-visit-see-all" id="first-visit-see-all-btn">
            See all posts
          </button>
        </div>
        ${venueSections}
      </div>
      ${arPrompt}
    </section>
  `;
}
