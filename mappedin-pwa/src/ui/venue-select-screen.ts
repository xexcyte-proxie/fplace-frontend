import type { AppState } from '../types';
import { renderBusyLabel, renderContentLoadingOverlay } from './content-loading-overlay';
import { escapeHtml } from './escape-html';
import {
  sectionToOption,
  venuesForPicker,
} from './venue-select-data';

function selectedCheckIcon(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function idleCheckIcon(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9.25" stroke="currentColor" stroke-width="1.5"/></svg>`;
}

function backChevronIcon(): string {
  return `<svg class="auth-back-icon" width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M13.75 16.5L8.25 11L13.75 5.5" stroke="currentColor" stroke-width="1.83333" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * Gate taps only change selection chrome. Patch in place so the back button
 * and scroll host are not torn down on every click.
 */
export function applyVenueSelectGatePatch(
  root: ParentNode,
  state: Pick<
    AppState,
    'selectedGateId' | 'selectedVenueId' | 'authLoading' | 'authFieldErrors'
  >,
): void {
  const screen = root.querySelector('.venue-select-screen');
  if (!screen) return;

  if (!state.authFieldErrors._form) {
    screen.querySelector('.auth-form-error')?.remove();
  }

  for (const button of screen.querySelectorAll<HTMLButtonElement>(
    '[data-gate-id]',
  )) {
    const selected = button.dataset.gateId === state.selectedGateId;
    button.classList.toggle('venue-select-card--selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    const check = button.querySelector('.venue-select-card-check');
    if (check) {
      check.innerHTML = selected ? selectedCheckIcon() : idleCheckIcon();
    }
  }

  const enter = screen.querySelector<HTMLButtonElement>(
    '#venue-select-enter-btn',
  );
  if (enter) {
    enter.disabled =
      state.authLoading || !state.selectedVenueId || !state.selectedGateId;
  }
}

function pinIcon(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-5.33 7-11a7 7 0 1 0-14 0c0 5.67 7 11 7 11Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="2"/></svg>`;
}

function searchIcon(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

export function renderVenueSelectScreen(
  state: Pick<
    AppState,
    | 'venueSearchQuery'
    | 'selectedVenueId'
    | 'selectedGateId'
    | 'selectedFloorId'
    | 'forumVenues'
    | 'forumSections'
    | 'forumFloors'
    | 'authLoading'
    | 'authFieldErrors'
    | 'locationPermission'
    | 'userLocation'
  >,
): string {
  const generalError = state.authFieldErrors._form ?? '';
  const venues = venuesForPicker(
    state.forumVenues,
    state.venueSearchQuery,
    state.locationPermission,
    state.userLocation,
  );
  const sections =
    state.selectedFloorId != null
      ? state.forumSections
          .filter((section) => String(section.floor) === state.selectedFloorId)
          .filter((section) => String(section.venue) === state.selectedVenueId)
          .map(sectionToOption)
      : [];
  // Keep the renderer tolerant of partial state used during the first render
  // (and by lightweight callers/tests before the catalog has arrived).
  const floors = state.forumFloors ?? [];

  const sectionCards = sections
    .map((section) => {
      const selected = section.id === state.selectedGateId;
      return `
        <button
          type="button"
          class="venue-select-card${selected ? ' venue-select-card--selected' : ''}"
          data-gate-id="${escapeHtml(section.id)}"
          aria-pressed="${selected ? 'true' : 'false'}"
          ${state.authLoading ? 'disabled' : ''}
        >
          <span class="venue-select-gate-badge" aria-hidden="true">${escapeHtml(section.letter)}</span>
          <span class="venue-select-card-copy">
            <span class="venue-select-card-title">${escapeHtml(section.name)}</span>
            <span class="venue-select-card-subtitle">${escapeHtml(section.subtitle)}</span>
          </span>
          <span class="venue-select-card-check" aria-hidden="true">
            ${selected ? selectedCheckIcon() : idleCheckIcon()}
          </span>
        </button>
      `;
    })
    .join('');

  const venuesLoading = state.authLoading && state.forumVenues.length === 0;
  const gatesLoading =
    Boolean(state.selectedVenueId) &&
    state.authLoading &&
    sections.length === 0 &&
    !venuesLoading;
  const floorsLoading =
    Boolean(state.selectedVenueId) &&
    state.authLoading &&
    floors.length === 0 &&
    !venuesLoading;
  const enteringVenue = state.authLoading && !venuesLoading && !gatesLoading;

  const sectionChoices = state.selectedFloorId
    ? `<div class="venue-select-children venue-select-section" aria-labelledby="venue-select-gates-heading">
        <h3 id="venue-select-gates-heading" class="venue-select-section-label">Select your section</h3>
        <div class="venue-select-list screen-loading-host" role="group" aria-label="Entry gates">
          ${sectionCards || (gatesLoading ? '' : '<p class="venue-select-empty">No sections for this floor.</p>')}
          ${gatesLoading ? renderContentLoadingOverlay('Loading sections') : ''}
        </div>
      </div>`
    : '';
  const availableFloors = floors.filter((floor) => String(floor.venue) === state.selectedVenueId);
  const floorButton = (floor: (typeof floors)[number]): string => {
    const selected = String(floor.id) === state.selectedFloorId;
    return `<button type="button" class="venue-select-card${selected ? ' venue-select-card--selected' : ''}" data-floor-id="${floor.id}" aria-pressed="${selected}" ${state.authLoading ? 'disabled' : ''}>
      <span class="venue-select-card-copy"><span class="venue-select-card-title">${escapeHtml(floor.name)}</span></span>
      <span class="venue-select-card-check" aria-hidden="true">${selected ? selectedCheckIcon() : idleCheckIcon()}</span>
    </button>`;
  };
  const floorChoices = `<div class="venue-select-children venue-select-section" aria-labelledby="venue-select-floors-heading">
    <h3 id="venue-select-floors-heading" class="venue-select-section-label">Select your floor</h3>
    <div class="venue-select-list screen-loading-host" role="group" aria-label="Floors">
      ${availableFloors.map((floor) => `<div class="venue-select-branch">${floorButton(floor)}${String(floor.id) === state.selectedFloorId ? sectionChoices : ''}</div>`).join('')}
      ${floorsLoading ? renderContentLoadingOverlay('Loading floors') : availableFloors.length ? '' : '<p class="venue-select-empty">No floors for this venue.</p>'}
    </div>
  </div>`;
  const venueButton = (venue: (typeof venues)[number]): string => {
    const selected = venue.id === state.selectedVenueId;
    return `<button type="button" class="venue-select-card${selected ? ' venue-select-card--selected' : ''}" data-venue-id="${escapeHtml(venue.id)}" aria-pressed="${selected}" ${state.authLoading ? 'disabled' : ''}>
      <span class="venue-select-card-icon" aria-hidden="true">${pinIcon()}</span>
      <span class="venue-select-card-copy"><span class="venue-select-card-title">${escapeHtml(venue.name)}</span><span class="venue-select-card-subtitle">${escapeHtml(venue.subtitle)}</span></span>
      <span class="venue-select-card-check" aria-hidden="true">${selected ? selectedCheckIcon() : idleCheckIcon()}</span>
    </button>`;
  };
  const venueCards = venues.map((venue) => `<div class="venue-select-branch">${venueButton(venue)}${venue.id === state.selectedVenueId ? floorChoices : ''}</div>`).join('');

  const venuesEmpty = venuesLoading
    ? ''
    : venues.length
      ? ''
      : state.forumVenues.length
        ? `<p class="venue-select-empty">No venues match your search.</p>`
        : `<p class="venue-select-empty">No venues available right now.</p>`;

  return `
    <div class="auth-screen venue-select-screen">
      <button type="button" id="venue-select-back-btn" class="auth-back-btn" aria-label="Back">
        ${backChevronIcon()}
      </button>

      <div class="auth-header"><p class="venue-picker-eyebrow"><span>fplaces</span> · Explore a place</p>
        <h1 class="auth-title auth-title--sans">Where are you today?</h1>
        <p class="auth-subtitle">
          Select your venue, floor, then section.
        </p>
      </div>

      <div class="venue-select-body">
        ${
          generalError
            ? `<p class="auth-form-error" role="alert">${escapeHtml(generalError)}</p>`
            : ''
        }

        <label class="venue-select-search">
          <span class="venue-select-search-icon" aria-hidden="true">
            ${searchIcon()}
          </span>
          <input
            id="venue-select-search-input"
            type="search"
            class="venue-select-search-input"
            placeholder="Search venues"
            aria-label="Search venues"
            value="${escapeHtml(state.venueSearchQuery)}"
            autocomplete="off"
            ${state.authLoading ? 'disabled' : ''}
          />
        </label>

        <section class="venue-select-section venue-select-mobile-tree" aria-labelledby="venue-select-venues-heading">
          <h2 id="venue-select-venues-heading" class="venue-select-section-label">Select your venue</h2>
          <div class="venue-select-list screen-loading-host" role="group" aria-label="Venues">
            ${venueCards || venuesEmpty}
            ${venuesLoading ? renderContentLoadingOverlay('Loading venues') : ''}
          </div>
        </section>

        <div class="venue-picker-workspace">
          <section class="venue-picker-column" aria-labelledby="desktop-venues-heading">
            <header class="venue-picker-column-header"><span class="venue-picker-step" aria-hidden="true">01</span><div><h2 id="desktop-venues-heading">Your venue</h2><p>Find your place.</p></div></header>
            <div class="venue-picker-options venue-select-list screen-loading-host" role="group" aria-label="Choose a venue">
              ${venues.map(venueButton).join('') || venuesEmpty}
              ${venuesLoading ? renderContentLoadingOverlay('Loading venues') : ''}
            </div>
          </section>
          <section class="venue-picker-column${state.selectedVenueId ? '' : ' venue-picker-column--waiting'}" aria-labelledby="desktop-floors-heading">
            <header class="venue-picker-column-header"><span class="venue-picker-step" aria-hidden="true">02</span><div><h2 id="desktop-floors-heading">Your floor</h2><p>One level closer.</p></div></header>
            <div class="venue-picker-options venue-select-list screen-loading-host" role="group" aria-label="Choose a floor">
              ${state.selectedVenueId ? availableFloors.map(floorButton).join('') || (floorsLoading ? '' : '<p class="venue-picker-empty">No floors available for this venue.</p>') : '<p class="venue-picker-empty">Select a venue to see its floors.</p>'}
              ${floorsLoading ? renderContentLoadingOverlay('Loading floors') : ''}
            </div>
          </section>
          <section class="venue-picker-column${state.selectedFloorId ? '' : ' venue-picker-column--waiting'}" aria-labelledby="desktop-sections-heading">
            <header class="venue-picker-column-header"><span class="venue-picker-step" aria-hidden="true">03</span><div><h2 id="desktop-sections-heading">Your section</h2><p>Make it your starting point.</p></div></header>
            <div class="venue-picker-options venue-select-list screen-loading-host" role="group" aria-label="Choose a section">
              ${state.selectedFloorId ? sectionCards || (gatesLoading ? '' : '<p class="venue-picker-empty">No sections available for this floor.</p>') : '<p class="venue-picker-empty">Select a floor to see its sections.</p>'}
              ${gatesLoading && state.selectedFloorId ? renderContentLoadingOverlay('Loading sections') : ''}
            </div>
          </section>
        </div>
      </div>

      <div class="auth-actions venue-select-actions">
        <div class="venue-picker-footer-copy"><strong>Your next discovery starts here.</strong><p>Choose your venue, floor and section, then head inside.</p></div>
        <button
          type="button"
          id="venue-select-enter-btn"
          class="auth-cta-primary auth-submit-btn${enteringVenue ? ' is-loading' : ''}"
          ${state.authLoading || !state.selectedVenueId || !state.selectedGateId ? 'disabled' : ''}
          aria-busy="${enteringVenue ? 'true' : 'false'}"
        >
          ${enteringVenue ? renderBusyLabel('Entering venue…') : 'Enter venue'}
        </button>
      </div>
    </div>
  `;
}
