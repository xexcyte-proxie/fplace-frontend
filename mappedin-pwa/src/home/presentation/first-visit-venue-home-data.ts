import type { FirstVisitCrowdPost } from '../domain/entities';
import {
  countDistinctFans,
  formatFansHereLabel,
  resolveFirstVisitCategory,
  type FirstVisitVenueHomeContent,
} from '../domain/entities';

export interface BuildFirstVisitVenueHomeInput {
  venueName: string;
  sectionLabel: string;
  posts: ReadonlyArray<{
    id: string;
    author: string;
    authorId: number;
    initials?: string;
    avatarColor?: string;
    feedType: string;
    content: string;
    upvotes: number;
    comments: number;
    hasUpvoted?: boolean;
    kind?: string;
  }>;
  /** Session ids the viewer has upvoted (covers optimistic state). */
  upvotedPostIds?: readonly string[];
  /** Cap preview rows on the home screen. */
  previewLimit?: number;
}

/** Builds first-visit venue home content from live feed data only. */
export function buildFirstVisitVenueHomeContent(
  input: BuildFirstVisitVenueHomeInput,
): FirstVisitVenueHomeContent {
  const limit = input.previewLimit ?? 2;
  const upvotedIds = new Set(input.upvotedPostIds ?? []);
  const previewPosts = input.posts.slice(0, limit).map((post) => {
    const category = resolveFirstVisitCategory(post.feedType);
    return {
      id: post.id,
      author: post.author,
      initials: post.initials?.trim() || initialsForName(post.author),
      avatarColor: post.avatarColor?.trim() || '#3a5ba0',
      categoryLabel: category.label,
      categoryTone: category.tone,
      content: post.content,
      upvotes: post.upvotes,
      comments: post.comments,
      upvoted: Boolean(post.hasUpvoted) || upvotedIds.has(post.id),
      upvoteable: post.kind !== 'conversation',
    } satisfies FirstVisitCrowdPost;
  });

  const fansCount = countDistinctFans(input.posts);

  return {
    venueName: input.venueName.trim(),
    sectionLabel: input.sectionLabel.trim() || 'Entry zone',
    fansHereLabel: fansCount > 0 ? formatFansHereLabel(fansCount) : '',
    previewPosts,
  };
}

function initialsForName(name: string): string {
  const words = name
    .trim()
    .split(/\s|_/)
    .filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return initials || 'FP';
}

export interface FirstVisitVenueHomeViewModel {
  greeting: string;
  displayName: string;
  venueName: string;
  sectionLabel: string;
  fansHereLabel: string;
  previewPosts: FirstVisitCrowdPost[];
}

export function buildFirstVisitVenueHomeViewModel(options: {
  displayName: string;
  content: FirstVisitVenueHomeContent;
}): FirstVisitVenueHomeViewModel {
  return {
    greeting: `Welcome back, ${options.displayName}`,
    displayName: options.displayName,
    venueName: options.content.venueName,
    sectionLabel: options.content.sectionLabel,
    fansHereLabel: options.content.fansHereLabel,
    previewPosts: options.content.previewPosts,
  };
}
