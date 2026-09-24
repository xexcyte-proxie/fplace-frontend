import { resolveDisplayName, type AppState } from '../types';
import { buildProfileViewModel, type ProfileViewModel } from './profile-data';

const upvoteKeys = new Set<keyof AppState>([
  'authUser', 'upvotedPostIds', 'venueFeedPosts', 'venueFeedDraft',
]);

function withoutVotes(profile: ProfileViewModel) {
  return {
    ...profile,
    stats: { ...profile.stats, upvotesLabel: '' },
    recentPosts: profile.recentPosts.map((post) => ({
      ...post, upvotesLabel: '', hasUpvoted: false,
    })),
  };
}

export function canPatchProfileUpvotes(previous: AppState, next: AppState): boolean {
  if (next.activeTab !== 'profile' || next.profileView !== 'main') return false;
  if ((Object.keys(next) as (keyof AppState)[]).some(
    (key) => previous[key] !== next[key] && !upvoteKeys.has(key),
  )) return false;

  const before = buildProfileViewModel(previous, resolveDisplayName(previous.authUser));
  const after = buildProfileViewModel(next, resolveDisplayName(next.authUser));
  return JSON.stringify(withoutVotes(before)) === JSON.stringify(withoutVotes(after));
}

export function patchProfileUpvotes(root: HTMLElement, state: AppState): boolean {
  const screen = root.querySelector<HTMLElement>('.profile-screen');
  if (!screen) return false;
  const profile = buildProfileViewModel(state, resolveDisplayName(state.authUser));
  const posts = new Map(profile.recentPosts.map((post) => [post.id, post]));
  screen.querySelectorAll<HTMLButtonElement>('[data-upvote-id]').forEach((button) => {
    const post = posts.get(button.dataset.upvoteId ?? '');
    if (!post) return;
    button.classList.toggle('is-active', post.hasUpvoted);
    button.setAttribute('aria-pressed', String(post.hasUpvoted));
    button.setAttribute('aria-label', post.hasUpvoted ? 'Remove upvote' : 'Upvote');
    const count = button.querySelector('.profile-post-upvote-count');
    if (count) count.textContent = post.upvotesLabel;
  });
  const total = screen.querySelector('.profile-stat-value--green');
  if (total) total.textContent = profile.stats.upvotesLabel;
  return true;
}
