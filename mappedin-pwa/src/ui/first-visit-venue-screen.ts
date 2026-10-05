import {
  buildFirstVisitVenueHomeViewModel,
  buildFirstVisitVenueHomeContent,
} from '../home/presentation/first-visit-venue-home-data';
import { resolveDisplayName, type AppState } from '../types';
import { renderContentLoadingOverlay } from './content-loading-overlay';
import { escapeHtml } from './escape-html';

const upvoteIcon = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 19V7M12 7l-5 5M12 7l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

const commentIcon = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 5.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"></path>
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
  const postsMarkup = feedLoading
    ? ''
    : view.previewPosts.length
      ? view.previewPosts
          .map(
            (post) => `
      <article class="first-visit-post venue-feed-card ${post.categoryTone === 'help' ? 'venue-feed-card--help' : ''}">
        <div class="venue-feed-card-header">
          <div class="venue-feed-user">
            <span class="venue-feed-avatar" style="background:${escapeHtml(post.avatarColor)}">
              ${escapeHtml(post.initials)}
            </span>
            <div class="venue-feed-user-copy">
              <div class="venue-feed-author">${escapeHtml(post.author)}</div>
              <div class="venue-feed-meta">${escapeHtml(view.venueName || 'This venue')}</div>
            </div>
          </div>
          <span class="venue-feed-badge venue-feed-badge--category venue-feed-badge--${escapeHtml(post.categoryTone)}">${escapeHtml(post.categoryLabel)}</span>
        </div>
        <p class="venue-feed-card-content">${escapeHtml(post.content)}</p>
        <div class="venue-feed-card-footer">
          <div class="venue-feed-card-actions">
            ${
              post.upvoteable
                ? `<button
            type="button"
            class="venue-feed-upvote ${post.upvoted ? 'is-active' : ''}"
            data-upvote-id="${escapeHtml(post.id)}"
            aria-pressed="${post.upvoted ? 'true' : 'false'}"
            aria-label="${post.upvoted ? 'Remove upvote' : 'Upvote'}"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5l6 7h-4v7H10v-7H6l6-7z" fill="currentColor"></path>
            </svg>
            <span class="first-visit-post-upvote-count venue-feed-upvote-count">${post.upvotes}</span>
          </button>`
                : `<div class="venue-feed-upvote">
            ${upvoteIcon}
            <span class="first-visit-post-upvote-count venue-feed-upvote-count">${post.upvotes}</span>
          </div>`
            }
            ${
              post.upvoteable
                ? `<button
            type="button"
            class="venue-feed-comment first-visit-post-comment"
            data-comments-id="${escapeHtml(post.id)}"
            aria-label="Open comments"
          >
            ${commentIcon}
            <span>${post.comments}</span>
          </button>`
                : ''
            }
          </div>
        </div>
      </article>
    `,
          )
          .join('')
      : `<p class="first-visit-empty" role="status">No venue updates yet for this category.</p>`;

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
        <div class="first-visit-feed">
          <h2 class="first-visit-feed-title">What to expect</h2>
          <div class="first-visit-post-list screen-loading-host">
            ${postsMarkup}
            ${feedLoading ? renderContentLoadingOverlay('Loading posts') : ''}
          </div>
          <button type="button" class="first-visit-see-all" id="first-visit-see-all-btn">
            View category updates
          </button>
        </div>
      </div>
    </section>
  `;
}
