import { buildReturningHomeViewModel } from '../home/presentation/returning-home-data';
import type { ReturningHomeContent } from '../home/domain/entities';
import { resolveDisplayName, type AppState } from '../types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function recentVenueIcon(kind: 'pin' | 'globe'): string {
  if (kind === 'globe') {
    return `
      <span class="returning-home-venue-icon returning-home-venue-icon--globe" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.75"></circle>
          <path d="M3.75 12h16.5M12 3.75c2.4 2.6 3.6 5.3 3.6 8.25S14.4 17.65 12 20.25C9.6 17.65 8.4 14.95 8.4 12S9.6 6.35 12 3.75z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
        </svg>
      </span>
    `;
  }

  return `
    <span class="returning-home-venue-icon returning-home-venue-icon--pin" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 21s6.25-4.35 6.25-10a6.25 6.25 0 10-12.5 0c0 5.65 6.25 10 6.25 10z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
        <circle cx="12" cy="11" r="2.15" stroke="currentColor" stroke-width="1.75"></circle>
      </svg>
    </span>
  `;
}

const chevronIcon = `
  <svg class="returning-home-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

export function renderReturningHomeScreen(
  state: Pick<
    AppState,
    | 'authUser'
    | 'pseudoNameDraft'
    | 'homeVenueSearchQuery'
    | 'homeContent'
  >,
): string {
  const content: ReturningHomeContent = state.homeContent ?? {
    recentlyVisited: [],
    stats: { venues: 0, upvotesLabel: '0', posts: 0 },
  };
  const displayName = state.authUser
    ? resolveDisplayName(state.authUser)
    : state.pseudoNameDraft.trim() || resolveDisplayName(null);

  const view = buildReturningHomeViewModel({
    displayName,
    searchQuery: state.homeVenueSearchQuery,
    content,
  });

  const recentRows = view.recentlyVisited.length
    ? view.recentlyVisited
        .map(
          (venue) => `
          <button
            type="button"
            class="returning-home-venue-card"
            data-home-venue-id="${escapeHtml(venue.id)}"
          >
            ${recentVenueIcon(venue.icon)}
            <span class="returning-home-venue-copy">
              <span class="returning-home-venue-name">${escapeHtml(venue.name)}</span>
              <span class="returning-home-venue-meta">${escapeHtml(venue.visitedLabel)} · ${venue.postCount} posts</span>
            </span>
            ${chevronIcon}
          </button>
        `,
        )
        .join('')
    : `<p class="returning-home-empty" role="status">No matching venues</p>`;

  return `
    <section class="returning-home-screen" aria-label="Home">
      <header class="returning-home-header">
        <p class="returning-home-greeting">${escapeHtml(view.greeting)}</p>
        <h1 class="returning-home-username">${escapeHtml(view.displayName)}</h1>
        <p class="returning-home-prompt">${escapeHtml(view.prompt)}</p>
      </header>

      <label class="returning-home-search" data-tour-id="returning-search">
        <svg class="returning-home-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.75"></circle>
          <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
        </svg>
        <input
          id="home-venue-search-input"
          type="search"
          placeholder="Search a venue"
          value="${escapeHtml(view.searchQuery)}"
          autocomplete="off"
          enterkeyhint="search"
        />
      </label>

      <div class="returning-home-section" data-tour-id="returning-recent">
        <h2 class="returning-home-section-title">Recently visited</h2>
        <div class="returning-home-venue-list">
          ${recentRows}
        </div>
      </div>

      <div class="returning-home-section">
        <h2 class="returning-home-section-title">Your fplaces</h2>
        <div class="returning-home-stats" role="group" aria-label="Your fplaces stats">
          <div class="returning-home-stat-card">
            <div class="returning-home-stat-value">${view.stats.venues}</div>
            <div class="returning-home-stat-label">Venues</div>
          </div>
          <div class="returning-home-stat-card">
            <div class="returning-home-stat-value returning-home-stat-value--accent">${escapeHtml(view.stats.upvotesLabel)}</div>
            <div class="returning-home-stat-label">Upvotes</div>
          </div>
          <div class="returning-home-stat-card">
            <div class="returning-home-stat-value">${view.stats.posts}</div>
            <div class="returning-home-stat-label">Posts</div>
          </div>
        </div>
      </div>
    </section>
  `;
}
