import type { AppState } from '../types';
import {
  remoteArEnabled,
  userVenuePresence,
  venuePresenceAnchor,
} from '../location/domain/venue-presence';
import { buildArNavigationViewModel } from './ar-navigation-data';
import { escapeHtml } from './escape-html';
import { formatUnreadBadge } from './notifications-data';
import { buildRouteSheetSummary } from './route-summary';

/**
 * High-frequency fields written while a route is active. Updating these must
 * not rebuild the chrome (bottom nav, buttons) or the overlay flickers.
 */
export const LIVE_NAVIGATION_TELEMETRY_KEYS = [
  'routeTraveledMeters',
  'routeRemainingMeters',
  'blueDotStatus',
  'blueDotFollowing',
  'routeInstructions',
  'currentLegIndex',
] as const satisfies readonly (keyof AppState)[];

export const TOAST_PATCH_KEYS = ['toast'] as const satisfies readonly (keyof AppState)[];

export const SEARCH_PATCH_KEYS = [
  'searchQuery',
  'searchResults',
  'isSearching',
  'categoryFilter',
  'userLocation',
  'locationPermission',
] as const satisfies readonly (keyof AppState)[];

export const HOME_SEARCH_PATCH_KEYS = [
  'homeVenueSearchQuery',
] as const satisfies readonly (keyof AppState)[];

export const HEATMAP_PATCH_KEYS = [
  'sectionHeatmap',
  'sectionHeatmapActive',
  'venueLiveStatus',
  'locationLiveStatus',
] as const satisfies readonly (keyof AppState)[];

/** Live forum / conversation payloads that social markers also read. */
export const SOCIAL_LIVE_KEYS = [
  'venueFeedPosts',
  'venueOnlineCount',
  'upvotedPostIds',
  'flaggedPostIds',
  'venueLiveStatus',
  'locationLiveStatus',
  'authUser',
  'forumFeedNext',
  'forumFeedCount',
  'venueFeedLoading',
  'venueFeedLoadingMore',
] as const satisfies readonly (keyof AppState)[];

export const NOTIFICATION_LIVE_KEYS = [
  'notifications',
  'notificationsUnreadCount',
  'notificationsNext',
  'notificationsLoading',
  'notificationsMarkingAll',
  'notificationDetail',
  'notificationDetailLoading',
  'notificationDetailError',
] as const satisfies readonly (keyof AppState)[];

/** Backend trial flags: nothing in the map chrome reads these. */
export const SILENT_PATCH_KEYS = [
  'guestHasTried2dView',
  'guestHasTriedArView',
] as const satisfies readonly (keyof AppState)[];

export type UiPatchKind =
  | 'live'
  | 'toast'
  | 'search'
  | 'home-search'
  | 'venue-select-gate'
  | 'social-feed'
  | 'notify-badge'
  | 'heatmap-map'
  | 'silent'
  | 'full';

/** Gate selection on venue-select: update cards/CTA without rebuilding chrome. */
export const VENUE_SELECT_GATE_PATCH_KEYS = [
  'selectedGateId',
  'authFieldErrors',
] as const satisfies readonly (keyof AppState)[];

/** Map download / WebGL boot: must not rebuild onboarding or home. */
export const MAP_BOOT_PATCH_KEYS = [
  'mapStatus',
  'mapError',
  'loadingMessage',
  'loadingProgress',
  'currentFloorId',
  'searchChips',
  'floors',
  'mapLanguages',
  'mapLanguageCode',
  'mapLanguageName',
] as const satisfies readonly (keyof AppState)[];

