import type { AppState } from '../types';
import {
  filterSocialPosts,
  INITIAL_SOCIAL_POSTS,
  SOCIAL_CATEGORIES,
  SOCIAL_LOCATIONS,
  SOCIAL_QUICK_TAGS,
  SOCIAL_VENUE,
} from './social-data';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function categoryTagClass(category: string): string {
  switch (category) {
    case 'vibe':
      return 'social-post-tag--vibe';
    case 'lines':
      return 'social-post-tag--lines';
    case 'food':
      return 'social-post-tag--food';
    default:
      return '';
  }
}

function formatViewerCount(count: number): string {
  return count.toLocaleString('en-US');
}

export function renderSocialScreen(state: AppState): string {
  const posts = filterSocialPosts(
    state.socialPosts.length ? state.socialPosts : INITIAL_SOCIAL_POSTS,
    state.socialCategory,
    state.socialLocation,
  );

  const categories = SOCIAL_CATEGORIES.map(
    (category) => `
      <button
        type="button"
        class="social-category-chip ${state.socialCategory === category.id ? 'is-active' : ''}"
        data-social-category="${category.id}"
      >
        ${category.dotColor ? `<span class="category-dot" style="background:${category.dotColor}"></span>` : ''}
        ${escapeHtml(category.label)}
      </button>
    `,
  ).join('');

  const locations = SOCIAL_LOCATIONS.map(
    (location) => `
      <button
        type="button"
        class="social-location-card ${state.socialLocation === location.id ? 'is-active' : ''}"
        data-social-location="${location.id}"
      >
        <span class="social-location-label">${escapeHtml(location.label)}</span>
        <span class="social-location-count" style="color:${location.countColor}">
          ${location.postCount} posts
        </span>
      </button>
    `,
  ).join('');

  const tags = SOCIAL_QUICK_TAGS.map(
    (tag) => `
      <button
        type="button"
        class="social-quick-tag ${state.socialTag === tag.id ? 'is-active' : ''}"
        data-social-tag="${tag.id}"
      >
        ${escapeHtml(tag.label)}
      </button>
    `,
  ).join('');

  const feed = posts
    .map((post) => {
      const upvoted = state.upvotedPostIds.includes(post.id);
      return `
        <article class="social-post">
          <div class="social-post-header">
            <div class="social-post-user">
              <span class="social-avatar" style="background:${post.avatarColor}">
                ${escapeHtml(post.initials)}
              </span>
              <div>
                <div class="social-post-author">${escapeHtml(post.author)}</div>
                <div class="social-post-meta">${escapeHtml(post.location)} · ${escapeHtml(post.timeAgo)}</div>
              </div>
            </div>
            <span class="social-post-tag ${categoryTagClass(post.category)}">
              ${escapeHtml(post.categoryLabel)}
            </span>
          </div>
          <p class="social-post-content">${escapeHtml(post.content)}</p>
          <div class="social-post-actions">
            <button
              type="button"
              class="social-upvote ${upvoted ? 'is-active' : ''}"
              data-upvote-id="${escapeHtml(post.id)}"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 4l-7 8h4v8h6v-8h4l-7-8z" fill="currentColor"></path>
              </svg>
              ${post.upvotes}
            </button>
            <button type="button" class="social-comment" aria-label="${post.comments} comments">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8z" stroke="currentColor" stroke-width="2"></path>
              </svg>
              ${post.comments}
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  return `
    <div class="social-screen">
      <header class="social-header">
        <div class="social-header-top">
          <h1 class="social-title">${escapeHtml(SOCIAL_VENUE.name)}</h1>
          <span class="social-live-badge">Live</span>
        </div>
        <p class="social-subheader">
          ${formatViewerCount(SOCIAL_VENUE.viewerCount)} fans viewing now · posting requires being on-site
        </p>
      </header>

      <div class="social-filters">
        <div class="social-category-row">${categories}</div>
        <div class="social-location-row">${locations}</div>
        <div class="social-tags-row">${tags}</div>
      </div>

      <div class="social-divider"></div>

      <div class="social-composer">
        <input
          id="social-input"
          class="social-input"
          type="text"
          placeholder="Share what's happening..."
          value="${escapeHtml(state.socialDraft)}"
        />
        <button type="button" id="social-send-btn" class="social-send-btn" aria-label="Post">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
            <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
          </svg>
        </button>
      </div>

      <div class="social-feed">${feed}</div>
    </div>
  `;
}
