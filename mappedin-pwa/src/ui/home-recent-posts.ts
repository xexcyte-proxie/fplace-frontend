import type { VenueFeedPost } from '../types';
import { resolveFirstVisitCategory } from '../home/domain/entities';
import { escapeHtml } from './escape-html';
import { renderContentLoadingOverlay } from './content-loading-overlay';
import { postCardCommentIcon } from './post-card-icons';

const upvoteIcon = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 19V7M12 7l-5 5M12 7l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

export function renderHomeRecentPosts(options: {
  posts: VenueFeedPost[];
  loading: boolean;
  title?: string;
}): string {
  const posts = (options.posts ?? []).slice(0, 3);
  const loading = options.loading && posts.length === 0;
  const items = posts.length
    ? posts
        .map((post) => {
          const category = resolveFirstVisitCategory(post.feedType);
          const upvoteable = post.kind !== 'conversation';
          return `
      <article class="first-visit-post venue-feed-card ${category.tone === 'help' ? 'venue-feed-card--help' : ''}">
        <div class="venue-feed-card-header">
          <div class="venue-feed-user">
            <span class="venue-feed-avatar" style="background:${escapeHtml(post.avatarColor)}">
              ${escapeHtml(post.initials)}
            </span>
            <div class="venue-feed-user-copy">
              <div class="venue-feed-author">${escapeHtml(post.author)}</div>
              <div class="venue-feed-meta">${escapeHtml(post.location || 'Venue')}</div>
            </div>
          </div>
          <span class="venue-feed-badge venue-feed-badge--category venue-feed-badge--${escapeHtml(category.tone)}">${escapeHtml(category.label)}</span>
        </div>
        <p class="venue-feed-card-content">${escapeHtml(post.content)}</p>
        <div class="venue-feed-card-footer">
          <div class="venue-feed-card-actions">
            ${
              upvoteable
                ? `<button
            type="button"
            class="venue-feed-upvote ${post.hasUpvoted ? 'is-active' : ''}"
            data-upvote-id="${escapeHtml(post.id)}"
            aria-pressed="${post.hasUpvoted ? 'true' : 'false'}"
            aria-label="${post.hasUpvoted ? 'Remove upvote' : 'Upvote'}"
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
              upvoteable
                ? `<button
            type="button"
            class="venue-feed-comment first-visit-post-comment"
            data-comments-id="${escapeHtml(post.id)}"
            aria-label="Open comments"
          >
            ${postCardCommentIcon}
            <span>${post.comments}</span>
          </button>`
                : ''
            }
          </div>
        </div>
      </article>
    `;
        })
        .join('')
    : `<p class="first-visit-empty" role="status">No recent posts yet.</p>`;

  return `
    <section class="first-visit-feed home-recent-posts">
      <h2 class="first-visit-feed-title">${escapeHtml(options.title ?? 'Recent posts')}</h2>
      <div class="first-visit-post-list screen-loading-host">
        ${loading ? '' : items}
        ${loading ? renderContentLoadingOverlay('Loading posts') : ''}
      </div>
      ${
        posts.length
          ? `<button type="button" class="first-visit-see-all" id="first-visit-see-all-btn">View category updates</button>`
          : ''
      }
    </section>
  `;
}
