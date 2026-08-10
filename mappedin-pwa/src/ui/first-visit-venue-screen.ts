import {
  buildFirstVisitVenueHomeViewModel,
  buildFirstVisitVenueHomeContent,
} from '../home/presentation/first-visit-venue-home-data';
import { resolveDisplayName, type AppState } from '../types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const pinIcon = `
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 21s6.25-4.35 6.25-10a6.25 6.25 0 10-12.5 0c0 5.65 6.25 10 6.25 10z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
    <circle cx="12" cy="11" r="2.15" stroke="currentColor" stroke-width="1.75"></circle>
  </svg>
`;

const cameraIcon = `
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4.5 8.5h2.2l1.3-2h8l1.3 2H19.5A1.5 1.5 0 0121 10v8.5a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5V10a1.5 1.5 0 011.5-1.5z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
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
    | 'arRoutePromptOpen'
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
    venueName: venue?.name ?? 'Your venue',
    sectionLabel: section?.name ?? 'Entry zone',
    posts: state.venueFeedPosts,
  });
  const view = buildFirstVisitVenueHomeViewModel({ displayName, content });

  const postsMarkup = view.previewPosts
    .map(
      (post) => `
      <article class="first-visit-post">
        <div class="first-visit-post-top">
          <span class="first-visit-post-author">${escapeHtml(post.author)}</span>
          <span class="first-visit-post-tag first-visit-post-tag--${escapeHtml(post.categoryTone)}">${escapeHtml(post.categoryLabel)}</span>
        </div>
        <p class="first-visit-post-body">${escapeHtml(post.content)}</p>
        <div class="first-visit-post-meta ${post.upvoted ? 'is-upvoted' : ''}">
          ${upvoteIcon}
          <span>${post.upvotes}</span>
        </div>
      </article>
    `,
    )
    .join('');

  const arPrompt = state.arRoutePromptOpen
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
          Choose a start and end point on the map, then open AR to navigate
          with your camera.
        </p>
        <p class="location-dialog-note">
          Search for places or tap the map to set your route.
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
      <header class="first-visit-hero">
        <p class="first-visit-greeting">${escapeHtml(view.greeting)}</p>
        <h1 class="first-visit-venue-name">${escapeHtml(view.venueName)}</h1>
        <p class="first-visit-section">${escapeHtml(view.sectionLabel)}</p>
        <div class="first-visit-fans" role="status">
          <span class="first-visit-fans-dot" aria-hidden="true"></span>
          <span>${escapeHtml(view.fansHereLabel)}</span>
        </div>
      </header>

      <div class="first-visit-sheet">
        <div class="first-visit-actions" role="group" aria-label="Quick actions">
          <button type="button" class="first-visit-action first-visit-action--discover" id="first-visit-discover-btn">
            <span class="first-visit-action-icon" aria-hidden="true">${pinIcon}</span>
            <span class="first-visit-action-title">Discover</span>
            <span class="first-visit-action-copy">See what the crowd is saying</span>
          </button>
          <button type="button" class="first-visit-action first-visit-action--ar" id="first-visit-ar-btn">
            <span class="first-visit-action-icon" aria-hidden="true">${cameraIcon}</span>
            <span class="first-visit-action-title">Try AR</span>
            <span class="first-visit-action-copy">Point your camera to navigate</span>
          </button>
        </div>

        <div class="first-visit-feed">
          <h2 class="first-visit-feed-title">Live from the crowd</h2>
          <div class="first-visit-post-list">
            ${postsMarkup}
          </div>
          <button type="button" class="first-visit-see-all" id="first-visit-see-all-btn">
            See all posts
          </button>
        </div>
      </div>
      ${arPrompt}
    </section>
  `;
}
