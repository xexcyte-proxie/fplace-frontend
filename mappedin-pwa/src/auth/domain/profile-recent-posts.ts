import type { ProfileRecentPost } from './entities';

/**
 * Patch a profile `recent_posts` row after an upvote toggle.
 * Returns the same array reference when nothing changed.
 */
export function withRecentPostUpvotes(
  posts: readonly ProfileRecentPost[] | undefined,
  postId: number,
  upvotesCount: number,
): ProfileRecentPost[] | undefined {
  if (!posts?.length || !Number.isFinite(postId) || postId <= 0) {
    return posts as ProfileRecentPost[] | undefined;
  }

  const nextCount = Number.isFinite(upvotesCount)
    ? Math.max(0, Math.floor(upvotesCount))
    : 0;
  let changed = false;
  const next = posts.map((post) => {
    if (post.id !== postId || post.upvotes_count === nextCount) return post;
    changed = true;
    return { ...post, upvotes_count: nextCount };
  });
  return changed ? next : (posts as ProfileRecentPost[]);
}
