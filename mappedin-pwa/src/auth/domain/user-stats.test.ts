import { describe, expect, it } from 'vitest';

import {
  formatCompactCount,
  formatCountNoun,
  homeStatsFromUserStat,
  nounS,
  userStatOrZero,
} from './user-stats';

describe('formatCompactCount', () => {
  it('keeps small counts and abbreviates thousands', () => {
    expect(formatCompactCount(0)).toBe('0');
    expect(formatCompactCount(86)).toBe('86');
    expect(formatCompactCount(999)).toBe('999');
    expect(formatCompactCount(1000)).toBe('1k');
    expect(formatCompactCount(3200)).toBe('3.2k');
    expect(formatCompactCount(10_400)).toBe('10k');
  });
});

describe('formatCountNoun', () => {
  it('keeps a single invariant noun for 1 and many', () => {
    expect(formatCountNoun(1, 'venue')).toBe('1 venue(s)');
    expect(formatCountNoun(14, 'venue')).toBe('14 venue(s)');
    expect(formatCountNoun(0, 'post')).toBe('0 post(s)');
    expect(nounS('Upvote')).toBe('Upvote(s)');
  });
});

describe('homeStatsFromUserStat', () => {
  it('maps API fields onto the returning-home stats shape', () => {
    expect(
      homeStatsFromUserStat({
        posts_count: 86,
        upvotes_count: 3200,
        venues_count: 14,
      }),
    ).toEqual({
      posts: 86,
      upvotesLabel: '3.2k',
      venues: 14,
    });
  });

  it('treats a missing stat as zeros', () => {
    expect(userStatOrZero(undefined)).toEqual({
      posts_count: 0,
      upvotes_count: 0,
      venues_count: 0,
    });
  });
});
