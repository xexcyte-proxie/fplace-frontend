import { describe, expect, it } from 'vitest';

import {
  isPartialForumPostPayload,
  resolveToggledUpvoteCount,
} from './post-upvote';

describe('resolveToggledUpvoteCount', () => {
  it('trusts a full post payload', () => {
    expect(
      resolveToggledUpvoteCount({
        previousCount: 4,
        nextUpvoted: true,
        apiCount: 5,
        payloadPartial: false,
      }),
    ).toBe(5);
  });

  it('keeps the optimistic increment when a stub reports zero', () => {
    expect(
      resolveToggledUpvoteCount({
        previousCount: 0,
        nextUpvoted: true,
        apiCount: 0,
        payloadPartial: true,
      }),
    ).toBe(1);
  });

  it('decrements locally when removing an upvote from a stub', () => {
    expect(
      resolveToggledUpvoteCount({
        previousCount: 3,
        nextUpvoted: false,
        apiCount: 0,
        payloadPartial: true,
      }),
    ).toBe(2);
  });
});

describe('isPartialForumPostPayload', () => {
  it('treats missing author or venue as partial', () => {
    expect(
      isPartialForumPostPayload({
        user: { id: 0 },
        venue: 3,
        content: 'Hello',
      }),
    ).toBe(true);
    expect(
      isPartialForumPostPayload({
        user: { id: 2 },
        venue: 0,
        content: 'Hello',
      }),
    ).toBe(true);
    expect(
      isPartialForumPostPayload({
        user: { id: 2 },
        venue: 3,
        content: 'Hello',
      }),
    ).toBe(false);
  });
});
