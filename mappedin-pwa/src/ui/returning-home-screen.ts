import { buildReturningHomeViewModel } from '../home/presentation/returning-home-data';
import type { ReturningHomeContent } from '../home/domain/entities';
import { resolveDisplayName, type AppState } from '../types';
import { nounS } from '../auth/domain/user-stats';
import { renderContentLoadingOverlay } from './content-loading-overlay';
import { renderHomeRecentPosts } from './home-recent-posts';
import { escapeHtml } from './escape-html';

export function renderReturningHomeScreen(
  state: Pick<
    AppState,
    | 'authUser'
    | 'pseudoNameDraft'
    | 'homeContent'
    | 'venueFeedPosts'
    | 'venueFeedLoading'
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
    searchQuery: '',
    content,
    profileStat: state.authUser?.stat,
  });

  return `
    <section class="returning-home-screen screen-loading-host" aria-label="Home">
      <header class="returning-home-header">
        <p class="returning-home-greeting">${escapeHtml(view.greeting)}</p>
        <h1 class="returning-home-username">${escapeHtml(view.displayName)}</h1>
        <p class="returning-home-prompt">${escapeHtml(view.prompt)}</p>
      </header>

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

      ${renderHomeRecentPosts({
        posts: state.venueFeedPosts,
        loading: state.venueFeedLoading,
      })}
      ${homeLoading ? renderContentLoadingOverlay('Loading home') : ''}
    </section>
  `;
}
