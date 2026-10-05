import type { VenueFeedPost } from '../types';
import { escapeHtml } from './escape-html';
import { renderContentLoadingOverlay } from './content-loading-overlay';

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

export function renderHomeRecentPosts(options: {
  posts: VenueFeedPost[];
  loading: boolean;
  title?: string;
}): string {
  const posts = (options.posts ?? []).slice(0, 3);
  const loading = options.loading && posts.length === 0;
  const items = posts.length
    ? posts
        .map(
          (post) => `
        <article class="first-visit-post venue-feed-card ${post.helpCard ? 'venue-feed-card--help' : ''}">
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
            <span class="venue-feed-badge venue-feed-badge--category">${escapeHtml(post.feedType || 'Post')}</span>
          </div>
          <p class="venue-feed-card-content">${escapeHtml(post.content)}</p>
          <div class="venue-feed-card-footer">
            <div class="venue-feed-card-actions">
              <div class="venue-feed-upvote">
                ${upvoteIcon}
                <span class="first-visit-post-upvote-count venue-feed-upvote-count">${post.upvotes}</span>
              </div>
              <button
                type="button"
                class="venue-feed-comment first-visit-post-comment"
                data-comments-id="${escapeHtml(post.id)}"
                aria-label="Open comments"
              >
                ${commentIcon}
                <span>${post.comments}</span>
              </button>
            </div>
          </div>
        </article>
      `,
        )
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
          ? `<button type="button" class="first-visit-see-all" id="first-visit-see-all-btn">View all posts</button>`
          : ''
      }
    </section>
  `;
}
