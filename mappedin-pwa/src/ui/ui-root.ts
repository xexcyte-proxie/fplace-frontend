import type { AppState } from "../types";
import type { MapApp } from "../services/map-app";
import { buildRouteSheetSummary } from "./route-summary";
import { renderOnboardingScreen } from "./onboarding-screen";
import { renderSocialScreen } from "./social-screen";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const CATEGORY_FILTERS = [
  { id: "food", label: "Food", color: "#f97316" },
  { id: "retail", label: "Retail", color: "#2d4a7a" },
  { id: "entrance", label: "Entrance / Exit", color: "#22c55e" },
  { id: "restroom", label: "Restroom", color: "#a855f7" },
] as const;

export class UiRoot {
  private readonly root: HTMLElement;

  constructor(container: HTMLElement) {
    this.root = container;
    this.root.className = "ui-root";
  }

  render(state: AppState, app: MapApp): void {
    const showOnboarding =
      state.mapStatus === "ready" && !state.onboardingComplete;
    const showOverlays =
      state.mapStatus === "ready" && state.onboardingComplete && !state.isArOpen;
    const onMapTab = state.activeTab === "map";

    document
      .getElementById("mappedin-map")
      ?.classList.toggle("is-hidden", showOnboarding || (showOverlays && !onMapTab));

    this.root.innerHTML = `
      ${this.loadingOverlay(state)}
      ${showOnboarding ? renderOnboardingScreen() : ""}
      ${showOverlays && onMapTab ? this.homeHeader(state) : ""}
      ${showOverlays && onMapTab && state.searchResults.length ? this.searchResults(state, app) : ""}
      ${showOverlays && onMapTab ? this.fabs(state, app) : ""}
      ${showOverlays && onMapTab && !state.showRouteSheet ? this.routeHintBar(state, app) : ""}
      ${showOverlays && onMapTab && state.showRouteSheet && (state.route || state.markers.destination) ? this.routeSheet(state, app) : ""}
      ${showOverlays && !onMapTab ? renderSocialScreen(state) : ""}
      ${showOverlays ? this.bottomNav(state) : ""}
      ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
      ${state.isArOpen ? this.arChrome(app) : ""}
    `;

    this.bindEvents(app);
  }

  private loadingOverlay(state: AppState): string {
    if (state.mapStatus === "ready") return "";
    const isError = state.mapStatus === "error";
    const progress = Math.max(0, Math.min(100, state.loadingProgress));
    return `
      <div class="splash-screen ${isError ? "splash-screen--error" : ""}" role="status">
        <div class="splash-brand">
          <div class="splash-logo" aria-hidden="true"></div>
          <h1 class="splash-title">fplaces</h1>
          <p class="splash-tagline">Find places. Find people. Find your way.</p>
        </div>
        ${
          isError
            ? `<p class="splash-error">${escapeHtml(state.loadingMessage)}</p>`
            : `
            <div
              class="splash-progress"
              role="progressbar"
              aria-valuenow="${progress}"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="Loading"
            >
              <div class="splash-progress-bar" style="width:${progress}%"></div>
            </div>
          `
        }
      </div>
    `;
  }

  private homeHeader(state: AppState): string {
    return `
      <div class="home-header">
        ${this.searchBar(state)}
        ${this.categoryFilters(state)}
      </div>
    `;
  }

  private searchBar(state: AppState): string {
    return `
      <div class="search-bar">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"></circle>
          <path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        </svg>
        <input
          id="search-input"
          type="search"
          placeholder="Search a store or place..."
          value="${escapeHtml(state.searchQuery)}"
          autocomplete="off"
        />
        ${state.searchQuery ? '<button type="button" id="search-clear" class="icon-btn" aria-label="Clear search">×</button>' : ""}
      </div>
    `;
  }

  private categoryFilters(state: AppState): string {
    const pills = CATEGORY_FILTERS.map(
      (category) => `
        <button
          type="button"
          class="category-pill ${state.categoryFilter === category.id ? "is-active" : ""}"
          data-category="${category.id}"
        >
          <span class="category-dot" style="background:${category.color}"></span>
          ${escapeHtml(category.label)}
        </button>
      `,
    ).join("");

    return `<div class="category-filters">${pills}</div>`;
  }

  private searchResults(state: AppState, _app: MapApp): string {
    const items = state.searchResults
      .map(
        (r) => `
          <button type="button" class="search-result" data-location-id="${escapeHtml(r.id)}" data-location-name="${escapeHtml(r.name)}" data-floor-name="${escapeHtml(r.floorName ?? "")}">
            <span class="search-result-name">${escapeHtml(r.name)}</span>
            ${r.floorName ? `<span class="search-result-floor">${escapeHtml(r.floorName)}</span>` : ""}
          </button>
        `,
      )
      .join("");

    return `<div class="search-results">${items}</div>`;
  }

