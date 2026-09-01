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

const HOME_ASSETS = {
  location: '/home/location.png',
  camera: '/home/camera.png',
} as const;

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
    venueName: venue?.name ?? '',
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
        <div class="first-visit-fans" role="status">
          <span class="first-visit-fans-dot" aria-hidden="true"></span>
          <span>${escapeHtml(view.fansHereLabel)}</span>
        </div>
      </header>

      <div class="first-visit-sheet">
        <div class="first-visit-actions" role="group" aria-label="Quick actions">
          <button type="button" class="first-visit-action first-visit-action--discover" id="first-visit-discover-btn">
            <span class="first-visit-action-icon" aria-hidden="true">
              <img src="${HOME_ASSETS.location}" alt="" width="26" height="26" decoding="async" />
            </span>
            <span class="first-visit-action-title">Discover</span>
            <span class="first-visit-action-copy">See what the crowd is saying</span>
          </button>
          <button type="button" class="first-visit-action first-visit-action--ar" id="first-visit-ar-btn">
            <span class="first-visit-action-icon" aria-hidden="true">
              <img src="${HOME_ASSETS.camera}" alt="" width="26" height="26" decoding="async" />
            </span>
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
