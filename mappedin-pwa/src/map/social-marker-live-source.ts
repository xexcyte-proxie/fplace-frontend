import type { AppState } from '../types';

export interface SocialMarkerLiveSource {
  /** Heatmap rows from `section_heat_update` drive marker intensity. */
  useLiveHeatmap: boolean;
  /** REST + `new_post` venue feed is the source of truth for counts/previews. */
  useLiveFeed: boolean;
  /** True while the venue WebSocket is actually delivering live updates. */
  socketLive: boolean;
}

/**
 * Map markers only reflect live heatmap / venue-feed data.
 * An empty feed is a quiet venue — never fabricated post counts.
 */
export function resolveSocialMarkerLiveSource(
  state: Pick<
    AppState,
    'sectionHeatmapActive' | 'venueFeedPosts' | 'venueLiveStatus'
  > | null,
): SocialMarkerLiveSource {
  return {
    useLiveHeatmap: Boolean(state?.sectionHeatmapActive),
    useLiveFeed: (state?.venueFeedPosts?.length ?? 0) > 0,
    socketLive: state?.venueLiveStatus === 'connected',
  };
}
