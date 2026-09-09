/** Stadium / arena a fan can join for a live venue-scoped feed. */
export interface ForumVenue {
  id: number;
  name: string;
  location: string;
  latitude: string | null;
  longitude: string | null;
  mappedin_map_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** Physical zone within a venue (e.g. North Stand). */
export interface ForumSection {
  id: number;
  venue: number;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Fixed post category fans pick when posting. */
export interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  disclaimer: string;
  order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ForumPublicUser {
  id: number;
  display_name: string;
}

export type ForumPostStatus = 'visible' | 'hidden';

/** Historical / live feed post for a venue. */
export interface ForumPost {
  id: number;
  user: ForumPublicUser;
  venue: number;
  section: number | null;
  category: number;
  content: string;
  upvotes_count: number;
  flags_count: number;
  status: ForumPostStatus;
  has_upvoted: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaginatedList<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ListPostsParams {
  venue: number;
  category?: number;
  section?: number;
  page?: number;
  latest?: boolean;
  status?: ForumPostStatus;
}

/** Body for POST /api/forum/posts/. `content` max 140 chars. */
export interface CreatePostPayload {
  venue: number;
  category: number;
  content: string;
  section?: number | null;
}

/** Optional body for POST /api/forum/posts/<id>/flag/. */
export interface FlagPostPayload {
  reason?: string;
}

/** Body for PUT/PATCH /api/forum/posts/<id>/. */
export interface UpdatePostPayload {
  venue?: number;
  section?: number | null;
  category?: number;
  content?: string;
}

/** Comment on a venue feed post. */
export interface ForumComment {
  id: number;
  post: number;
  user: ForumPublicUser;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ListCommentsParams {
  post?: number;
  page?: number;
  ordering?: string;
  created_after?: string;
  created_before?: string;
}

export interface CreateCommentPayload {
  post: number;
  content: string;
}

export interface UpdateCommentPayload {
  post?: number;
  content?: string;
}

export type SectionHeatPriority = 'high' | 'medium' | 'low';

export interface SectionHeatEntry {
  sectionId: number;
  postCount: number;
  priority: SectionHeatPriority;
}

export interface UpvoteUpdatePayload {
  postId: number;
  upvotesCount: number;
  upvoted?: boolean;
}

/** Receive-only broadcasts on `ws/venues/<venue_id>/`. */
export type VenueLiveEvent =
  | { type: 'new_post'; post: ForumPost }
  | { type: 'upvote_update'; update: UpvoteUpdatePayload }
  | { type: 'post_hidden'; postId: number }
  | { type: 'section_heat_update'; heatmap: SectionHeatEntry[] }
  | { type: 'new_comment'; comment: ForumComment };

export type VenueLiveEventHandler = (event: VenueLiveEvent) => void;

/** Venue-room WebSocket lifecycle (receive-only socket). */
export type VenueLiveConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'auth_missing'
  | 'unavailable';

export type VenueLiveStatusHandler = (status: VenueLiveConnectionStatus) => void;

export interface VenueLiveSubscription {
  disconnect(): void;
}
