import type { AppState } from '../types';
import { escapeHtml } from './escape-html';
import { renderHomeVenueSections } from './home-venue-list';
import { buildSearchResultViews } from './search-results-data';

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
      body: 'Use your current position as the start point when you begin a route.',
    };
  }
  if (state.userLocation) {
    return {
      label: 'Approximate location available',
      body: 'Open the map to refine your indoor position.',
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
      body: 'Begin on the 2D map, then switch to AR when camera guidance helps.',
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

function searchPreview(state: AppState): string {
  if (!state.searchResults.length) {
    return `
      <div class="navigate-hub-empty">
        <span>Search destinations or use venue categories on the map.</span>
      </div>
    `;
  }

  return buildSearchResultViews(
    state.searchResults.slice(0, 3),
    state.locationPermission,
    state.userLocation,
  )
    .map(
      (result) => `
        <button
          type="button"
          class="navigate-destination-row"
          data-location-id="${escapeHtml(result.id)}"
          data-location-name="${escapeHtml(result.name)}"
          data-floor-name="${escapeHtml(result.floorName ?? '')}"
        >
          <span class="navigate-destination-pin" aria-hidden="true"></span>
          <span class="navigate-destination-copy">
            <span class="navigate-destination-name">${escapeHtml(result.name)}</span>
            ${
              result.distanceLabel || result.floorName
                ? `<span class="navigate-destination-meta">${escapeHtml(
                    [result.distanceLabel, result.floorName].filter(Boolean).join(' · '),
                  )}</span>`
                : ''
            }
          </span>
        </button>
      `,
    )
    .join('');
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
  const hasRoute = Boolean(state.route);
  const venueContent = state.homeContent;
  const venueSections = venueContent
    ? renderHomeVenueSections({
        recentlyVisited: venueContent.recentlyVisited,
        otherVenues: venueContent.otherVenues,
        searching: Boolean(state.homeVenueSearchQuery.trim()),
      })
    : '';

  return `
    <section class="navigate-hub-screen" aria-label="Navigate">
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
              placeholder="Search destination"
              value="${escapeHtml(state.searchQuery)}"
              autocomplete="off"
              enterkeyhint="search"
            />
          </label>
          <div class="navigate-destination-list">
            ${searchPreview(state)}
          </div>
        </div>

        <div class="navigate-action-grid" aria-label="Navigation actions">
          <button type="button" id="navigate-ar-btn" class="navigate-action navigate-action--ar">
            <span class="navigate-action-icon" aria-hidden="true">◈</span>
            <span class="navigate-action-title">Try AR</span>
            <span class="navigate-action-copy">${hasRoute ? 'Use camera guidance' : 'Available after route setup'}</span>
          </button>
          <button type="button" id="navigate-route-builder-btn" class="navigate-action">
            <span class="navigate-action-icon" aria-hidden="true">↔</span>
            <span class="navigate-action-title">Start and destination</span>
            <span class="navigate-action-copy">Set points on the 2D map</span>
          </button>
        </div>

        ${location.body ? `<div class="navigate-info-strip" role="status">
          <span class="navigate-info-dot" aria-hidden="true"></span>
          <span>${escapeHtml(location.body)}</span>
        </div>` : ''}

        <div class="navigate-venue-card">
          <div class="returning-home-venues">
            ${venueSections}
          </div>
        </div>
      </div>
    </section>
  `;
}
