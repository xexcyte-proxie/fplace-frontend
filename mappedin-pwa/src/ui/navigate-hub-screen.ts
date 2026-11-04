import { sortVenuesByNameDescending } from '../home/domain/home-venues';
import type { AppState } from '../types';
import { buildReturningHomeViewModel } from '../home/presentation/returning-home-data';
import type { RecentVenueVisit } from '../home/domain/entities';
import { escapeHtml } from './escape-html';
import { renderHomeVenueSections } from './home-venue-list';
import {
  renderBusyLabel,
  renderContentLoadingOverlay,
} from './content-loading-overlay';
import {
  firstVisitCameraIcon,
  firstVisitLocationIcon,
  renderFirstVisitArPrompt,
} from './first-visit-venue-screen';

function renderVenueChoice(
  venue: RecentVenueVisit,
  loading: boolean,
  mode: AppState['navigateVenuePickerMode'],
): string {
  const dataAttribute =
    mode === 'ar' ? 'data-navigate-ar-venue-id' : 'data-navigate-expect-venue-id';
  return `
    <button
      type="button"
      class="navigate-venue-choice"
      ${dataAttribute}="${escapeHtml(venue.id)}"
      ${loading ? 'disabled' : ''}
    >
      <span class="navigate-venue-choice-name">${escapeHtml(venue.name)}</span>
      <span class="navigate-venue-choice-meta">${escapeHtml(venue.visitedLabel)}</span>
    </button>
  `;
}

function renderVenuePickerDialog(options: {
  recentlyVisited: RecentVenueVisit[];
  otherVenues: RecentVenueVisit[];
  loading: boolean;
  mode: AppState['navigateVenuePickerMode'];
}): string {
  const venues = sortVenuesByNameDescending([...options.recentlyVisited, ...options.otherVenues]);
  const choices = venues.length
    ? venues
        .map((venue) => renderVenueChoice(venue, options.loading, options.mode))
        .join('')
    : '<p class="location-dialog-body">No venues are available right now.</p>';

  return `
    <div class="location-dialog-backdrop navigate-venue-picker" role="presentation">
      <div
        class="location-dialog navigate-venue-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="navigate-venue-picker-title"
      >
        <h2 id="navigate-venue-picker-title" class="location-dialog-title">Which venue?</h2>
        <div class="navigate-venue-choice-list">
          ${choices}
        </div>
        ${
          options.loading
            ? `<div class="navigate-venue-picker-loading" role="status" aria-live="polite">${renderBusyLabel('Loading venue')}</div>`
            : ''
        }
        <button
          type="button"
          id="navigate-venue-picker-cancel"
          class="navigate-venue-picker-cancel"
          ${options.loading ? 'disabled' : ''}
        >
          Cancel
        </button>
      </div>
    </div>
  `;
}

function selectedVenueName(state: Pick<AppState, 'forumVenues' | 'selectedVenueId'>): string {
  return (
    state.forumVenues.find((venue) => String(venue.id) === state.selectedVenueId)
      ?.name ?? 'Selected venue'
  );
}

function selectedSectionName(state: Pick<AppState, 'forumSections' | 'selectedGateId'>): string {
  return (
    state.forumSections.find((section) => String(section.id) === state.selectedGateId)
      ?.name ?? 'Entry zone'
  );
}

function locationCopy(
  state: Pick<AppState, 'locationPermission' | 'blueDotStatus' | 'userLocation'>,
): { label: string; body: string } {
  if (state.locationPermission === 'denied') {
    return {
      label: 'Location off',
      body: 'Search and plan manually, or enable location for live positioning.',
    };
  }
  if (state.blueDotStatus === 'active') {
    return {
      label: 'Live location ready',
      body: 'Use your location as your route’s start.',
    };
  }
  if (state.userLocation) {
    return {
      label: 'Approximate location available',
      body: '',
    };
  }
  return {
    label: 'Location not started',
    body: '',
  };
}

function routeStage(
  state: Pick<
    AppState,
    | 'route'
    | 'markers'
    | 'routeRemainingMeters'
    | 'routeTraveledMeters'
    | 'arrivalDialogOpen'
    | 'routeNotFound'
    | 'isCalculatingRoute'
  >,
): { label: string; body: string; tone: string } | null {
  if (state.arrivalDialogOpen) {
    return {
      label: 'Arrived',
      body: 'You reached your destination. Open the map for next actions nearby.',
      tone: 'success',
    };
  }
  if (state.routeRemainingMeters != null && state.routeTraveledMeters > 0) {
    return {
      label: 'Route in progress',
      body: `${Math.max(0, Math.round(state.routeRemainingMeters))} m remaining.`,
      tone: 'active',
    };
  }
  if (state.isCalculatingRoute) {
    return {
      label: 'Finding route',
      body: 'Checking the best indoor path for this venue.',
      tone: 'active',
    };
  }
  if (state.route) {
    return {
      label: 'Route ready',
      body: 'Choose a route on the map, then switch to AR.',
      tone: 'active',
    };
  }
  if (state.routeNotFound) {
    return {
      label: 'Route needs reset',
      body: 'Try a different start or destination point.',
      tone: 'warning',
    };
  }
  if (state.markers.destination) {
    return {
      label: 'Destination selected',
      body: state.markers.destinationLabel
        ? `Ready to route to ${state.markers.destinationLabel}.`
        : 'Choose a start point to calculate the route.',
      tone: 'active',
    };
  }
  return null;
}