const LIVE_NAVIGATION_TELEMETRY_KEY_SET = new Set<string>(
  LIVE_NAVIGATION_TELEMETRY_KEYS,
);
const TOAST_PATCH_KEY_SET = new Set<string>(TOAST_PATCH_KEYS);
const SEARCH_PATCH_KEY_SET = new Set<string>(SEARCH_PATCH_KEYS);
const HOME_SEARCH_PATCH_KEY_SET = new Set<string>(HOME_SEARCH_PATCH_KEYS);
const VENUE_SELECT_GATE_PATCH_KEY_SET = new Set<string>(
  VENUE_SELECT_GATE_PATCH_KEYS,
);
const HEATMAP_PATCH_KEY_SET = new Set<string>(HEATMAP_PATCH_KEYS);
const SOCIAL_LIVE_KEY_SET = new Set<string>(SOCIAL_LIVE_KEYS);
const NOTIFICATION_LIVE_KEY_SET = new Set<string>(NOTIFICATION_LIVE_KEYS);
const SILENT_PATCH_KEY_SET = new Set<string>(SILENT_PATCH_KEYS);
const MAP_BOOT_PATCH_KEY_SET = new Set<string>(MAP_BOOT_PATCH_KEYS);
const SOCIAL_OR_HEATMAP_KEY_SET = new Set<string>([
  ...HEATMAP_PATCH_KEYS,
  ...SOCIAL_LIVE_KEYS,
]);

function changedKeys(previous: AppState, next: AppState): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (
      Object.is(previous[key as keyof AppState], next[key as keyof AppState])
    ) {
      continue;
    }
    changed.push(key);
  }
  return changed;
}

function isSubset(changed: string[], allowed: Set<string>): boolean {
  return changed.length > 0 && changed.every((key) => allowed.has(key));
}

function isShowingSocialFeed(state: AppState): boolean {
  return (
    state.activeTab === 'social' &&
    state.socialPageTab === 'live-feed' &&
    !state.notificationsOpen &&
    !state.postCommentsOpen
  );
}

function isShowingReturningHome(state: AppState): boolean {
  return state.activeTab === 'map' && state.navigateView === 'home';
}

export function classifyUiStateChange(
  previous: AppState,
  next: AppState,
): UiPatchKind {
  if (previous === next) return 'full';
  const changed = changedKeys(previous, next);
  if (changed.length === 0) return 'full';
  if (isSubset(changed, LIVE_NAVIGATION_TELEMETRY_KEY_SET)) return 'live';
  if (isSubset(changed, TOAST_PATCH_KEY_SET)) return 'toast';
  if (
    next.authStep === 'venue-select' &&
    changed.includes('selectedGateId') &&
    isSubset(changed, VENUE_SELECT_GATE_PATCH_KEY_SET)
  ) {
    return 'venue-select-gate';
  }
  if (isSubset(changed, SEARCH_PATCH_KEY_SET)) {
    return next.authStep === 'venue-select' ? 'full' : 'search';
  }
  if (isSubset(changed, HOME_SEARCH_PATCH_KEY_SET)) {
    return isShowingReturningHome(next) ? 'home-search' : 'silent';
  }
  if (isSubset(changed, NOTIFICATION_LIVE_KEY_SET)) {
    if (next.notificationsOpen) return 'full';
    if (
      isShowingSocialFeed(next) &&
      (changed.includes('notificationsUnreadCount') ||
        changed.includes('notifications'))
    ) {
      return 'notify-badge';
    }
    return 'silent';
  }
  if (isSubset(changed, HEATMAP_PATCH_KEY_SET)) {
    if (next.activeTab === 'map') return 'heatmap-map';
    if (isShowingSocialFeed(next)) return 'social-feed';
    if (next.activeTab === 'social') return 'full';
    return 'silent';
  }
  if (isSubset(changed, SOCIAL_LIVE_KEY_SET)) {
    if (isShowingSocialFeed(next)) return 'social-feed';
    if (next.activeTab === 'social') return 'full';
    if (next.activeTab === 'profile' && changed.includes('authUser')) {
      return 'full';
    }
    return 'silent';
  }
  if (isSubset(changed, SOCIAL_OR_HEATMAP_KEY_SET)) {
    if (isShowingSocialFeed(next)) return 'social-feed';
    if (next.activeTab === 'social') return 'full';
    if (next.activeTab === 'profile' && changed.includes('authUser')) {
      return 'full';
    }
    if (next.activeTab === 'map') return 'heatmap-map';
    return 'silent';
  }
  if (isSubset(changed, SILENT_PATCH_KEY_SET)) return 'silent';
  if (isSubset(changed, MAP_BOOT_PATCH_KEY_SET)) {
    if (!next.startupReady) return 'full';
    if (next.activeTab === 'profile' && next.profileView === 'language') {
      return 'full';
    }
    const showingMapCanvas =
      next.onboardingComplete &&
      next.activeTab === 'map' &&
      next.navigateView === 'map';
    const mapSurfaceChanged =
      previous.mapStatus !== next.mapStatus ||
      Boolean(previous.mapError) !== Boolean(next.mapError);
    if (showingMapCanvas && mapSurfaceChanged) return 'full';
    return 'silent';
  }
  return 'full';
}

