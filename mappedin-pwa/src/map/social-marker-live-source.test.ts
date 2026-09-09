import { describe, expect, it } from 'vitest';

import { resolveSocialMarkerLiveSource } from './social-marker-live-source';
import type { VenueFeedPost } from '../types';

const feedPost = { id: '1' } as VenueFeedPost;

describe('resolveSocialMarkerLiveSource', () => {
  it('uses mock social posts only before any venue session exists', () => {
    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: false,
        venueFeedPosts: [],
        socialPosts: [],
        venueLiveStatus: 'idle',
        selectedVenueId: null,
      }),
    ).toEqual({
      useLiveHeatmap: false,
      useLiveFeed: false,
      socketLive: false,
      useMockSocial: true,
    });
  });

  it('never falls back to mock markers once a venue is selected', () => {
    // Empty feed + broken socket (e.g. wss unavailable) must render as a
    // genuinely quiet venue, not as fake demo counts labelled "live".
    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: false,
        venueFeedPosts: [],
        socialPosts: [],
        venueLiveStatus: 'unavailable',
        selectedVenueId: '3',
      }).useMockSocial,
    ).toBe(false);
  });

  it('reports socketLive only while the venue socket is connected', () => {
    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: false,
        venueFeedPosts: [feedPost],
        socialPosts: [],
        venueLiveStatus: 'connected',
        selectedVenueId: '3',
      }).socketLive,
    ).toBe(true);

    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: false,
        venueFeedPosts: [feedPost],
        socialPosts: [],
        venueLiveStatus: 'reconnecting',
        selectedVenueId: '3',
      }).socketLive,
    ).toBe(false);
  });

  it('prefers live heatmap, live feed, and an open venue socket over demo markers', () => {
    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: true,
        venueFeedPosts: [],
        socialPosts: [],
        venueLiveStatus: 'idle',
        selectedVenueId: null,
      }).useMockSocial,
    ).toBe(false);

    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: false,
        venueFeedPosts: [feedPost],
        socialPosts: [],
        venueLiveStatus: 'idle',
        selectedVenueId: null,
      }),
    ).toEqual({
      useLiveHeatmap: false,
      useLiveFeed: true,
      socketLive: false,
      useMockSocial: false,
    });

    expect(
      resolveSocialMarkerLiveSource({
        sectionHeatmapActive: false,
        venueFeedPosts: [],
        socialPosts: [],
        venueLiveStatus: 'connected',
        selectedVenueId: null,
      }).useMockSocial,
    ).toBe(false);
  });
});
