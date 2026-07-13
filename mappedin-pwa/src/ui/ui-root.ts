import type { AppState } from "../types";
import type { MapApp } from "../services/map-app";
import { buildRouteSheetSummary } from "./route-summary";
import { renderOnboardingScreen } from "./onboarding-screen";
import { renderCreateAccountScreen } from "./create-account-screen";
import { renderCheckEmailScreen } from "./check-email-screen";
import { renderVerifyEmailScreen } from "./verify-email-screen";
import { renderVenueFeedScreen } from "./venue-feed-screen";
import { renderProfileScreen } from "./profile-screen";
import { renderSettingsScreen } from "./settings-screen";
import { renderLocationActionSheet } from "./location-action-sheet";
import {
  bottomNavMapIcon,
  bottomNavProfileIcon,
  bottomNavSocialIcon,
} from "./bottom-nav-icons";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export class UiRoot {
  private readonly root: HTMLElement;
  private authEmailDraft = "";

  constructor(container: HTMLElement) {
    this.root = container;
    this.root.className = "ui-root";
  }

  render(state: AppState, app: MapApp): void {
    const activeEl = document.activeElement;
    const focusedSearch =
      activeEl?.id === "search-input"
        ? (activeEl as HTMLInputElement)
        : null;
    const selectionStart = focusedSearch?.selectionStart ?? null;
    const selectionEnd = focusedSearch?.selectionEnd ?? null;

    const showOnboardingFlow =
      state.mapStatus === "ready" && !state.onboardingComplete;
    const showOnboardingScreen =
      showOnboardingFlow && state.authStep === "none";
    const showCreateAccount =
      showOnboardingFlow && state.authStep === "create";
    const showCheckEmail =
      showOnboardingFlow && state.authStep === "check-email";
    const showVerifyEmail =
      showOnboardingFlow && state.authStep === "verify";
    const arFullscreen = state.arPresentation === "fullscreen";
    const showOverlays =
      state.mapStatus === "ready" && state.onboardingComplete && !arFullscreen;
    const onMapTab = state.activeTab === "map";
    const onSocialTab = state.activeTab === "social";
    const onProfileTab = state.activeTab === "profile";
    const onProfileSettings = onProfileTab && state.profileView === "settings";
    const onProfileMain = onProfileTab && state.profileView === "main";

    const focusedVenueInput =
      activeEl?.id === "venue-feed-input"
        ? (activeEl as HTMLInputElement)
        : null;
    const venueSelectionStart = focusedVenueInput?.selectionStart ?? null;
    const venueSelectionEnd = focusedVenueInput?.selectionEnd ?? null;

    if (!showCreateAccount && !showCheckEmail && !showVerifyEmail) {
      this.authEmailDraft = "";
    }

    document
      .getElementById("mappedin-map")
      ?.classList.toggle("is-hidden", showOnboardingFlow || (showOverlays && !onMapTab));

    this.root.innerHTML = `
      ${this.loadingOverlay(state)}
      ${showOnboardingScreen ? renderOnboardingScreen() : ""}
      ${showCreateAccount ? renderCreateAccountScreen({
        authEmail: this.authEmailDraft || state.authEmail,
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
      }) : ""}
      ${showCheckEmail ? renderCheckEmailScreen({
        authEmail: state.authEmail || state.authUser?.email || "",
        authLoading: state.authLoading,
      }) : ""}
      ${showVerifyEmail ? renderVerifyEmailScreen({
        authEmail: state.authEmail || state.authUser?.email || "",
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
      }) : ""}
      ${showOverlays && onMapTab ? this.homeHeader(state) : ""}
      ${showOverlays && onMapTab && state.searchQuery.trim() ? this.searchResults(state) : ""}
      ${showOverlays && onMapTab ? this.fabs(state, app) : ""}
      ${showOverlays && onMapTab && state.locationActionPrompt ? renderLocationActionSheet(state.locationActionPrompt, Boolean(state.markers.origin)) : ""}
      ${showOverlays && onMapTab && (!state.showRouteSheet || !state.route) ? this.routeHintBar(state, app) : ""}
      ${showOverlays && onMapTab && state.showRouteSheet && (state.route || state.markers.destination) ? this.routeSheet(state, app) : ""}
      ${showOverlays && onSocialTab ? renderVenueFeedScreen(state) : ""}
      ${showOverlays && onProfileMain ? renderProfileScreen() : ""}
      ${showOverlays && onProfileSettings ? renderSettingsScreen(state) : ""}
      ${showOverlays && !onProfileSettings ? this.bottomNav(state) : ""}
      ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
    `;

    this.bindEvents(app);
    this.bindOtpInputs(app);

    if (focusedSearch) {
      const searchInput =
        this.root.querySelector<HTMLInputElement>("#search-input");
      if (searchInput) {
        searchInput.focus();
        if (selectionStart !== null && selectionEnd !== null) {
          searchInput.setSelectionRange(selectionStart, selectionEnd);
        }
      }
    }

    if (focusedVenueInput) {
      const venueInput =
        this.root.querySelector<HTMLInputElement>("#venue-feed-input");
      if (venueInput) {
        venueInput.focus();
        if (venueSelectionStart !== null && venueSelectionEnd !== null) {
          venueInput.setSelectionRange(venueSelectionStart, venueSelectionEnd);
        }
      }
    }
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
    if (!state.searchChips.length) return "";

    const pills = state.searchChips
      .map(
        (chip) => `
        <button
          type="button"
          class="category-pill ${state.categoryFilter === chip.id ? "is-active" : ""}"
          data-category="${escapeHtml(chip.id)}"
        >
          <span class="category-dot" style="background:${chip.color}"></span>
          ${escapeHtml(chip.label)}
        </button>
      `,
      )
      .join("");

    return `<div class="category-filters">${pills}</div>`;
  }

  private searchResults(state: AppState): string {
    if (state.isSearching) {
      return `<div class="search-results search-results--loading" role="status">Searching…</div>`;
    }

    if (!state.searchResults.length) {
      return `<div class="search-results search-results--empty" role="status">No places found</div>`;
    }

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
    const trackingActive =
      state.blueDotStatus === "active" || state.blueDotStatus === "inactive";
    const myLocationLabel = state.blueDotFollowing
      ? "Following your location"
      : trackingActive
        ? "Live location active"
        : "My location";

    return `
      <div class="fabs" style="bottom:${bottom}">
        <div class="zoom-controls">
          <button
            type="button"
            id="zoom-in-btn"
            class="fab fab--zoom"
            aria-label="Zoom in"
            title="Zoom in"
          >+</button>
          <button
            type="button"
            id="zoom-out-btn"
            class="fab fab--zoom"
            aria-label="Zoom out"
            title="Zoom out"
          >-</button>
        </div>
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
    const resetDisabled = summary.isCalculating;

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
            class="route-sheet-begin-btn ${summary.isCalculating || state.routeSimulating ? "is-disabled" : ""}"
            ${summary.isCalculating || state.routeSimulating ? "disabled" : ""}
          >${state.routeSimulating ? "Moving…" : "Begin"}</button>
          <button
            type="button"
            id="reset-route-sheet-btn"
            class="route-sheet-reset-btn ${resetDisabled ? "is-disabled" : ""}"
            ${resetDisabled ? "disabled" : ""}
          >Reset</button>
          <button type="button" id="open-ar-btn" class="route-sheet-ar-btn" ${summary.isCalculating ? "disabled" : ""}>
            <svg class="ar-nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2l8 4v6c0 5.25-3.5 10-8 11-4.5-1-8-5.75-8-11V6l8-4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
            </svg>
            Live View
          </button>
        </div>
      </div>
    `;
  }

  private bottomNav(state: AppState): string {
    const mapActive = state.activeTab === "map";
    const socialActive = state.activeTab === "social";
    const profileActive = state.activeTab === "profile";

    return `
      <nav class="bottom-nav" aria-label="Main navigation">
        <button
          type="button"
          id="nav-map"
          class="bottom-nav-item ${mapActive ? "bottom-nav-item--active" : ""}"
        >
          ${bottomNavMapIcon}
          <span class="bottom-nav-label">Map</span>
        </button>
        <button
          type="button"
          id="nav-social"
          class="bottom-nav-item ${socialActive ? "bottom-nav-item--active" : ""}"
        >
          ${bottomNavSocialIcon}
          <span class="bottom-nav-label">Social</span>
        </button>
        <button
          type="button"
          id="nav-profile"
          class="bottom-nav-item ${profileActive ? "bottom-nav-item--active" : ""}"
        >
          ${bottomNavProfileIcon}
          <span class="bottom-nav-label">Profile</span>
        </button>
      </nav>
    `;
  }

  private bindEvents(app: MapApp): void {
    const searchInput =
      this.root.querySelector<HTMLInputElement>("#search-input");
    searchInput?.addEventListener("input", () => {
      app.onSearchInput(searchInput.value);
    });
    searchInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        void app.submitSearch(searchInput.value);
      }
    });

    this.root.querySelector("#search-clear")?.addEventListener("click", () => {
      void app.clearSearch();
    });

    this.root
      .querySelectorAll<HTMLButtonElement>(".category-pill")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const category = button.dataset.category ?? null;
          void app.setCategoryFilter(category);
        });
      });

    this.root.querySelector("#zoom-in-btn")?.addEventListener("click", () => {
      app.zoomIn();
    });

    this.root.querySelector("#zoom-out-btn")?.addEventListener("click", () => {
      app.zoomOut();
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

    this.root
      .querySelector("#reset-route-sheet-btn")
      ?.addEventListener("click", () => {
        void app.clearRoutePoints();
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
        app.showCreateAccount();
      });

    this.root
      .querySelector("#onboarding-guest-btn")
      ?.addEventListener("click", () => {
        app.completeOnboarding();
      });

    this.root
      .querySelector("#auth-back-btn")
      ?.addEventListener("click", () => {
        app.dismissCreateAccount();
      });

    this.root
      .querySelector("#auth-login-link")
      ?.addEventListener("click", () => {
        app.completeOnboarding();
      });

    this.root
      .querySelector("#auth-email")
      ?.addEventListener("input", (event) => {
        this.authEmailDraft = (event.currentTarget as HTMLInputElement).value;
      });

    this.root
      .querySelector("#create-account-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const email = form.querySelector<HTMLInputElement>("#auth-email")?.value ?? "";
        const password =
          form.querySelector<HTMLInputElement>("#auth-password")?.value ?? "";
        const passwordConfirm =
          form.querySelector<HTMLInputElement>("#auth-password-confirm")?.value ?? "";
        void app.submitRegistration(email, password, passwordConfirm);
      });

    this.root
      .querySelector("#check-email-back-btn")
      ?.addEventListener("click", () => {
        app.dismissCheckEmail();
      });

    this.root
      .querySelector("#check-email-continue-btn")
      ?.addEventListener("click", () => {
        app.proceedToVerifyEmail();
      });

    this.root
      .querySelector("#check-email-resend-btn")
      ?.addEventListener("click", () => {
        void app.resendVerificationCode();
      });

    this.root
      .querySelector("#verify-back-btn")
      ?.addEventListener("click", () => {
        app.dismissVerifyEmail();
      });

    this.root
      .querySelector("#verify-resend-btn")
      ?.addEventListener("click", () => {
        void app.resendVerificationCode();
      });

    this.root
      .querySelector("#verify-email-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        void app.submitVerification(this.readOtpValue());
      });

    this.root.querySelector("#nav-map")?.addEventListener("click", () => {
      app.setActiveTab("map");
    });

    this.root.querySelector("#nav-social")?.addEventListener("click", () => {
      app.setActiveTab("social");
    });

    this.root.querySelector("#nav-profile")?.addEventListener("click", () => {
      app.setActiveTab("profile");
    });

    this.root
      .querySelector("#profile-settings-btn")
      ?.addEventListener("click", () => {
        app.openProfileSettings();
      });

    this.root
      .querySelector("#settings-back-btn")
      ?.addEventListener("click", () => {
        app.closeProfileSettings();
      });

    this.root
      .querySelector("#settings-notifications-toggle")
      ?.addEventListener("click", () => {
        app.toggleNotifications();
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-venue-filter]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          app.setVenueFeedFilter(
            button.dataset.venueFilter as AppState["venueFeedFilter"],
          );
        });
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-venue-quick-reply]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const reply = button.dataset.venueQuickReply;
          if (reply) app.setVenueQuickReply(reply);
        });
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-upvote-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const postId = button.dataset.upvoteId;
          if (postId) app.toggleVenueFeedUpvote(postId);
        });
      });

    const venueFeedInput =
      this.root.querySelector<HTMLInputElement>("#venue-feed-input");
    venueFeedInput?.addEventListener("input", () => {
      app.setVenueFeedDraft(venueFeedInput.value);
    });
    venueFeedInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") app.submitVenueFeedPost();
    });

    this.root
      .querySelector("#venue-feed-send-btn")
      ?.addEventListener("click", () => {
        app.submitVenueFeedPost();
      });

    this.root
      .querySelector("#location-action-dismiss")
      ?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) {
          app.dismissLocationActionPrompt();
        }
      });

    this.root
      .querySelector("#location-action-cancel")
      ?.addEventListener("click", () => {
        app.dismissLocationActionPrompt();
      });

    this.root
      .querySelector("#location-action-conversation")
      ?.addEventListener("click", () => {
        app.confirmLocationConversation();
      });

    this.root
      .querySelector("#location-action-navigate")
      ?.addEventListener("click", () => {
        app.confirmLocationNavigate();
      });

    this.root
      .querySelector(".location-action-sheet")
      ?.addEventListener("click", (event) => {
        event.stopPropagation();
      });
  }

  private readOtpValue(): string {
    return Array.from(
      this.root.querySelectorAll<HTMLInputElement>(".otp-digit"),
    )
      .map((input) => input.value.trim())
      .join("");
  }

  private bindOtpInputs(app: MapApp): void {
    const inputs = Array.from(
      this.root.querySelectorAll<HTMLInputElement>(".otp-digit"),
    );
    if (!inputs.length) return;

    inputs[0]?.focus();

    inputs.forEach((input, index) => {
      input.addEventListener("input", () => {
        const digit = input.value.replace(/\D/g, "").slice(-1);
        input.value = digit;
        if (digit && index < inputs.length - 1) {
          inputs[index + 1]?.focus();
        }
        if (digit && index === inputs.length - 1 && this.readOtpValue().length === 6) {
          void app.submitVerification(this.readOtpValue());
        }
      });

      input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && index > 0) {
          const previous = inputs[index - 1];
          previous?.focus();
          if (previous) previous.value = "";
        }
        if (event.key === "ArrowLeft" && index > 0) {
          inputs[index - 1]?.focus();
        }
        if (event.key === "ArrowRight" && index < inputs.length - 1) {
          inputs[index + 1]?.focus();
        }
      });

      input.addEventListener("paste", (event) => {
        event.preventDefault();
        const pasted = event.clipboardData
          ?.getData("text")
          .replace(/\D/g, "")
          .slice(0, 6);
        if (!pasted) return;

        pasted.split("").forEach((char, charIndex) => {
          const target = inputs[charIndex];
          if (target) target.value = char;
        });

        const nextIndex = Math.min(pasted.length, inputs.length - 1);
        inputs[nextIndex]?.focus();

        if (pasted.length === 6) {
          void app.submitVerification(pasted);
        }
      });
    });
  }
}
