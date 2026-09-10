import type { AppState } from '../types';
import { buildArNavigationViewModel } from './ar-navigation-data';
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

export const HEATMAP_PATCH_KEYS = [
  'sectionHeatmap',
  'sectionHeatmapActive',
  'venueLiveStatus',
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
  | 'heatmap-map'
  | 'silent'
  | 'full';

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
const HEATMAP_PATCH_KEY_SET = new Set<string>(HEATMAP_PATCH_KEYS);
const SILENT_PATCH_KEY_SET = new Set<string>(SILENT_PATCH_KEYS);
const MAP_BOOT_PATCH_KEY_SET = new Set<string>(MAP_BOOT_PATCH_KEYS);

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

export function classifyUiStateChange(
  previous: AppState,
  next: AppState,
): UiPatchKind {
  if (previous === next) return 'full';
  const changed = changedKeys(previous, next);
  if (changed.length === 0) return 'full';
  if (isSubset(changed, LIVE_NAVIGATION_TELEMETRY_KEY_SET)) return 'live';
  if (isSubset(changed, TOAST_PATCH_KEY_SET)) return 'toast';
  if (isSubset(changed, SEARCH_PATCH_KEY_SET)) {
    return next.authStep === 'venue-select' ? 'full' : 'search';
  }
  if (isSubset(changed, HEATMAP_PATCH_KEY_SET)) {
    return next.activeTab === 'map' ? 'heatmap-map' : 'full';
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
  state: Pick<AppState, 'blueDotStatus' | 'blueDotFollowing'>,
): {
  trackingActive: boolean;
  following: boolean;
  label: string;
} {
  const trackingActive =
    state.blueDotStatus === 'active' || state.blueDotStatus === 'inactive';
  const following = state.blueDotFollowing;
  return {
    trackingActive,
    following,
    label: following
      ? 'Following your location'
      : trackingActive
        ? 'Live location active'
        : 'My location',
  };
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

/** Updates live numbers/classes in place. Call only when telemetry-only. */
export function applyLiveNavigationUiPatch(
  root: ParentNode,
  state: AppState,
): void {
  const summary = buildRouteSheetSummary(state);
  setTextContent(root.querySelector('.route-sheet-time'), summary.walkTime);
  setTextContent(
    root.querySelector('.route-sheet-distance'),
    summary.walkDistance,
  );

  const arScreen = root.querySelector('.ar-nav-screen');
  if (arScreen) {
    const view = buildArNavigationViewModel(state);
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

  const locationBtn = root.querySelector('#my-location-btn');
  if (locationBtn instanceof Element) {
    const fab = myLocationFabPresentation(state);
    locationBtn.classList.toggle('fab--tracking', fab.trackingActive);
    locationBtn.classList.toggle('fab--following', fab.following);
    locationBtn.setAttribute('aria-label', fab.label);
    locationBtn.setAttribute('title', fab.label);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