export function myLocationFabPresentation(
  state: Pick<
    AppState,
    | 'blueDotStatus'
    | 'blueDotFollowing'
    | 'locationPermission'
    | 'userLocation'
    | 'selectedVenueId'
    | 'forumVenues'
  >,
  mapFallback?: { latitude?: number | null; longitude?: number | null } | null,
): {
  trackingActive: boolean;
  following: boolean;
  enabled: boolean;
  label: string;
} {
  const venue = state.forumVenues.find(
    (item) => String(item.id) === state.selectedVenueId,
  );
  const atVenue =
    userVenuePresence(
      state.locationPermission,
      state.userLocation,
      venuePresenceAnchor(venue, mapFallback),
    ) !== 'away';
  const trackingActive =
    atVenue &&
    state.blueDotStatus === 'active';
  const following = trackingActive && state.blueDotFollowing;
  return {
    trackingActive,
    following,
    // A stale venue-distance result must not prevent acquiring a fresh fix.
    enabled: true,
    label: !atVenue
      ? "My location — tap to check your current position"
      : state.blueDotStatus === 'error' || state.blueDotStatus === 'inactive'
        ? 'Location unavailable — tap to retry'
        : following
        ? 'Following your location'
        : trackingActive
          ? 'Live location active'
          : 'My location',
  };
}

export function routeNavigationPresencePresentation(
  state: Pick<
    AppState,
    | 'locationPermission'
    | 'userLocation'
    | 'selectedVenueId'
    | 'forumVenues'
  >,
  venueSimulationActive = false,
): {
  enabled: boolean;
  label: string;
} {
  const venue = state.forumVenues.find(
    (item) => String(item.id) === state.selectedVenueId,
  );
  const atVenue =
    userVenuePresence(
      state.locationPermission,
      state.userLocation,
      venue,
    ) !== 'away';
  const enabled = atVenue || venueSimulationActive || remoteArEnabled();
  return {
    enabled,
    label: enabled
      ? 'Start navigation'
      : "You're not at this venue",
  };
}

export function applyMyLocationFabPatch(
  root: ParentNode,
  state: Parameters<typeof myLocationFabPresentation>[0],
): void {
  const locationBtn = root.querySelector('#my-location-btn');
  if (!(locationBtn instanceof HTMLButtonElement)) return;
  const fab = myLocationFabPresentation(state);
  locationBtn.disabled = !fab.enabled;
  locationBtn.classList.toggle('fab--tracking', fab.trackingActive);
  locationBtn.classList.toggle('fab--following', fab.following);
  locationBtn.setAttribute('aria-label', fab.label);
  locationBtn.setAttribute('title', fab.label);
}

export function isLiveNavigationTelemetryOnlyChange(
  previous: AppState,
  next: AppState,
): boolean {
  return classifyUiStateChange(previous, next) === 'live';
}

