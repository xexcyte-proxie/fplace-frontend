import type { ForumComment } from '../forum/domain/entities';
import type { PostCommentItem } from '../types';

function escapeNotNeeded(value: string): string {
  return value;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function avatarColorForId(id: number): string {
  const palette = ['#3b5998', '#e67e22', '#16a34a', '#7c3aed', '#db2777', '#0891b2'];
  const index = Math.abs(id) % palette.length;
  return palette[index] ?? palette[0];
}

function formatTimeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function mapForumCommentToItem(comment: ForumComment): PostCommentItem {
  const author = comment.user.display_name?.trim() || 'Fan';
  return {
    id: comment.id,
    postId: comment.post,
    authorId: comment.user.id,
    author: escapeNotNeeded(author),
    initials: initialsFromName(author),
    avatarColor: avatarColorForId(comment.user.id),
    content: comment.content,
    timeAgo: formatTimeAgo(comment.created_at),
    createdAt: comment.created_at,
  };
}

export function mapForumCommentsToItems(
  comments: ForumComment[],
): PostCommentItem[] {
  return comments.map(mapForumCommentToItem);
}

/**
 * Appends a comment to an open thread unless it is already there.
 * The REST create response and the venue WebSocket `new_comment` broadcast
 * race each other for the author's own comment, so both paths must dedupe.
 */
export function appendCommentOnce(
  comments: PostCommentItem[],
  item: PostCommentItem,
): PostCommentItem[] {
  return comments.some((comment) => comment.id === item.id)
    ? comments
    : [...comments, item];
}
