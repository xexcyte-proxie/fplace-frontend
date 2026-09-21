import { describe, expect, it } from 'vitest';

import { resolveSocialMarkerLiveSource } from './social-marker-live-source';
import type { VenueFeedPost } from '../types';

const feedPost = { id: '1' } as VenueFeedPost;

describe('resolveSocialMarkerLiveSource', () => {
  it('treats an empty map as quiet, not as demo activity', () => {
    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: false,
        venueFeedPosts: [],
        venueLiveStatus: 'idle',
      }),
    ).toEqual({
      useLiveHeatmap: false,
      useLiveFeed: false,
      socketLive: false,
    });
  });

  it('does not invent activity when a selected venue has an empty feed', () => {
    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: false,
        venueFeedPosts: [],
        venueLiveStatus: 'unavailable',
      }),
    ).toEqual({
      useLiveHeatmap: false,
      useLiveFeed: false,
      socketLive: false,
    });
  });

  it('reports socketLive only while the venue socket is connected', () => {
    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: false,
        venueFeedPosts: [feedPost],
        venueLiveStatus: 'connected',
      }).socketLive,
    ).toBe(true);

    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: false,
        venueFeedPosts: [feedPost],
        venueLiveStatus: 'reconnecting',
      }).socketLive,
    ).toBe(false);
  });

  it('prefers live heatmap and live feed when those sources exist', () => {
    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: true,
        venueFeedPosts: [],
        venueLiveStatus: 'idle',
      }),
    ).toEqual({
      useLiveHeatmap: true,
      useLiveFeed: false,
      socketLive: false,
    });

    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: false,
        venueFeedPosts: [feedPost],
        venueLiveStatus: 'idle',
      }),
    ).toEqual({
      useLiveHeatmap: false,
      useLiveFeed: true,
      socketLive: false,
    });
  });
});
