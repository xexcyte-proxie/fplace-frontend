import type { AppState } from '../types';

const voteKeys = new Set<keyof AppState>(['venueFeedPosts', 'upvotedPostIds', 'authUser']);

function withoutPostVotes(posts: AppState['venueFeedPosts']) {
  return posts.map(({ upvotes: _count, hasUpvoted: _voted, ...post }) => post);
}
function withoutProfileVotes(user: AppState['authUser']) {
  if (!user) return user;
  return {
    ...user,
    stat: user.stat ? { ...user.stat, upvotes_count: 0 } : user.stat,
    recent_posts: user.recent_posts?.map(post => ({ ...post, upvotes_count: 0 })),
  };
}

/** Preserve category images, focus, and scroll for optimistic votes and confirmations. */
export function canPatchSocialUpvotes(previous: AppState, next: AppState): boolean {
  if (previous.activeTab !== 'social' || next.activeTab !== 'social'
    || next.socialPageTab !== 'live-feed' || next.notificationsOpen || next.postCommentsOpen) return false;
  const changed = (Object.keys(next) as (keyof AppState)[]).filter(key => previous[key] !== next[key]);
  if (!changed.length || changed.some(key => !voteKeys.has(key))) return false;
  return JSON.stringify(withoutPostVotes(previous.venueFeedPosts)) === JSON.stringify(withoutPostVotes(next.venueFeedPosts))
    && JSON.stringify(withoutProfileVotes(previous.authUser)) === JSON.stringify(withoutProfileVotes(next.authUser));
}

export function patchSocialUpvotes(root: HTMLElement, state: AppState): boolean {
  const feed = root.querySelector<HTMLElement>('.venue-feed');
  if (!feed) return false;
  const posts = new Map(state.venueFeedPosts.map(post => [post.id, post]));
  const upvoted = new Set(state.upvotedPostIds);
  feed.querySelectorAll<HTMLButtonElement>('[data-upvote-id]').forEach(button => {
    const post = posts.get(button.dataset.upvoteId ?? '');
    if (!post) return;
    const active = upvoted.has(post.id) || Boolean(post.hasUpvoted);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Remove upvote' : 'Upvote');
    const count = button.querySelector('.venue-feed-upvote-count');
    if (count && count.textContent !== String(post.upvotes)) count.textContent = String(post.upvotes);
  });
  return true;
}
