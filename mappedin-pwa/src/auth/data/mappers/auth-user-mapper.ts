import type {
  AuthSession,
  AuthUser,
  ProfileRecentPost,
  UserStat,
} from '../../domain/entities';

/**
 * Normalize GET/PATCH /api/users/me/ (and login-embedded) profile JSON.
 */
export function coerceAuthUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const dto = raw as Record<string, unknown>;
  const id = Number(dto.id);
  const email = String(dto.email ?? '').trim();
  if (!Number.isFinite(id) || !email) return null;

  const createdAt = String(
    dto.created_at ?? dto.createdAt ?? new Date().toISOString(),
  );
  const pseudoRaw = dto.pseudo_name ?? dto.pseudoName;
  const interestsRaw = dto.interests;
  const userType = dto.user_type ?? dto.userType;

  return {
    id,
    email,
    pseudo_name:
      typeof pseudoRaw === 'string' && pseudoRaw.trim()
        ? pseudoRaw.trim()
        : pseudoRaw == null
          ? null
          : String(pseudoRaw),
    first_name:
      typeof dto.first_name === 'string'
        ? dto.first_name
        : typeof dto.firstName === 'string'
          ? dto.firstName
          : undefined,
    last_name:
      typeof dto.last_name === 'string'
        ? dto.last_name
        : typeof dto.lastName === 'string'
          ? dto.lastName
          : undefined,
    bio: typeof dto.bio === 'string' ? dto.bio : undefined,
    avatar_url: coerceNullableUri(dto.avatar_url ?? dto.avatarUrl),
    user_type: userType === 'admin' ? 'admin' : 'regular_user',
    is_email_verified: Boolean(
      dto.is_email_verified ?? dto.isEmailVerified,
    ),
    interests: Array.isArray(interestsRaw)
      ? interestsRaw.map((item) => String(item)).filter(Boolean)
      : interestsRaw == null
        ? null
        : undefined,
    stat: coerceUserStat(dto.stat ?? dto.stats),
    recent_posts: coerceProfileRecentPosts(
      dto.recent_posts ?? dto.recentPosts,
    ),
    created_at: createdAt,
    updated_at: String(dto.updated_at ?? dto.updatedAt ?? createdAt),
  };
}

export function coerceAuthSession(raw: unknown): AuthSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const dto = raw as Record<string, unknown>;
  const access = String(dto.access ?? '').trim();
  const refresh = String(dto.refresh ?? '').trim();
  const user = coerceAuthUser(dto.user);
  if (!access || !refresh || !user) return null;
  return { access, refresh, user };
}

export function coerceUserStat(raw: unknown): UserStat | null {
  if (!raw || typeof raw !== 'object') return null;
  const dto = raw as Record<string, unknown>;
  const posts = Number(dto.posts_count ?? dto.postsCount);
  const upvotes = Number(dto.upvotes_count ?? dto.upvotesCount);
  const venues = Number(dto.venues_count ?? dto.venuesCount);
  if (
    !Number.isFinite(posts) &&
    !Number.isFinite(upvotes) &&
    !Number.isFinite(venues)
  ) {
    return null;
  }
  return {
    posts_count: Number.isFinite(posts) ? posts : 0,
    upvotes_count: Number.isFinite(upvotes) ? upvotes : 0,
    venues_count: Number.isFinite(venues) ? venues : 0,
  };
}

export function coerceProfileRecentPosts(raw: unknown): ProfileRecentPost[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => coerceProfileRecentPost(row))
    .filter((row): row is ProfileRecentPost => row != null);
}

function coerceProfileRecentPost(raw: unknown): ProfileRecentPost | null {
  if (!raw || typeof raw !== 'object') return null;
  const dto = raw as Record<string, unknown>;
  const nested =
    dto.post && typeof dto.post === 'object'
      ? (dto.post as Record<string, unknown>)
      : dto;
  const id = Number(nested.id);
  const content = String(nested.content ?? '').trim();
  if (!Number.isFinite(id) || !content) return null;

  const sectionRaw = nested.section;
  const venueRaw = nested.venue;
  const section =
    sectionRaw == null || sectionRaw === ''
      ? null
      : Number(sectionRaw);
  const venue =
    venueRaw == null || venueRaw === '' ? null : Number(venueRaw);

  return {
    id,
    content,
    section: section != null && Number.isFinite(section) ? section : null,
    venue: venue != null && Number.isFinite(venue) ? venue : null,
    upvotes_count:
      Number(nested.upvotes_count ?? nested.upvotesCount ?? nested.upvotes) ||
      0,
    created_at: String(
      nested.created_at ?? nested.createdAt ?? new Date().toISOString(),
    ),
  };
}

function coerceNullableUri(raw: unknown): string | null | undefined {
  if (raw == null) return null;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || null;
}
