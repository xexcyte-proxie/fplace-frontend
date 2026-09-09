import type { AppState, VenueLiveConnectionStatus } from '../types';

export interface SocialMarkerLiveSource {
  /** Heatmap rows from `section_heat_update` drive marker intensity. */
  useLiveHeatmap: boolean;
  /** REST + `new_post` venue feed is the source of truth for counts/previews. */
  useLiveFeed: boolean;
  /** True while the venue WebSocket is actually delivering live updates. */
  socketLive: boolean;
  /** Legacy mock posts — only in pure demo mode (no venue session at all). */
  useMockSocial: boolean;
}

function isLiveVenueStatus(
  status: VenueLiveConnectionStatus | undefined,
): boolean {
  return (
    status === 'connected' ||
    status === 'connecting' ||
    status === 'reconnecting'
  );
}

/**
 * Prefer venue WebSocket / REST social data over demo map markers.
 * Once a venue is selected (a real backend session), demo markers are never
 * shown again — an empty feed renders as genuinely quiet locations instead
 * of fake counts.
 */
export function resolveSocialMarkerLiveSource(
  state: Pick<
    AppState,
    | 'sectionHeatmapActive'
    | 'venueFeedPosts'
    | 'socialPosts'
    | 'venueLiveStatus'
    | 'selectedVenueId'
  > | null,
): SocialMarkerLiveSource {
  const useLiveHeatmap = Boolean(state?.sectionHeatmapActive);
  const useLiveFeed = (state?.venueFeedPosts?.length ?? 0) > 0;
  const hasVenueSession = Boolean(state?.selectedVenueId);
  const liveSession =
    useLiveHeatmap || useLiveFeed || isLiveVenueStatus(state?.venueLiveStatus);
  return {
    useLiveHeatmap,
    useLiveFeed,
    socketLive: state?.venueLiveStatus === 'connected',
    useMockSocial: !liveSession && !hasVenueSession,
  };
}