export function renderNavigateHubScreen(state: AppState): string {
  const venueName = selectedVenueName(state);
  const sectionName = selectedSectionName(state);
  const location = locationCopy(state);
  const stage = routeStage(state);
  const floorLabel =
    state.floors.find((floor) => floor.id === state.currentFloorId)?.name ??
    state.floors[0]?.name ??
    'Venue floors';
  const venueContent = state.homeContent;
  const navigateLoading =
    venueContent == null ||
    state.mapStatus === 'initial' ||
    state.mapStatus === 'loading' ||
    state.navigateDiscoverVenuePickerLoading;
  const content = venueContent ?? {
    recentlyVisited: [],
    otherVenues: [],
    stats: { venues: 0, upvotesLabel: '0', posts: 0 },
  };
  const view = buildReturningHomeViewModel({
    displayName: '',
    searchQuery: state.homeVenueSearchQuery,
    content,
    profileStat: state.authUser?.stat,
  });
  const venueSections = venueContent
    ? renderHomeVenueSections({
        recentlyVisited: view.recentlyVisited,
        otherVenues: view.otherVenues,
        searching: Boolean(state.homeVenueSearchQuery.trim()),
      })
    : '';
  const venuePicker = state.navigateDiscoverVenuePickerOpen
    ? renderVenuePickerDialog({
        recentlyVisited: view.recentlyVisited,
        otherVenues: view.otherVenues,
        loading: state.navigateDiscoverVenuePickerLoading,
        mode: state.navigateVenuePickerMode,
      })
    : '';
  const arPrompt = renderFirstVisitArPrompt(state);

  return `
    <section class="navigate-hub-screen screen-loading-host" aria-label="Navigate">
      <header class="navigate-hub-hero">
        <p class="navigate-hub-eyebrow">Indoor navigation</p>
        <h1 class="navigate-hub-title">${escapeHtml(venueName)}</h1>
        <p class="navigate-hub-subtitle">${escapeHtml(sectionName)} · ${escapeHtml(floorLabel)}</p>
      </header>

      <div class="navigate-command-panel">
        ${stage ? `<div class="navigate-stage-card navigate-stage-card--${escapeHtml(stage.tone)}">
          <div>
            <p class="navigate-stage-label">${escapeHtml(stage.label)}</p>
            <p class="navigate-stage-body">${escapeHtml(stage.body)}</p>
          </div>
          <button type="button" id="navigate-open-map-btn" class="navigate-primary-btn">
            Open 2D map
          </button>
        </div>` : ''}

        <div class="navigate-search-card">
          <label class="navigate-search" data-tour-id="map-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.75"></circle>
              <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
            </svg>
            <input
              id="navigate-search-input"
              type="search"
              placeholder="Search venues"
              value="${escapeHtml(state.homeVenueSearchQuery)}"
              autocomplete="off"
              enterkeyhint="search"
            />
          </label>
        </div>

        <div class="first-visit-actions" role="group" aria-label="Quick actions">
          <button type="button" class="first-visit-action first-visit-action--discover" id="navigate-discover-btn">
            <span class="first-visit-action-icon" aria-hidden="true">
              ${firstVisitLocationIcon}
            </span>
            <span class="first-visit-action-title">Use 2D Map</span>
            <span class="first-visit-action-copy first-visit-action-copy--light">Browse venues before starting AR</span>
          </button>
          <button type="button" class="first-visit-action first-visit-action--ar" id="navigate-ar-btn">
            <span class="first-visit-action-icon" aria-hidden="true">
              ${firstVisitCameraIcon}
            </span>
            <span class="first-visit-action-title">Try AR</span>
            <span class="first-visit-action-copy">Point your camera to navigate</span>
          </button>
        </div>

        ${location.body ? `<div class="navigate-info-strip" role="status">
          <span class="navigate-info-dot" aria-hidden="true"></span>
          <span>${escapeHtml(location.body)}</span>
        </div>` : ''}

        <div class="returning-home-venues">
          ${venueSections}
        </div>
      </div>
      ${(state.venueSwitchStatus === 'loading' || state.venueSwitchStatus === 'slow') && state.venueSwitchMessage ? `<p role="status">${escapeHtml(state.venueSwitchMessage)}</p>` : ''}
      ${navigateLoading && state.venueSwitchStatus !== 'error' && state.venueSwitchStatus !== 'slow' && !state.navigateDiscoverVenuePickerOpen ? renderContentLoadingOverlay('Loading navigate') : ''}
      ${venuePicker}
      ${arPrompt}
    </section>
  `;
}
