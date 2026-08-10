import type { AppState, VenueFeedPost } from '../types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderPostCommentsScreen(
  state: AppState,
  post: VenueFeedPost | null,
): string {
  const loading = state.postCommentsLoading;
  const submitting = state.postCommentsSubmitting;
  const draft = state.postCommentsDraft;
  const error = state.postCommentsError ?? '';
  const isOwner =
    post != null &&
    state.authUser != null &&
    post.authorId === state.authUser.id;

  const comments = state.postComments;
  const list = comments.length
    ? comments
        .map((comment) => {
          const canManage =
            state.authUser != null && comment.authorId === state.authUser.id;
          return `
        <article class="post-comments-item" data-comment-id="${comment.id}">
          <span class="post-comments-avatar" style="background:${escapeHtml(comment.avatarColor)}" aria-hidden="true">
            ${escapeHtml(comment.initials)}
          </span>
          <div class="post-comments-item-body">
            <div class="post-comments-item-meta">
              <span class="post-comments-author">${escapeHtml(comment.author)}</span>
              <span class="post-comments-time">${escapeHtml(comment.timeAgo)}</span>
            </div>
            <p class="post-comments-content">${escapeHtml(comment.content)}</p>
            ${
              canManage
                ? `<button type="button" class="post-comments-delete" data-delete-comment-id="${comment.id}">Delete</button>`
                : ''
            }
          </div>
        </article>
      `;
        })
        .join('')
    : loading
      ? `<p class="post-comments-empty" role="status">Loading comments…</p>`
      : `<p class="post-comments-empty">No comments yet. Start the thread.</p>`;

  const postBlock = post
    ? `
      <article class="post-comments-post">
        <div class="post-comments-post-header">
          <span class="post-comments-avatar" style="background:${escapeHtml(post.avatarColor)}" aria-hidden="true">
            ${escapeHtml(post.initials)}
          </span>
          <div class="post-comments-item-meta">
            <span class="post-comments-author">${escapeHtml(post.author)}</span>
            <span class="post-comments-time">${escapeHtml(post.location)} · ${escapeHtml(post.timeAgo)}</span>
          </div>
        </div>
        ${
          state.postCommentsEditing
            ? `
          <textarea
            id="post-comments-edit-input"
            class="post-comments-edit-input"
            maxlength="140"
            ${submitting ? 'disabled' : ''}
          >${escapeHtml(post.content)}</textarea>
          <div class="post-comments-edit-actions">
            <button type="button" id="post-comments-edit-cancel-btn" class="post-comments-secondary-btn" ${submitting ? 'disabled' : ''}>Cancel</button>
            <button type="button" id="post-comments-edit-save-btn" class="post-comments-primary-btn" ${submitting ? 'disabled' : ''}>
              ${submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        `
            : `<p class="post-comments-post-content">${escapeHtml(post.content)}</p>`
        }
        ${
          isOwner && !state.postCommentsEditing
            ? `
          <div class="post-comments-owner-actions">
            <button type="button" id="post-comments-edit-btn" class="post-comments-secondary-btn">Edit post</button>
            <button type="button" id="post-comments-delete-post-btn" class="post-comments-danger-btn">Delete post</button>
          </div>
        `
            : ''
        }
      </article>
    `
    : `<p class="post-comments-empty">Post not found.</p>`;

  return `
    <div class="post-comments-screen">
      <header class="post-comments-header">
        <button type="button" id="post-comments-back-btn" class="post-comments-back-btn" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
        <div class="post-comments-header-copy">
          <h1 class="post-comments-title">Comments</h1>
          <p class="post-comments-subtitle">${comments.length} reply${comments.length === 1 ? '' : 'ies'}</p>
        </div>
      </header>

      <div class="post-comments-scroll">
        ${postBlock}
        ${error ? `<p class="post-comments-error" role="alert">${escapeHtml(error)}</p>` : ''}
        <div class="post-comments-list">${list}</div>
      </div>

      <form id="post-comments-form" class="post-comments-composer">
        <input
          id="post-comments-input"
          class="post-comments-input"
          type="text"
          maxlength="280"
          placeholder="Add a comment"
          value="${escapeHtml(draft)}"
          ${submitting || !post ? 'disabled' : ''}
        />
        <button
          type="submit"
          id="post-comments-send-btn"
          class="post-comments-send-btn"
          aria-label="Send comment"
          ${submitting || !draft.trim() || !post ? 'disabled' : ''}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
            <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
          </svg>
        </button>
      </form>
    </div>
  `;
}
