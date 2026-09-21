import { initialsFromName } from '../auth/domain/display-initials';
import type { ProfileRecentPost, UserStat } from '../auth/domain/entities';
import {
  formatCompactCount,
  userStatOrZero,
} from '../auth/domain/user-stats';
import { formatTimeAgo } from './venue-feed-data';
import type { AppState, ForumSectionSummary, ForumVenueSummary } from '../types';

export interface ProfileStatView {
  posts: number;
  upvotesLabel: string;
  venues: number;
}

export interface ProfileRecentPostView {
  id: string;
  content: string;
  meta: string;
  upvotesLabel: string;
  hasUpvoted: boolean;
}

export interface ProfileViewModel {
  displayName: string;
  initials: string;
  locationLabel: string;
  interests: string[];
  stats: ProfileStatView;
  recentPosts: ProfileRecentPostView[];
}

export function profileStatsFromUserStat(stat?: UserStat | null): ProfileStatView {
  const counts = userStatOrZero(stat);
  return {
    posts: counts.posts_count,
    upvotesLabel: formatCompactCount(counts.upvotes_count),
    venues: counts.venues_count,
  };
}

export function mapProfileRecentPosts(
  posts: readonly ProfileRecentPost[] | null | undefined,
  sections: readonly ForumSectionSummary[],
  venues: readonly ForumVenueSummary[],
  upvotedPostIds: readonly string[] = [],
): ProfileRecentPostView[] {
  if (!posts?.length) return [];
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const venueById = new Map(venues.map((venue) => [venue.id, venue]));
  const upvotedIds = new Set(upvotedPostIds);

  return posts.slice(0, 5).map((post) => {
    const id = String(post.id);
    const sectionName =
      post.section != null ? sectionById.get(post.section)?.name : undefined;
    const venueName =
      post.venue != null ? venueById.get(post.venue)?.name : undefined;
    const place = sectionName?.trim() || venueName?.trim() || 'Venue';
    return {
      id,
      content: post.content,
      meta: `${place} · ${formatTimeAgo(post.created_at)}`,
      upvotesLabel: formatCompactCount(post.upvotes_count),
      hasUpvoted: upvotedIds.has(id),
    };
  });
}

export function buildProfileViewModel(
  state: Pick<
    AppState,
    | 'authUser'
    | 'selectedInterests'
    | 'selectedVenueId'
    | 'selectedGateId'
    | 'forumVenues'
    | 'forumSections'
    | 'upvotedPostIds'
  >,
  displayName: string,
): ProfileViewModel {
  const user = state.authUser;
  const interests = user?.interests?.length
    ? user.interests
    : [...state.selectedInterests];
  const venueName =
    state.forumVenues.find((item) => String(item.id) === state.selectedVenueId)
      ?.name || 'Venue';
  const sectionName =
    state.forumSections.find((item) => String(item.id) === state.selectedGateId)
      ?.name || 'Section';

  return {
    displayName,
    initials: initialsFromName(displayName),
    locationLabel: `${venueName} · ${sectionName}`,
    interests,
    stats: profileStatsFromUserStat(user?.stat),
    recentPosts: mapProfileRecentPosts(
      user?.recent_posts,
      state.forumSections,
      state.forumVenues,
      state.upvotedPostIds,
    ),
  };
}
