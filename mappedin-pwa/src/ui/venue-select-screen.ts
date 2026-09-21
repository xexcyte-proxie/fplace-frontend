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
    | 'forumVenues'
    | 'forumSections'
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
    state.selectedVenueId != null
      ? state.forumSections
          .filter((section) => String(section.venue) === state.selectedVenueId)
          .map(sectionToOption)
      : [];

  const venueCards = venues
    .map((venue) => {
      const selected = venue.id === state.selectedVenueId;
      return `
        <button
          type="button"
          class="venue-select-card${selected ? ' venue-select-card--selected' : ''}"
          data-venue-id="${escapeHtml(venue.id)}"
          aria-pressed="${selected ? 'true' : 'false'}"
          ${state.authLoading ? 'disabled' : ''}
        >
          <span class="venue-select-card-icon" aria-hidden="true">
            ${pinIcon()}
          </span>
          <span class="venue-select-card-copy">
            <span class="venue-select-card-title">${escapeHtml(venue.name)}</span>
            <span class="venue-select-card-subtitle">${escapeHtml(venue.subtitle)}</span>
          </span>
          <span class="venue-select-card-check" aria-hidden="true">
            ${selected ? selectedCheckIcon() : idleCheckIcon()}
          </span>
        </button>
      `;
    })
    .join('');

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
  const enteringVenue = state.authLoading && !venuesLoading && !gatesLoading;

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

      <div class="auth-header">
        <h1 class="auth-title auth-title--sans">Where are you today?</h1>
        <p class="auth-subtitle">
          Select your venue, then your entry gate.
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
            value="${escapeHtml(state.venueSearchQuery)}"
            autocomplete="off"
            ${state.authLoading ? 'disabled' : ''}
          />
        </label>

        <section class="venue-select-section" aria-labelledby="venue-select-venues-heading">
          <h2 id="venue-select-venues-heading" class="venue-select-section-label">Select your venue</h2>
          <div class="venue-select-list screen-loading-host" role="group" aria-label="Venues">
            ${venueCards || venuesEmpty}
            ${venuesLoading ? renderContentLoadingOverlay('Loading venues') : ''}
          </div>
        </section>

        ${
          state.selectedVenueId && !venuesLoading
            ? `
        <section class="venue-select-section" aria-labelledby="venue-select-gates-heading">
          <h2 id="venue-select-gates-heading" class="venue-select-section-label">Select your entry gate</h2>
          <div class="venue-select-list screen-loading-host" role="group" aria-label="Entry gates">
            ${
              sectionCards ||
              (gatesLoading
                ? ''
                : `<p class="venue-select-empty">No entry gates for this venue.</p>`)
            }
            ${gatesLoading ? renderContentLoadingOverlay('Loading entry gates') : ''}
          </div>
        </section>
        `
            : ''
        }
      </div>

      <div class="auth-actions venue-select-actions">
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
