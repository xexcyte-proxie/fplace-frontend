import { buildReturningHomeViewModel } from '../home/presentation/returning-home-data';
import type { ReturningHomeContent } from '../home/domain/entities';
import { resolveDisplayName, type AppState } from '../types';
import { nounS } from '../auth/domain/user-stats';
import { renderContentLoadingOverlay } from './content-loading-overlay';
import { renderHomeVenueSections } from './home-venue-list';
import { escapeHtml } from './escape-html';

export function renderReturningHomeScreen(
  state: Pick<
    AppState,
    | 'authUser'
    | 'pseudoNameDraft'
    | 'homeVenueSearchQuery'
    | 'homeContent'
  >,
): string {
  const homeLoading = state.homeContent == null;
  const content: ReturningHomeContent = state.homeContent ?? {
    recentlyVisited: [],
    otherVenues: [],
    stats: { venues: 0, upvotesLabel: '0', posts: 0 },
  };
  const displayName = state.authUser
    ? resolveDisplayName(state.authUser)
    : state.pseudoNameDraft.trim() || resolveDisplayName(null);

  const view = buildReturningHomeViewModel({
    displayName,
    searchQuery: state.homeVenueSearchQuery,
    content,
    profileStat: state.authUser?.stat,
  });

  const searching = Boolean(view.searchQuery.trim());
  const venueSections = renderHomeVenueSections({
    recentlyVisited: view.recentlyVisited,
    otherVenues: view.otherVenues,
    searching,
    loading: homeLoading,
  });

  return `
    <section class="returning-home-screen screen-loading-host" aria-label="Home">
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

      <div class="returning-home-venues">${venueSections}</div>

      <div class="returning-home-section">
        <h2 class="returning-home-section-title">Your fplaces</h2>
        <div class="returning-home-stats" role="group" aria-label="Your fplaces stats">
          <div class="returning-home-stat-card">
            <div class="returning-home-stat-value">${view.stats.venues}</div>
            <div class="returning-home-stat-label">${nounS('Venue')}</div>
          </div>
          <div class="returning-home-stat-card">
            <div class="returning-home-stat-value returning-home-stat-value--accent">${escapeHtml(view.stats.upvotesLabel)}</div>
            <div class="returning-home-stat-label">${nounS('Upvote')}</div>
          </div>
          <div class="returning-home-stat-card">
            <div class="returning-home-stat-value">${view.stats.posts}</div>
            <div class="returning-home-stat-label">${nounS('Post')}</div>
          </div>
        </div>
      </div>
      ${homeLoading ? renderContentLoadingOverlay('Loading home') : ''}
    </section>
  `;
}
