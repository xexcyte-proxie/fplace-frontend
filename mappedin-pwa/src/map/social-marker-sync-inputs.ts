import type { AppState } from '../types';

/** Store fields that can change social map marker HTML. */
export type SocialMarkerSyncInputs = Pick<
  AppState,
  | 'socialLocation'
  | 'sectionHeatmap'
  | 'sectionHeatmapActive'
  | 'forumSections'
  | 'venueFeedPosts'
  | 'venueLiveStatus'
  | 'selectedVenueId'
>;

export function socialMarkerSyncInputsFromState(
  state: AppState,
): SocialMarkerSyncInputs {
  return {
    socialLocation: state.socialLocation,
    sectionHeatmap: state.sectionHeatmap,
    sectionHeatmapActive: state.sectionHeatmapActive,
    forumSections: state.forumSections,
    venueFeedPosts: state.venueFeedPosts,
    venueLiveStatus: state.venueLiveStatus,
    selectedVenueId: state.selectedVenueId,
  };
}

/**
 * GPS / live-nav patches reuse the same feed and heatmap arrays. Skip the
 * expensive join-key + marker reinstall when those references are unchanged.
 */
export function socialMarkerSyncInputsUnchanged(
  previous: SocialMarkerSyncInputs | null,
  next: SocialMarkerSyncInputs,
): boolean {
  if (!previous) return false;
  return (
    Object.is(previous.socialLocation, next.socialLocation) &&
    Object.is(previous.sectionHeatmap, next.sectionHeatmap) &&
    Object.is(previous.sectionHeatmapActive, next.sectionHeatmapActive) &&
    Object.is(previous.forumSections, next.forumSections) &&
    Object.is(previous.venueFeedPosts, next.venueFeedPosts) &&
    Object.is(previous.venueLiveStatus, next.venueLiveStatus) &&
    Object.is(previous.selectedVenueId, next.selectedVenueId)
  );
}
