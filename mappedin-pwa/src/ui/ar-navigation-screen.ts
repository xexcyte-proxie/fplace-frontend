import type { AppState } from '../types';
import { buildArNavigationViewModel } from './ar-navigation-data';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderArNavigationScreen(
  state: Pick<
    AppState,
    | 'route'
    | 'markers'
    | 'floors'
    | 'routeInstructions'
    | 'routeRemainingMeters'
    | 'routeTraveledMeters'
    | 'routeSimulating'
    | 'routeSimulationComplete'
  >,
): string {
  const view = buildArNavigationViewModel(state);

  return `
    <div class="ar-nav-screen" role="dialog" aria-label="AR navigation">
      <header class="ar-nav-top">
        <button
          type="button"
          id="ar-nav-close-btn"
          class="ar-nav-icon-btn"
          aria-label="Close AR navigation"
        >
          <span class="ar-nav-icon-btn-glyph" aria-hidden="true">×</span>
        </button>
        <div class="ar-nav-status" aria-live="polite">
          <span class="ar-nav-status-dot" aria-hidden="true"></span>
          <span class="ar-nav-status-label">AR mode active</span>
        </div>
        <button
          type="button"
          id="ar-nav-minimize-btn"
          class="ar-nav-icon-btn"
          aria-label="Minimize Live View"
        >
          <span class="ar-nav-icon-btn-glyph" aria-hidden="true">↓</span>
        </button>
      </header>

      <div class="ar-nav-guidance" aria-live="polite">
        <div class="ar-nav-guidance-arrow" aria-hidden="true">↑</div>
        <div class="ar-nav-guidance-copy">
          <p class="ar-nav-guidance-primary">${escapeHtml(view.guidancePrimary)}</p>
          <p class="ar-nav-guidance-secondary">${escapeHtml(view.guidanceSecondary)}</p>
        </div>
      </div>

      <section class="ar-nav-sheet">
        <div class="ar-nav-sheet-handle" aria-hidden="true"></div>
        <div class="ar-nav-destination">
          <div class="ar-nav-destination-icon" aria-hidden="true">◎</div>
          <div class="ar-nav-destination-copy">
            <h2 class="ar-nav-destination-title">${escapeHtml(view.destinationTitle)}</h2>
            <p class="ar-nav-destination-subtitle">${escapeHtml(view.destinationSubtitle)}</p>
          </div>
        </div>
        <div class="ar-nav-stats" role="group" aria-label="Route stats">
          <div class="ar-nav-stat">
            <span class="ar-nav-stat-label">ETA</span>
            <span class="ar-nav-stat-value">${escapeHtml(view.etaLabel)}</span>
          </div>
          <div class="ar-nav-stat">
            <span class="ar-nav-stat-label">Distance</span>
            <span class="ar-nav-stat-value">${escapeHtml(view.distanceLabel)}</span>
          </div>
          <div class="ar-nav-stat">
            <span class="ar-nav-stat-label">Arrive</span>
            <span class="ar-nav-stat-value">${escapeHtml(view.arriveLabel)}</span>
          </div>
        </div>
        <button type="button" id="ar-nav-end-btn" class="ar-nav-end-btn">
          End navigation
        </button>
      </section>
    </div>
  `;
}
