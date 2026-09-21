import type { HomeStats } from '../../home/domain/entities';
import type { UserStat } from './entities';

export const EMPTY_USER_STAT: UserStat = {
  posts_count: 0,
  upvotes_count: 0,
  venues_count: 0,
};

export function userStatOrZero(stat?: UserStat | null): UserStat {
  return stat ?? EMPTY_USER_STAT;
}

/** Compact label for upvote totals (`3200` → `3.2k`). */
export function formatCompactCount(value: number): string {
  const count = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    const thousands = count / 1000;
    const label =
      thousands >= 10
        ? String(Math.round(thousands))
        : thousands.toFixed(1).replace(/\.0$/, '');
    return `${label}k`;
  }
  const millions = count / 1_000_000;
  const label =
    millions >= 10
      ? String(Math.round(millions))
      : millions.toFixed(1).replace(/\.0$/, '');
  return `${label}m`;
}

/** Invariant noun so `1 venue(s)` stays grammatical. */
export function nounS(noun: string): string {
  return `${noun}(s)`;
}

/** Count plus invariant noun, e.g. `1 post(s)`. */
export function formatCountNoun(count: number, noun: string): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return `${n.toLocaleString('en-US')} ${nounS(noun)}`;
}

export function homeStatsFromUserStat(stat: UserStat): HomeStats {
  return {
    venues: stat.venues_count,
    posts: stat.posts_count,
    upvotesLabel: formatCompactCount(stat.upvotes_count),
  };
}
