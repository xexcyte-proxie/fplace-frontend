import type { AppState } from '../types';
import type { MapApp } from '../services/map-app';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export class UiRoot {
  private readonly root: HTMLElement;

  constructor(container: HTMLElement) {
    this.root = container;
    this.root.className = 'ui-root';
  }

  render(state: AppState, app: MapApp): void {
    const showOverlays = state.mapStatus === 'ready' && !state.isArOpen;

    this.root.innerHTML = `
      ${this.loadingOverlay(state)}
      ${showOverlays ? this.searchBar(state, app) : ''}
      ${showOverlays && state.searchResults.length ? this.searchResults(state, app) : ''}
      ${showOverlays ? this.fabs(state, app) : ''}
      ${showOverlays && !state.showRouteSheet ? this.routeHintBar(state, app) : ''}
      ${showOverlays && state.showRouteSheet && state.route ? this.routeSheet(state, app) : ''}
      ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ''}
      ${state.isArOpen ? this.arChrome(app) : ''}
    `;

    this.bindEvents(app);
  }

  private loadingOverlay(state: AppState): string {
    if (state.mapStatus === 'ready') return '';
    const isError = state.mapStatus === 'error';
    return `
      <div class="loading-overlay ${isError ? 'loading-overlay--error' : ''}">
        ${isError ? '<div class="loading-icon">⚠️</div>' : '<div class="spinner"></div>'}
        <p class="loading-text">${escapeHtml(state.loadingMessage)}</p>
        ${!isError ? `<p class="loading-sub">Status: ${escapeHtml(state.mapStatus)}</p>` : ''}
      </div>
    `;
  }

  private searchBar(state: AppState, _app: MapApp): string {
    return `
      <div class="search-bar">
        <span class="search-icon">⌕</span>
        <input
          id="search-input"
          type="search"
          placeholder="Search a store or place…"
          value="${escapeHtml(state.searchQuery)}"
          autocomplete="off"
        />
        ${state.searchQuery ? '<button type="button" id="search-clear" class="icon-btn" aria-label="Clear search">×</button>' : ''}
      </div>
    `;
  }

  private searchResults(state: AppState, _app: MapApp): string {
    const items = state.searchResults
      .map(
        (r) => `
          <button type="button" class="search-result" data-location-id="${escapeHtml(r.id)}" data-location-name="${escapeHtml(r.name)}">
            <span class="search-result-name">${escapeHtml(r.name)}</span>
            ${r.floorName ? `<span class="search-result-floor">${escapeHtml(r.floorName)}</span>` : ''}
          </button>
        `,
      )
      .join('');

    return `<div class="search-results">${items}</div>`;
  }

  private fabs(state: AppState, _app: MapApp): string {
    const bottom = state.showRouteSheet ? '7.5rem' : '5.5rem';
    const floorOptions = state.floors
      .map(
        (f) =>
          `<option value="${escapeHtml(f.id)}" ${f.id === state.currentFloorId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`,
      )
      .join('');

    return `
      <div class="fabs" style="bottom:${bottom}">
        <label class="floor-fab">
          <span class="fab-icon">▤</span>
          <select id="floor-select" aria-label="Select floor">${floorOptions}</select>
        </label>
        <button type="button" id="my-location-btn" class="fab" aria-label="My location">⊕</button>
      </div>
    `;
  }

  private routeHintBar(state: AppState, _app: MapApp): string {
    const hasStart = Boolean(state.markers.origin);
    const hasEnd = Boolean(state.markers.destination);
    const hint = state.isCalculatingRoute
      ? 'Finding route…'
      : !hasStart
        ? 'Tap the map — where are you?'
        : !hasEnd
          ? 'Tap the map — where are you going?'
          : 'Route ready';

    return `
      <div class="route-hint">
        <div class="route-steps">
          <button type="button" class="step-dot step-dot--start ${hasStart ? 'is-done' : 'is-active'}" data-focus="start" ${hasStart ? '' : 'disabled'}></button>
          <div class="step-line ${hasStart ? 'is-done' : ''}"></div>
          <button type="button" class="step-dot step-dot--end ${hasEnd ? 'is-done' : hasStart ? 'is-active' : ''}" data-focus="end" ${hasEnd ? '' : 'disabled'}></button>
        </div>
        <div class="route-hint-copy">
          <div>${escapeHtml(hint)}</div>
          ${hasEnd && state.markers.destinationLabel && state.markers.destinationLabel !== 'End point'
            ? `<div class="route-hint-sub">${escapeHtml(state.markers.destinationLabel)}</div>`
            : ''}
        </div>
        ${state.isCalculatingRoute ? '<div class="mini-spinner"></div>' : ''}
        <button type="button" id="reset-points-btn" class="ghost-btn" ${hasStart || hasEnd ? '' : 'disabled'}>Reset</button>
      </div>
    `;
  }

  private routeSheet(state: AppState, _app: MapApp): string {
    const legCount = state.route!.legs.length;
    const instruction = state.routeInstructions || 'Follow the path';

    return `
      <div class="route-sheet">
        <div class="route-sheet-header">
          <span class="route-sheet-icon">🚶</span>
          <p class="route-sheet-instruction">${escapeHtml(instruction)}</p>
          <button type="button" id="close-route-btn" class="icon-btn" aria-label="Close route">×</button>
        </div>
        ${legCount > 1 ? `
          <div class="leg-controls">
            <button type="button" id="prev-leg-btn" class="icon-btn" ${state.currentLegIndex > 0 ? '' : 'disabled'}>‹</button>
            <span>Step ${state.currentLegIndex + 1} of ${legCount}</span>
            <button type="button" id="next-leg-btn" class="icon-btn" ${state.currentLegIndex < legCount - 1 ? '' : 'disabled'}>›</button>
          </div>` : ''}
        <div class="route-sheet-actions">
          <button type="button" id="focus-start-btn" class="ghost-btn">Start</button>
          <button type="button" id="focus-end-btn" class="ghost-btn">End</button>
          <button type="button" id="reset-route-points-btn" class="ghost-btn">Reset points</button>
          <button type="button" id="open-ar-btn" class="primary-btn">AR Guidance</button>
        </div>
      </div>
    `;
  }

  private arChrome(_app: MapApp): string {
    return `
      <div class="ar-chrome">
        <button type="button" id="close-ar-btn" class="primary-btn">← Back to map</button>
      </div>
    `;
  }

  private bindEvents(app: MapApp): void {
    const searchInput = this.root.querySelector<HTMLInputElement>('#search-input');
    searchInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        void app.submitSearch(searchInput.value);
      }
    });

    this.root.querySelector('#search-clear')?.addEventListener('click', () => {
      void app.submitSearch('');
    });

    this.root.querySelector('#floor-select')?.addEventListener('change', (event) => {
      const floorId = (event.target as HTMLSelectElement).value;
      void app.selectFloor(floorId);
    });

    this.root.querySelector('#my-location-btn')?.addEventListener('click', () => {
      void app.goToMyLocation();
    });

    this.root.querySelector('#reset-points-btn')?.addEventListener('click', () => {
      void app.clearRoutePoints();
    });

    this.root.querySelector('#close-route-btn')?.addEventListener('click', () => {
      void app.clearRoute();
    });

    this.root.querySelector('#prev-leg-btn')?.addEventListener('click', () => {
      app.routePreviousLeg();
    });

    this.root.querySelector('#next-leg-btn')?.addEventListener('click', () => {
      app.routeNextLeg();
    });

    this.root.querySelector('#focus-start-btn')?.addEventListener('click', () => {
      app.focusRouteStart();
    });

    this.root.querySelector('#focus-end-btn')?.addEventListener('click', () => {
      app.focusRouteEnd();
    });

    this.root.querySelector('#reset-route-points-btn')?.addEventListener('click', () => {
      void app.clearRoutePoints();
    });

    this.root.querySelector('#open-ar-btn')?.addEventListener('click', () => {
      void app.openAr();
    });

    this.root.querySelector('#close-ar-btn')?.addEventListener('click', () => {
      app.closeAr();
    });

    this.root.querySelectorAll<HTMLButtonElement>('.search-result').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.locationId;
        const name = button.dataset.locationName;
        if (id && name) void app.selectSearchResult(id, name);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach((button) => {
      button.addEventListener('click', () => {
        const which = button.dataset.focus;
        if (which === 'start') app.focusRouteStart();
        if (which === 'end') app.focusRouteEnd();
      });
    });
  }
}
