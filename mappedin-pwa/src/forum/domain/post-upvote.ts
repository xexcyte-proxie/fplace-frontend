/**
 * Decide the on-screen upvote count after POST /upvote/.
 * Partial API payloads (missing user/venue/content) often report `0`
 * and must not wipe the optimistic count.
 */
export function resolveToggledUpvoteCount(options: {
  previousCount: number;
  nextUpvoted: boolean;
  apiCount: number;
  payloadPartial: boolean;
}): number {
  const previous = Math.max(0, options.previousCount);
  const apiCount = Number.isFinite(options.apiCount)
    ? Math.max(0, Math.floor(options.apiCount))
    : Number.NaN;

  if (!options.payloadPartial && Number.isFinite(apiCount)) return apiCount;
  if (options.nextUpvoted) {
    return Math.max(Number.isFinite(apiCount) ? apiCount : 0, previous + 1);
  }
  if (Number.isFinite(apiCount) && apiCount > 0 && apiCount < previous) {
    return apiCount;
  }
  return Math.max(0, previous - 1);
}

/** True when an upvote response is a stub, not a full `Post`. */
export function isPartialForumPostPayload(post: {
  user: { id: number };
  venue: number;
  content?: string;
}): boolean {
  return post.user.id <= 0 || post.venue <= 0 || !post.content?.trim();
}