function setTextContent(el: Element | null, value: string): void {
  if (!el || el.textContent === value) return;
  el.textContent = value;
}

export function liveTrackingMessage(state: Pick<AppState, 'blueDotStatus' | 'route'>): string {
  if (!state.route) return '';
  if (state.blueDotStatus === 'error') return 'Location unavailable. Check location permission and try again.';
  if (state.blueDotStatus === 'inactive') return 'Location signal is weak or lost. Waiting for an accurate location. The last known position may remain shown; progress is paused.';
  if (state.blueDotStatus === 'starting') return 'Finding your location…';
  return '';
}

/** Updates live numbers/classes in place. Call only when telemetry-only. */
export function applyLiveNavigationUiPatch(
  root: ParentNode,
  state: AppState,
): void {
  const summary = buildRouteSheetSummary(state);
  const warning = root.querySelector('.route-tracking-status');
  if (warning instanceof HTMLElement) {
    const message = liveTrackingMessage(state);
    setTextContent(warning, message);
    warning.hidden = !message;
  }
  setTextContent(root.querySelector('.route-sheet-time'), summary.walkTime);
  setTextContent(
    root.querySelector('.route-sheet-distance'),
    summary.walkDistance,
  );

  const arScreen = root.querySelector('.ar-nav-screen');
  if (arScreen) {
    const view = buildArNavigationViewModel(state);
    setTextContent(
      arScreen.querySelector('.ar-nav-guidance-primary'),
      view.guidancePrimary,
    );
    setTextContent(
      arScreen.querySelector('.ar-nav-guidance-secondary'),
      view.guidanceSecondary,
    );
    setTextContent(
      arScreen.querySelector('.ar-nav-stat-value--eta'),
      view.etaLabel,
    );
    setTextContent(
      arScreen.querySelector('.ar-nav-stat-value--distance'),
      view.distanceLabel,
    );
    setTextContent(
      arScreen.querySelector('.ar-nav-stat-value--arrive'),
      view.arriveLabel,
    );
  }

  applyMyLocationFabPatch(root, state);
}

/** Updates the social-tab notifications badge without rebuilding chrome. */
export function applyNotifyBadgeUiPatch(
  root: ParentNode,
  state: Pick<AppState, 'notificationsEnabled' | 'notificationsUnreadCount'>,
): void {
  const button = root.querySelector('#venue-feed-notify-btn');
  if (!(button instanceof HTMLElement)) return;

  const unread = state.notificationsUnreadCount;
  const label =
    unread > 0 ? `Notifications (${unread} unread)` : 'Notifications';
  button.setAttribute('aria-label', label);

  const existing = button.querySelector('.venue-feed-notify-badge');
  if (!state.notificationsEnabled || unread <= 0) {
    existing?.remove();
    return;
  }

  const badgeText = formatUnreadBadge(unread);
  if (existing) {
    setTextContent(existing, badgeText);
    return;
  }
  button.insertAdjacentHTML(
    'beforeend',
    `<span class="venue-feed-notify-badge">${escapeHtml(badgeText)}</span>`,
  );
}

export function renderToastHtml(message: string): string {
  return `<div class="toast" role="status">
              <div class="toast-icon" aria-hidden="true">
                <img
                  class="toast-icon-logo"
                  src="/onboarding/map-pin-logo.svg"
                  alt=""
                  width="22"
                  height="22"
                  decoding="async"
                />
              </div>
              <p class="toast-message">${escapeHtml(message)}</p>
            </div>`;
}

export function applyToastUiPatch(
  root: Element,
  toast: string | undefined,
): void {
  const existing = root.querySelector('.toast');
  if (!toast) {
    existing?.remove();
    return;
  }
  if (existing) {
    const message = existing.querySelector('.toast-message');
    if (message) message.textContent = toast;
    return;
  }
  root.insertAdjacentHTML('beforeend', renderToastHtml(toast));
}
