import type { FirstVisitCrowdPost } from '../domain/entities';
import {
  countDistinctFans,
  formatFansHereLabel,
  resolveFirstVisitCategory,
  type FirstVisitVenueHomeContent,
} from '../domain/entities';

/** Demo posts matching the first-time-at-venue Figma frame. */
export const DEMO_FIRST_VISIT_POSTS: FirstVisitCrowdPost[] = [
  {
    id: 'demo-crowd-1',
    author: 'SwiftOtter_21',
    categoryLabel: 'CROWDS',
    categoryTone: 'crowds',
    content: 'Merch line at Gate C just cleared out.',
    upvotes: 64,
    upvoted: true,
  },
  {
    id: 'demo-food-1',
    author: 'HungryHawk88',
    categoryLabel: 'FOOD',
    categoryTone: 'food',
    content: 'Nachos stand on the concourse has a short line again.',
    upvotes: 37,
    upvoted: false,
  },
];

const DEMO_FANS_COUNT = 1204;

export interface BuildFirstVisitVenueHomeInput {
  venueName: string;
  sectionLabel: string;
  posts: ReadonlyArray<{
    id: string;
    author: string;
    authorId: number;
    feedType: string;
    content: string;
    upvotes: number;
    hasUpvoted?: boolean;
  }>;
  /** Cap preview rows on the home screen. */
  previewLimit?: number;
}

/**
 * Builds first-visit venue home content from live feed data, with Figma demo
 * fallbacks when the feed is still empty.
 */
export function buildFirstVisitVenueHomeContent(
  input: BuildFirstVisitVenueHomeInput,
): FirstVisitVenueHomeContent {
  const limit = input.previewLimit ?? 2;
  const livePosts = input.posts.slice(0, limit).map((post) => {
    const category = resolveFirstVisitCategory(post.feedType);
    return {
      id: post.id,
      author: post.author,
      categoryLabel: category.label,
      categoryTone: category.tone,
      content: post.content,
      upvotes: post.upvotes,
      upvoted: Boolean(post.hasUpvoted),
    } satisfies FirstVisitCrowdPost;
  });

  const previewPosts =
    livePosts.length > 0 ? livePosts : DEMO_FIRST_VISIT_POSTS.slice(0, limit);

  const fansCount = countDistinctFans(input.posts);
  const fansHereLabel = formatFansHereLabel(
    fansCount > 0 ? fansCount : DEMO_FANS_COUNT,
  );

  return {
    venueName: input.venueName.trim(),
    sectionLabel: input.sectionLabel.trim() || 'Entry zone',
    fansHereLabel,
    previewPosts,
  };
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
