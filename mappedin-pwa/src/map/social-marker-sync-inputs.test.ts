import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import {
  socialMarkerSyncInputsFromState,
  socialMarkerSyncInputsUnchanged,
} from './social-marker-sync-inputs';

describe('socialMarkerSyncInputsUnchanged', () => {
  it('is false before any previous snapshot exists', () => {
    const next = socialMarkerSyncInputsFromState(initialAppState());
    expect(socialMarkerSyncInputsUnchanged(null, next)).toBe(false);
  });

  it('skips GPS-only patches that reuse the same feed and heatmap arrays', () => {
    const base = initialAppState();
    const previous = socialMarkerSyncInputsFromState(base);
    const next = socialMarkerSyncInputsFromState({
      ...base,
      routeTraveledMeters: 18,
      routeRemainingMeters: 40,
      userLocation: { latitude: 43.64, longitude: -79.38, accuracy: 8 },
    });

    expect(socialMarkerSyncInputsUnchanged(previous, next)).toBe(true);
  });

  it('rebuilds when venue feed posts are replaced', () => {
    const previous = socialMarkerSyncInputsFromState(initialAppState());
    const next = socialMarkerSyncInputsFromState({
      ...initialAppState(),
      venueFeedPosts: [
        {
          id: '1',
          author: 'Alex',
          authorId: 2,
          initials: 'AL',
          avatarColor: '#000',
          location: 'North',
          locationId: '4',
          timeAgo: 'just now',
          feedType: 'fan-vibe',
          categoryId: '1',
          content: 'Go',
          upvotes: 0,
          comments: 0,
        },
      ],
    });

    expect(socialMarkerSyncInputsUnchanged(previous, next)).toBe(false);
  });
});