  private fabs(state: AppState, _app: MapApp): string {
    const bottom = state.showRouteSheet
      ? "calc(252px + var(--bottom-nav-height) + env(safe-area-inset-bottom))"
      : "calc(var(--bottom-nav-height) + 48px + env(safe-area-inset-bottom))";
    const floorOptions = state.floors
      .map(
        (f) =>
          `<option value="${escapeHtml(f.id)}" ${f.id === state.currentFloorId ? "selected" : ""}>${escapeHtml(f.name)}</option>`,
      )
      .join("");
    const trackingActive =
      state.blueDotStatus === "active" || state.blueDotStatus === "inactive";
    const myLocationLabel = state.blueDotFollowing
      ? "Following your location"
      : trackingActive
        ? "Live location active"
        : "My location";

    return `
      <div class="fabs" style="bottom:${bottom}">
        ${state.showRouteSheet ? `
        <label class="floor-fab">
          <span class="fab-icon">▤</span>
          <select id="floor-select" aria-label="Select floor">${floorOptions}</select>
        </label>` : ""}
        <button
          type="button"
          id="my-location-btn"
          class="fab ${trackingActive ? "fab--tracking" : ""} ${state.blueDotFollowing ? "fab--following" : ""}"
          aria-label="${escapeHtml(myLocationLabel)}"
          title="${escapeHtml(myLocationLabel)}"
        >⊕</button>
      </div>
    `;
  }

  private routeHintBar(state: AppState, _app: MapApp): string {
    const hasStart = Boolean(state.markers.origin);
    const hasEnd = Boolean(state.markers.destination);
    const hint = state.isCalculatingRoute
      ? "Finding route…"
      : !hasStart
        ? "Tap the map to set your location."
        : !hasEnd
          ? "Tap the map to choose your destination."
          : "Route ready";

    return `
      <div class="route-hint">
        <div class="route-steps">
          <button type="button" class="step-dot step-dot--start ${hasStart ? "is-done" : "is-active"}" data-focus="start" ${hasStart ? "" : "disabled"}></button>
          <div class="step-line ${hasStart ? "is-done" : ""}"></div>
          <button type="button" class="step-dot step-dot--end ${hasEnd ? "is-done" : hasStart ? "is-active" : ""}" data-focus="end" ${hasEnd ? "" : "disabled"}></button>
        </div>
        <div class="route-hint-copy">
          <div>${escapeHtml(hint)}</div>
          ${
            hasEnd &&
            state.markers.destinationLabel &&
            state.markers.destinationLabel !== "End point"
              ? `<div class="route-hint-sub">${escapeHtml(state.markers.destinationLabel)}</div>`
              : ""
          }
        </div>
        ${state.isCalculatingRoute ? '<div class="mini-spinner"></div>' : ""}
        <button type="button" id="reset-points-btn" class="ghost-btn" ${hasStart || hasEnd ? "" : "disabled"}>Reset</button>
      </div>
    `;
  }

  private routeSheet(state: AppState, _app: MapApp): string {
    const summary = buildRouteSheetSummary(state);

    return `
      <div class="route-sheet ${summary.isCalculating ? "route-sheet--calculating" : ""}">
        <div class="route-sheet-handle" aria-hidden="true"></div>
        <button type="button" id="close-route-btn" class="route-sheet-close icon-btn" aria-label="Close route">×</button>
        <div class="route-sheet-top">
          <div class="route-sheet-copy">
            <h2 class="route-sheet-title">${escapeHtml(summary.title)}</h2>
            ${summary.locationLine ? `<p class="route-sheet-subtitle">${escapeHtml(summary.locationLine)}</p>` : ""}
          </div>
          <div class="route-sheet-stats">
            <div class="route-sheet-time">${escapeHtml(summary.walkTime)}</div>
            <div class="route-sheet-distance">${escapeHtml(summary.walkDistance)}</div>
          </div>
        </div>
        <div class="route-sheet-actions">
          <button
            type="button"
            id="begin-route-btn"
            class="route-sheet-begin-btn ${summary.isCalculating || state.routeSimulating ? "is-disabled" : ""} ${state.routeSimulationComplete ? "route-sheet-begin-btn--reset" : ""}"
            ${summary.isCalculating || state.routeSimulating ? "disabled" : ""}
          >${state.routeSimulationComplete ? "Reset" : state.routeSimulating ? "Moving…" : "Begin"}</button>
          <button type="button" id="open-ar-btn" class="route-sheet-ar-btn" ${summary.isCalculating ? "disabled" : ""}>
            <svg class="ar-nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2l8 4v6c0 5.25-3.5 10-8 11-4.5-1-8-5.75-8-11V6l8-4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
            </svg>
            Start AR Navigation
          </button>
        </div>
      </div>
    `;
  }

  private bottomNav(state: AppState): string {
    return `
      <nav class="bottom-nav" aria-label="Main navigation">
        <button
          type="button"
          id="nav-map"
          class="bottom-nav-item ${state.activeTab === "map" ? "bottom-nav-item--active" : ""}"
        >Map</button>
        <button
          type="button"
          id="nav-social"
          class="bottom-nav-item ${state.activeTab === "social" ? "bottom-nav-item--active" : ""}"
        >Social</button>
      </nav>
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
    const searchInput =
      this.root.querySelector<HTMLInputElement>("#search-input");
    searchInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        void app.submitSearch(searchInput.value);
      }
    });

    this.root.querySelector("#search-clear")?.addEventListener("click", () => {
      void app.setCategoryFilter(null);
    });

    this.root
      .querySelectorAll<HTMLButtonElement>(".category-pill")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const category = button.dataset.category ?? null;
          void app.setCategoryFilter(category);
        });
      });

    this.root
      .querySelector("#floor-select")
      ?.addEventListener("change", (event) => {
        const floorId = (event.target as HTMLSelectElement).value;
        void app.selectFloor(floorId);
      });

    this.root
      .querySelector("#my-location-btn")
      ?.addEventListener("click", () => {
        void app.goToMyLocation();
      });

    this.root
      .querySelector("#reset-points-btn")
      ?.addEventListener("click", () => {
        void app.clearRoutePoints();
      });

    this.root
      .querySelector("#close-route-btn")
      ?.addEventListener("click", () => {
        void app.clearRoute();
      });

    this.root.querySelector("#prev-leg-btn")?.addEventListener("click", () => {
      app.routePreviousLeg();
    });

    this.root.querySelector("#next-leg-btn")?.addEventListener("click", () => {
      app.routeNextLeg();
    });

    this.root
      .querySelector("#focus-start-btn")
      ?.addEventListener("click", () => {
        app.focusRouteStart();
      });

    this.root.querySelector("#focus-end-btn")?.addEventListener("click", () => {
      app.focusRouteEnd();
    });

    this.root
      .querySelector("#reset-route-points-btn")
      ?.addEventListener("click", () => {
        void app.clearRoutePoints();
      });

    this.root.querySelector("#open-ar-btn")?.addEventListener("click", () => {
      void app.openAr();
    });

    this.root.querySelector("#begin-route-btn")?.addEventListener("click", () => {
      app.beginOrResetRoute();
    });

    this.root.querySelector("#close-ar-btn")?.addEventListener("click", () => {
      app.closeAr();
    });

    this.root
      .querySelectorAll<HTMLButtonElement>(".search-result")
      .forEach((button) => {
        button.addEventListener("click", () => {
        const id = button.dataset.locationId;
        const name = button.dataset.locationName;
        const floorName = button.dataset.floorName;
        if (id && name) void app.selectSearchResult(id, name, floorName || undefined);
        });
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-focus]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const which = button.dataset.focus;
          if (which === "start") app.focusRouteStart();
          if (which === "end") app.focusRouteEnd();
        });
      });

    this.root
      .querySelector("#onboarding-get-started")
      ?.addEventListener("click", () => {
        app.completeOnboarding();
      });

    this.root
      .querySelector("#onboarding-guest-btn")
      ?.addEventListener("click", () => {
        app.completeOnboarding();
      });

    this.root.querySelector("#nav-map")?.addEventListener("click", () => {
      app.setActiveTab("map");
    });

    this.root.querySelector("#nav-social")?.addEventListener("click", () => {
      app.setActiveTab("social");
    });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-social-category]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          app.setSocialCategory(
            button.dataset.socialCategory as AppState["socialCategory"],
          );
        });
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-social-location]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          app.setSocialLocation(button.dataset.socialLocation ?? null);
        });
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-social-tag]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          app.setSocialTag(button.dataset.socialTag ?? null);
        });
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-upvote-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const postId = button.dataset.upvoteId;
          if (postId) app.toggleSocialUpvote(postId);
        });
      });

    const socialInput =
      this.root.querySelector<HTMLInputElement>("#social-input");
    socialInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") app.submitSocialPost();
    });

    this.root
      .querySelector("#social-send-btn")
      ?.addEventListener("click", () => {
        app.submitSocialPost();
      });
  }
}
