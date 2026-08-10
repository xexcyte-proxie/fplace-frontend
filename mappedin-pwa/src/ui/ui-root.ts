import {
  isLocationGateAuthStep,
} from "../location/domain/location-gate";
import type { AppState, AuthStep } from "../types";
import type { MapApp } from "../services/map-app";
import { buildRouteSheetSummary } from "./route-summary";
import { renderOnboardingScreen } from "./onboarding-screen";
import { renderArTeaserScreen } from "./ar-teaser-screen";
import { renderIntroductionScreen } from "./introduction-screen";
import { renderFeaturesScreen } from "./features-screen";
import { renderCreateAccountScreen } from "./create-account-screen";
import { renderLoginScreen } from "./login-screen";
import { renderForgotPasswordScreen } from "./forgot-password-screen";
import { renderResetPasswordConfirmScreen } from "./reset-password-confirm-screen";
import { renderCheckEmailScreen } from "./check-email-screen";
import { renderVerifyEmailScreen } from "./verify-email-screen";
import { renderPseudoNameScreen } from "./pseudo-name-screen";
import { renderVenueSelectScreen } from "./venue-select-screen";
import {
  renderLocationErrorScreen,
  renderLocationPermissionRequiredScreen,
  renderLocationPermissionScreen,
} from "./location-permission-screen";
import { renderVenueFeedScreen } from "./venue-feed-screen";
import { renderPostCommentsScreen } from "./post-comments-screen";
import { renderProfileScreen } from "./profile-screen";
import { renderSettingsScreen } from "./settings-screen";
import { renderLanguageSettingsScreen } from "./language-settings-screen";
import { renderEditProfileSettingsScreen } from "./edit-profile-settings-screen";
import { renderChangePasswordScreen } from "./change-password-screen";
import { renderAboutSettingsScreen } from "./about-settings-screen";
import {
  renderAuthPrivacyScreen,
  renderPrivacySettingsScreen,
} from "./legal-settings-screen";
import { renderTermsWebViewSheet } from "./legal-webview-sheet";
import { evaluatePasswordStrength } from "../auth/domain/password-strength";
import {
  isCompleteOtpCode,
  normalizeOtpDigits,
  OTP_CODE_LENGTH,
} from "../auth/domain/otp-code";
import {
  formatResendCountdown,
  RESEND_OTP_COOLDOWN_MS,
} from "../auth/domain/resend-countdown";
import { renderNotificationsScreen } from "./notifications-screen";
import { renderNotificationDetailScreen } from "./notification-detail-screen";
import { renderArNavigationScreen } from "./ar-navigation-screen";
import { renderReturningHomeScreen } from "./returning-home-screen";
import { renderFirstVisitVenueScreen } from "./first-visit-venue-screen";
import { renderLocationActionSheet } from "./location-action-sheet";
import {
  bottomNavNavigateIcon,
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
  private splashTaglineRevealed = false;
  private authEmailDraft = "";
  private authPasswordDraft = "";
  private createPasswordDraft = "";
  private createPasswordConfirmDraft = "";
  private createTermsAcceptedDraft = false;
  private pseudoNameDraft: string | null = null;
  private venueSearchDraft: string | null = null;
  private otpDraft = "";
  private verifyResendEndsAt: number | null = null;
  private verifyResendInterval: number | null = null;

  constructor(container: HTMLElement) {
    this.root = container;
    this.root.className = "ui-root";
  }

  render(state: AppState, app: MapApp): void {
    // Keep the splash DOM intact while only loading progress changes so the
    // tagline fade-in is not restarted, and the bottom loader stays visible.
    if (this.patchSplashProgress(state)) {
      return;
    }

    const activeEl = document.activeElement;
    const focusedSearch =
      activeEl?.id === "search-input"
        ? (activeEl as HTMLInputElement)
        : null;
    const selectionStart = focusedSearch?.selectionStart ?? null;
    const selectionEnd = focusedSearch?.selectionEnd ?? null;

    const showOnboardingFlow =
      state.mapStatus === "ready" && !state.onboardingComplete;
    const locationDialogStep = isLocationGateAuthStep(state.authStep)
      ? state.authStep
      : null;
    const authUiStep: AuthStep = locationDialogStep
      ? state.authStepBeforeLocation && state.authStepBeforeLocation !== "none"
        ? state.authStepBeforeLocation
        : "create"
      : state.authStep;
    const showOnboardingScreen =
      showOnboardingFlow && authUiStep === "none";
    const showArTeaser =
      showOnboardingFlow && authUiStep === "ar-teaser";
    const showIntroduction =
      showOnboardingFlow && authUiStep === "introduction";
    const showFeatures = showOnboardingFlow && authUiStep === "features";
    const showCreateAccount =
      showOnboardingFlow &&
      authUiStep === "create" &&
      !state.authLegalDocument;
    const showLogin =
      showOnboardingFlow &&
      authUiStep === "login" &&
      !state.authLegalDocument;
    const showForgotPassword =
      showOnboardingFlow && authUiStep === "forgot-password";
    const showResetPasswordConfirm =
      state.mapStatus === "ready" && authUiStep === "reset-password-confirm";
    const showAuthPrivacy =
      showOnboardingFlow && state.authLegalDocument === "privacy";
    const showCheckEmail =
      showOnboardingFlow && authUiStep === "check-email";
    const showVerifyEmail =
      showOnboardingFlow && authUiStep === "verify";
    const showPseudoName =
      showOnboardingFlow && authUiStep === "pseudo-name";
    const showVenueSelect =
      showOnboardingFlow && authUiStep === "venue-select";
    const showLocationPermission =
      showOnboardingFlow && locationDialogStep === "location-permission";
    const showLocationRequired =
      showOnboardingFlow && locationDialogStep === "location-required";
    const showLocationError =
      showOnboardingFlow && locationDialogStep === "location-error";
    const arFullscreen = state.arPresentation === "fullscreen";
    const showOverlays =
      state.mapStatus === "ready" &&
      state.onboardingComplete &&
      !arFullscreen &&
      !showResetPasswordConfirm;
    const onMapTab = state.activeTab === "map";
    const onNavigateHome =
      showOverlays && onMapTab && state.navigateView === "home";
    const onFirstVisitHome =
      onNavigateHome && state.homeExperience === "first-visit";
    const onReturningHome =
      onNavigateHome && state.homeExperience !== "first-visit";
    const onNavigateMap =
      showOverlays && onMapTab && state.navigateView === "map";
    const onSocialTab = state.activeTab === "social";
    const onProfileTab = state.activeTab === "profile";
    const onProfileSettings = onProfileTab && state.profileView === "settings";
    const onProfileLanguage = onProfileTab && state.profileView === "language";
    const onProfileEditProfile =
      onProfileTab && state.profileView === "edit-profile";
    const onProfileChangePassword =
      onProfileTab && state.profileView === "change-password";
    const onProfileAbout = onProfileTab && state.profileView === "about";
    const onProfilePrivacy = onProfileTab && state.profileView === "privacy";
    const onProfileMain = onProfileTab && state.profileView === "main";
    const onProfileOverlay =
      onProfileSettings ||
      onProfileLanguage ||
      onProfileEditProfile ||
      onProfileChangePassword ||
      onProfileAbout ||
      onProfilePrivacy;
    const showTermsWebView = state.legalWebView === "terms";
    const onNotificationDetail =
      showOverlays &&
      onSocialTab &&
      state.notificationsOpen &&
      (state.notificationDetail != null ||
        state.notificationDetailLoading ||
        Boolean(state.notificationDetailError));
    const onNotificationsInbox =
      showOverlays &&
      onSocialTab &&
      state.notificationsOpen &&
      !onNotificationDetail;
    const onPostComments =
      showOverlays && onSocialTab && state.postCommentsOpen;

    const focusedVenueInput =
      activeEl?.id === "venue-feed-input"
        ? (activeEl as HTMLInputElement)
        : null;
    const venueSelectionStart = focusedVenueInput?.selectionStart ?? null;
    const venueSelectionEnd = focusedVenueInput?.selectionEnd ?? null;

    const focusedPseudoName =
      activeEl?.id === "pseudo-name-input"
        ? (activeEl as HTMLInputElement)
        : null;
    const pseudoSelectionStart = focusedPseudoName?.selectionStart ?? null;
    const pseudoSelectionEnd = focusedPseudoName?.selectionEnd ?? null;

    const focusedVenueSearch =
      activeEl?.id === "venue-select-search-input"
        ? (activeEl as HTMLInputElement)
        : null;
    const venueSearchSelectionStart =
      focusedVenueSearch?.selectionStart ?? null;
    const venueSearchSelectionEnd = focusedVenueSearch?.selectionEnd ?? null;

    // Capture create-account fields before the DOM is replaced so terms/privacy
    // (and validation re-renders) do not wipe in-progress input.
    const createPasswordInput =
      this.root.querySelector<HTMLInputElement>("#auth-password");
    if (createPasswordInput) {
      this.createPasswordDraft = createPasswordInput.value;
      this.createPasswordConfirmDraft =
        this.root.querySelector<HTMLInputElement>("#auth-password-confirm")
          ?.value ?? "";
      this.createTermsAcceptedDraft =
        this.root.querySelector<HTMLInputElement>("#auth-terms")?.checked ??
        false;
    } else if (authUiStep !== "create") {
      this.createPasswordDraft = "";
      this.createPasswordConfirmDraft = "";
      this.createTermsAcceptedDraft = false;
    }

    const preserveAuthEmailDraft =
      showCreateAccount ||
      showCheckEmail ||
      showVerifyEmail ||
      showLogin ||
      showForgotPassword ||
      (showOnboardingFlow &&
        authUiStep === "create" &&
        showAuthPrivacy);
    if (!preserveAuthEmailDraft) {
      this.authEmailDraft = "";
    }
    if (showLogin) {
      const livePassword =
        this.root.querySelector<HTMLInputElement>("#login-password")?.value;
      if (livePassword) this.authPasswordDraft = livePassword;
    } else {
      this.authPasswordDraft = "";
    }
    if (!showPseudoName && !onProfileEditProfile) {
      this.pseudoNameDraft = null;
    }
    if (!showVenueSelect) {
      this.venueSearchDraft = null;
    }
    if (showVerifyEmail) {
      const currentOtp = this.readOtpValue();
      if (currentOtp) this.otpDraft = currentOtp;
    } else {
      this.otpDraft = "";
      this.clearVerifyResendCountdown();
    }

    const focusedOtpIndex =
      activeEl instanceof HTMLInputElement &&
      activeEl.classList.contains("otp-digit")
        ? Number(activeEl.dataset.otpIndex)
        : null;

    const focusedHomeVenueSearch =
      activeEl?.id === "home-venue-search-input"
        ? (activeEl as HTMLInputElement)
        : null;
    const homeVenueSearchSelectionStart =
      focusedHomeVenueSearch?.selectionStart ?? null;
    const homeVenueSearchSelectionEnd =
      focusedHomeVenueSearch?.selectionEnd ?? null;

    document
      .getElementById("mappedin-map")
      ?.classList.toggle(
        "is-hidden",
        showOnboardingFlow ||
          showResetPasswordConfirm ||
          onNavigateHome ||
          (showOverlays && !onMapTab),
      );

    const postCommentsPost =
      state.postCommentsPostId != null
        ? state.venueFeedPosts.find(
            (post) => post.id === state.postCommentsPostId,
          ) ?? null
        : null;

    this.root.innerHTML = `
      ${this.loadingOverlay(state)}
      ${showOnboardingScreen ? renderOnboardingScreen() : ""}
      ${showArTeaser ? renderArTeaserScreen() : ""}
      ${showIntroduction ? renderIntroductionScreen() : ""}
      ${showFeatures ? renderFeaturesScreen() : ""}
      ${showCreateAccount ? renderCreateAccountScreen({
        authEmail: this.authEmailDraft || state.authEmail,
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
        guestAccessAllowed: state.guestAccessAllowed,
      }) : ""}
      ${showLogin ? renderLoginScreen({
        authEmail: this.authEmailDraft || state.authEmail,
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
      }) : ""}
      ${showForgotPassword ? renderForgotPasswordScreen({
        authEmail: this.authEmailDraft || state.authEmail,
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
      }) : ""}
      ${showResetPasswordConfirm ? renderResetPasswordConfirmScreen({
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
      }) : ""}
      ${showAuthPrivacy ? renderAuthPrivacyScreen() : ""}
      ${showCheckEmail ? renderCheckEmailScreen({
        authEmail: state.authEmail || state.authUser?.email || "",
        authLoading: state.authLoading,
      }) : ""}
      ${showVerifyEmail ? renderVerifyEmailScreen({
        authEmail: state.authEmail || state.authUser?.email || "",
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
      }) : ""}
      ${showPseudoName ? renderPseudoNameScreen({
        pseudoNameDraft: this.pseudoNameDraft ?? state.pseudoNameDraft,
        pseudoNameHint: state.pseudoNameHint,
        selectedInterests: state.selectedInterests,
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
        allowBack: !state.authUser,
      }) : ""}
      ${showVenueSelect ? renderVenueSelectScreen({
        venueSearchQuery: this.venueSearchDraft ?? state.venueSearchQuery,
        selectedVenueId: state.selectedVenueId,
        selectedGateId: state.selectedGateId,
        forumVenues: state.forumVenues,
        forumSections: state.forumSections,
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
      }) : ""}
      ${showLocationPermission ? renderLocationPermissionScreen({
        locationGateLoading: state.locationGateLoading,
      }) : ""}
      ${showLocationRequired ? renderLocationPermissionRequiredScreen({
        locationGateLoading: state.locationGateLoading,
        locationPermanentlyDenied: state.locationPermanentlyDenied,
      }) : ""}
      ${showLocationError ? renderLocationErrorScreen({
        locationGateLoading: state.locationGateLoading,
        locationGateError: state.locationGateError,
      }) : ""}
      ${onFirstVisitHome ? renderFirstVisitVenueScreen(state) : ""}
      ${onReturningHome ? renderReturningHomeScreen(state) : ""}
      ${onNavigateMap ? this.homeHeader(state) : ""}
      ${onNavigateMap && state.searchQuery.trim() ? this.searchResults(state) : ""}
      ${onNavigateMap ? this.fabs(state, app) : ""}
      ${onNavigateMap && state.locationActionPrompt ? renderLocationActionSheet(state.locationActionPrompt, Boolean(state.markers.origin)) : ""}
      ${onNavigateMap && (!state.showRouteSheet || (!state.route && !state.routeNotFound && !state.markers.destination)) ? this.routeHintBar(state, app) : ""}
      ${onNavigateMap && state.showRouteSheet && (state.route || state.markers.destination || state.routeNotFound) ? this.routeSheet(state, app) : ""}
      ${showOverlays && onSocialTab && !onNotificationsInbox && !onNotificationDetail && !onPostComments ? renderVenueFeedScreen(state) : ""}
      ${onNotificationsInbox ? renderNotificationsScreen(state) : ""}
      ${onNotificationDetail ? renderNotificationDetailScreen({
        item: state.notificationDetail,
        loading: state.notificationDetailLoading,
        error: state.notificationDetailError,
      }) : ""}
      ${onPostComments ? renderPostCommentsScreen(state, postCommentsPost) : ""}
      ${showOverlays && onProfileMain ? renderProfileScreen(state) : ""}
      ${showOverlays && onProfileSettings ? renderSettingsScreen(state) : ""}
      ${showOverlays && onProfileLanguage ? renderLanguageSettingsScreen(state) : ""}
      ${showOverlays && onProfileEditProfile ? renderEditProfileSettingsScreen({
        pseudoNameDraft: this.pseudoNameDraft ?? state.pseudoNameDraft,
        pseudoNameHint: state.pseudoNameHint,
        selectedInterests: state.selectedInterests,
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
      }) : ""}
      ${showOverlays && onProfileChangePassword ? renderChangePasswordScreen({
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
      }) : ""}
      ${showOverlays && onProfileAbout ? renderAboutSettingsScreen() : ""}
      ${showOverlays && onProfilePrivacy ? renderPrivacySettingsScreen() : ""}
      ${showOverlays && !onProfileOverlay && !onNotificationsInbox ? this.bottomNav(state) : ""}
      ${arFullscreen ? renderArNavigationScreen(state) : ""}
      ${showTermsWebView ? renderTermsWebViewSheet() : ""}
      ${
        state.toast
          ? `<div class="toast" role="status">
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
              <p class="toast-message">${escapeHtml(state.toast)}</p>
            </div>`
          : ""
      }
    `;

    this.bindEvents(app);
    this.bindOtpInputs(app, focusedOtpIndex);
    this.restoreLoginPasswordDraft(showLogin);
    this.restoreCreateAccountDrafts(showCreateAccount);

    if (focusedPseudoName && (showPseudoName || onProfileEditProfile)) {
      const pseudoInput =
        this.root.querySelector<HTMLInputElement>("#pseudo-name-input");
      if (pseudoInput) {
        pseudoInput.focus();
        if (pseudoSelectionStart !== null && pseudoSelectionEnd !== null) {
          pseudoInput.setSelectionRange(
            pseudoSelectionStart,
            pseudoSelectionEnd,
          );
        }
      }
    }


    if (focusedVenueSearch) {
      const venueSearchInput =
        this.root.querySelector<HTMLInputElement>("#venue-select-search-input");
      if (venueSearchInput) {
        venueSearchInput.focus();
        if (
          venueSearchSelectionStart !== null &&
          venueSearchSelectionEnd !== null
        ) {
          venueSearchInput.setSelectionRange(
            venueSearchSelectionStart,
            venueSearchSelectionEnd,
          );
        }
      }
    }

    if (focusedHomeVenueSearch && onNavigateHome) {
      const homeSearchInput =
        this.root.querySelector<HTMLInputElement>("#home-venue-search-input");
      if (homeSearchInput) {
        homeSearchInput.focus();
        if (
          homeVenueSearchSelectionStart !== null &&
          homeVenueSearchSelectionEnd !== null
        ) {
          homeSearchInput.setSelectionRange(
            homeVenueSearchSelectionStart,
            homeVenueSearchSelectionEnd,
          );
        }
      }
    }

    if (focusedSearch) {
      const searchInput =
        this.root.querySelector<HTMLInputElement>("#search-input");
      if (searchInput) {
        searchInput.focus();
        if (selectionStart !== null && selectionEnd !== null) {
          searchInput.setSelectionRange(selectionStart, selectionEnd);
        }
      }
    } else if (onNavigateMap && app.shouldFocusMapSearch()) {
      app.consumeMapSearchFocus();
      requestAnimationFrame(() => {
        this.root.querySelector<HTMLInputElement>("#search-input")?.focus();
      });
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

  /**
   * Updates the splash progress bar in place. Returns true when a full re-render
   * was skipped (splash still showing, not ready/error).
   */
  private patchSplashProgress(state: AppState): boolean {
    if (state.mapStatus === "ready" || state.mapStatus === "error") {
      return false;
    }

    const splash = this.root.querySelector(".splash-screen");
    if (!splash || splash.classList.contains("splash-screen--error")) {
      return false;
    }

    const progress = Math.max(0, Math.min(100, state.loadingProgress));
    const bar = splash.querySelector<HTMLElement>(".splash-progress-bar");
    const track = splash.querySelector(".splash-progress");
    if (!bar || !track) return false;

    bar.style.width = `${progress}%`;
    track.setAttribute("aria-valuenow", String(progress));
    return true;
  }

  private loadingOverlay(state: AppState): string {
    if (state.mapStatus === "ready") {
      this.splashTaglineRevealed = false;
      return "";
    }
    const isError = state.mapStatus === "error";
    const progress = Math.max(0, Math.min(100, state.loadingProgress));
    const taglineClass = this.splashTaglineRevealed
      ? "splash-tagline splash-tagline--shown"
      : "splash-tagline splash-tagline--enter";
    this.splashTaglineRevealed = true;
    return `
      <div class="splash-screen ${isError ? "splash-screen--error" : ""}" role="status">
        <div class="splash-brand">
          <h1 class="splash-title">fplaces</h1>
          <p class="${taglineClass}">Find People, Places. Find your way!</p>
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
    const placeholder = state.arRouteSetupActive
      ? state.markers.origin
        ? "Search your destination..."
        : "Search your start point..."
      : "Search a store or place...";
    return `
      <div class="search-bar ${state.arRouteSetupActive ? "search-bar--ar-setup" : ""}">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"></circle>
          <path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        </svg>
        <input
          id="search-input"
          type="search"
          placeholder="${escapeHtml(placeholder)}"
          value="${escapeHtml(state.searchQuery)}"
          autocomplete="off"
          enterkeyhint="search"
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
    // Keep FABs clear of route sheet, or of the route-hint pill when that is showing.
    const hintVisible = !state.showRouteSheet || !state.route;
    const bottom =
      state.showRouteSheet && (state.route || state.markers.destination)
        ? "calc(252px + var(--bottom-nav-height) + env(safe-area-inset-bottom))"
        : hintVisible
          ? "calc(var(--bottom-nav-height) + 108px + env(safe-area-inset-bottom))"
          : "calc(var(--bottom-nav-height) + 48px + env(safe-area-inset-bottom))";
    const trackingActive =
      state.blueDotStatus === "active" || state.blueDotStatus === "inactive";
    const myLocationLabel = state.blueDotFollowing
      ? "Following your location"
      : trackingActive
        ? "Live location active"
        : "My location";
    const aboveSheetClass = state.showRouteSheet ? " fabs--above-sheet" : "";

    return `
      <div class="fabs${aboveSheetClass}" style="--fabs-bottom:${bottom}">
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
    const needsReset =
      state.routeNotFound && hasStart && hasEnd && !state.isCalculatingRoute;
    const canReset = hasStart || hasEnd || needsReset;
    const arSetup = state.arRouteSetupActive;
    const hint = state.isCalculatingRoute
      ? "Finding route…"
      : needsReset
        ? "No route found. Reset to start again."
        : !hasStart
          ? arSetup
            ? "Search or tap to set your start point."
            : "Tap the map to set your location."
          : !hasEnd
            ? arSetup
              ? "Now search or tap to set your destination."
              : "Tap the map to choose your destination."
            : arSetup
              ? "Route ready — open AR when you’re set."
              : "Route ready";

    return `
      <div class="route-hint ${needsReset ? "route-hint--needs-reset" : ""} ${arSetup && !hasEnd ? "route-hint--ar-setup" : ""}">
        <div class="route-steps">
          <button type="button" class="step-dot step-dot--start ${hasStart ? "is-done" : "is-active"}" data-focus="start" ${hasStart ? "" : "disabled"}></button>
          <div class="step-line ${hasStart ? "is-done" : ""}"></div>
          <button type="button" class="step-dot step-dot--end ${hasEnd ? "is-done" : hasStart ? "is-active" : ""}" data-focus="end" ${hasEnd ? "" : "disabled"}></button>
        </div>
        <div class="route-hint-copy">
          <div>${escapeHtml(hint)}</div>
          ${
            !needsReset &&
            hasEnd &&
            state.markers.destinationLabel &&
            state.markers.destinationLabel !== "End point"
              ? `<div class="route-hint-sub">${escapeHtml(state.markers.destinationLabel)}</div>`
              : ""
          }
        </div>
        ${state.isCalculatingRoute ? '<div class="mini-spinner"></div>' : ""}
        <button
          type="button"
          id="reset-points-btn"
          class="ghost-btn ${needsReset ? "ghost-btn--emphasis" : ""}"
          ${canReset ? "" : "disabled"}
        >Reset</button>
      </div>
    `;
  }

  private routeSheet(state: AppState, _app: MapApp): string {
    const summary = buildRouteSheetSummary(state);
    const resetDisabled = summary.isCalculating;
    const beginDisabled =
      summary.isCalculating ||
      state.routeSimulating ||
      summary.needsReset ||
      !state.route;
    const arDisabled = summary.isCalculating || summary.needsReset || !state.route;

    return `
      <div class="route-sheet ${summary.isCalculating ? "route-sheet--calculating" : ""} ${summary.needsReset ? "route-sheet--needs-reset" : ""}">
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
        <div class="route-sheet-actions ${summary.needsReset ? "route-sheet-actions--needs-reset" : ""}">
          ${
            summary.needsReset
              ? `
          <button
            type="button"
            id="reset-route-sheet-btn"
            class="route-sheet-reset-btn route-sheet-reset-btn--primary"
          >Reset &amp; start over</button>
              `
              : `
          <button
            type="button"
            id="begin-route-btn"
            class="route-sheet-begin-btn ${beginDisabled ? "is-disabled" : ""}"
            ${beginDisabled ? "disabled" : ""}
          >${state.routeSimulating ? "Moving…" : "Begin"}</button>
          <button
            type="button"
            id="reset-route-sheet-btn"
            class="route-sheet-reset-btn ${resetDisabled ? "is-disabled" : ""}"
            ${resetDisabled ? "disabled" : ""}
          >Reset</button>
          <button type="button" id="open-ar-btn" class="route-sheet-ar-btn" ${arDisabled ? "disabled" : ""}>
            <svg class="ar-nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2l8 4v6c0 5.25-3.5 10-8 11-4.5-1-8-5.75-8-11V6l8-4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
            </svg>
            Start AR navigation
          </button>
              `
          }
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
          ${bottomNavNavigateIcon}
          <span class="bottom-nav-label">Navigate</span>
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

    const homeVenueSearchInput =
      this.root.querySelector<HTMLInputElement>("#home-venue-search-input");
    homeVenueSearchInput?.addEventListener("input", () => {
      app.setHomeVenueSearchQuery(homeVenueSearchInput.value);
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-home-venue-id]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          const venueId = button.dataset.homeVenueId;
          if (venueId) app.selectHomeRecentVenue(venueId);
        });
      },
    );

    this.root
      .querySelector("#first-visit-discover-btn")
      ?.addEventListener("click", () => {
        app.openVenueDiscover();
      });
    this.root
      .querySelector("#first-visit-see-all-btn")
      ?.addEventListener("click", () => {
        app.openVenueDiscover();
      });
    this.root
      .querySelector("#first-visit-ar-btn")
      ?.addEventListener("click", () => {
        void app.openVenueArFromHome();
      });
    this.root
      .querySelector("#first-visit-ar-open-map-btn")
      ?.addEventListener("click", () => {
        app.confirmArRoutePrompt();
      });
    this.root
      .querySelector("#first-visit-ar-prompt-dismiss")
      ?.addEventListener("click", () => {
        app.dismissArRoutePrompt();
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
        void app.dismissRouteSheet();
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

    this.root
      .querySelector("#ar-nav-close-btn")
      ?.addEventListener("click", () => {
        app.closeAr();
      });

    this.root
      .querySelector("#ar-nav-minimize-btn")
      ?.addEventListener("click", () => {
        app.minimizeAr();
      });

    this.root
      .querySelector("#ar-nav-end-btn")
      ?.addEventListener("click", () => {
        void app.endArNavigation();
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
      .querySelector("#onboarding-continue")
      ?.addEventListener("click", () => {
        app.showArTeaser();
      });

    this.root
      .querySelector("#ar-teaser-skip-btn")
      ?.addEventListener("click", () => {
        app.showCreateAccount();
      });

    this.root
      .querySelector("#ar-teaser-continue")
      ?.addEventListener("click", () => {
        app.showCreateAccount();
      });

    this.root
      .querySelector("#introduction-continue")
      ?.addEventListener("click", () => {
        app.showFeatures();
      });

    this.root
      .querySelector("#features-continue")
      ?.addEventListener("click", () => {
        app.showCreateAccount();
      });

    this.root
      .querySelector("#auth-back-btn")
      ?.addEventListener("click", () => {
        app.dismissCreateAccount();
      });

    this.root
      .querySelector("#auth-login-link")
      ?.addEventListener("click", () => {
        app.showLogin();
      });

    this.root
      .querySelector("#auth-google-btn")
      ?.addEventListener("click", () => {
        void app.submitGoogleSignIn();
      });

    this.root
      .querySelector("#auth-guest-btn")
      ?.addEventListener("click", () => {
        void app.continueAsGuest();
      });

    this.root
      .querySelector("#login-back-btn")
      ?.addEventListener("click", () => {
        app.dismissLogin();
      });

    this.root
      .querySelector("#login-create-link")
      ?.addEventListener("click", () => {
        app.showCreateAccount();
      });

    this.root
      .querySelector("#login-forgot-link")
      ?.addEventListener("click", () => {
        app.showForgotPassword();
      });

    this.root
      .querySelector("#login-google-btn")
      ?.addEventListener("click", () => {
        void app.submitGoogleSignIn();
      });

    this.root
      .querySelector("#forgot-password-back-btn")
      ?.addEventListener("click", () => {
        app.dismissForgotPassword();
      });

    this.root
      .querySelector("#forgot-password-login-link")
      ?.addEventListener("click", () => {
        app.dismissForgotPassword();
      });

    this.root
      .querySelector("#forgot-password-email")
      ?.addEventListener("input", (event) => {
        this.authEmailDraft = (event.currentTarget as HTMLInputElement).value;
      });

    this.root
      .querySelector("#forgot-password-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const email =
          form.querySelector<HTMLInputElement>("#forgot-password-email")
            ?.value ?? "";
        void app.submitForgotPassword(email);
      });

    this.root
      .querySelector("#reset-password-back-btn")
      ?.addEventListener("click", () => {
        app.dismissResetPasswordConfirm();
      });

    this.root
      .querySelector("#reset-password-login-link")
      ?.addEventListener("click", () => {
        app.dismissResetPasswordConfirm();
      });

    this.root
      .querySelector("#reset-password-confirm-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const password =
          this.root.querySelector<HTMLInputElement>("#reset-password-new")
            ?.value ?? "";
        void app.submitResetPasswordConfirm(password);
      });

    this.root
      .querySelector("#location-enable-btn")
      ?.addEventListener("click", () => {
        void app.enableLocationPermission();
      });

    this.root
      .querySelector("#location-try-again-btn")
      ?.addEventListener("click", () => {
        void app.retryLocationPermission();
      });

    this.root
      .querySelector("#location-retry-btn")
      ?.addEventListener("click", () => {
        void app.retryLocationRetrieval();
      });

    this.root
      .querySelector("#login-email")
      ?.addEventListener("input", (event) => {
        this.authEmailDraft = (event.currentTarget as HTMLInputElement).value;
      });

    this.root
      .querySelector("#login-password")
      ?.addEventListener("input", (event) => {
        this.authPasswordDraft = (
          event.currentTarget as HTMLInputElement
        ).value;
      });

    this.root
      .querySelector("#login-password")
      ?.addEventListener("change", (event) => {
        this.authPasswordDraft = (
          event.currentTarget as HTMLInputElement
        ).value;
      });

    this.root
      .querySelector("#login-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const email =
          form.querySelector<HTMLInputElement>("#login-email")?.value ?? "";
        const password =
          form.querySelector<HTMLInputElement>("#login-password")?.value ?? "";
        this.authPasswordDraft = password;
        void app.submitLogin(email, password);
      });

    this.root
      .querySelector("#auth-email")
      ?.addEventListener("input", (event) => {
        this.authEmailDraft = (event.currentTarget as HTMLInputElement).value;
      });

    this.root
      .querySelector("#auth-password")
      ?.addEventListener("input", (event) => {
        this.createPasswordDraft = (
          event.currentTarget as HTMLInputElement
        ).value;
      });

    this.root
      .querySelector("#auth-password-confirm")
      ?.addEventListener("input", (event) => {
        this.createPasswordConfirmDraft = (
          event.currentTarget as HTMLInputElement
        ).value;
      });

    this.root
      .querySelector("#auth-terms")
      ?.addEventListener("change", (event) => {
        this.createTermsAcceptedDraft = (
          event.currentTarget as HTMLInputElement
        ).checked;
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
        const termsAccepted =
          form.querySelector<HTMLInputElement>("#auth-terms")?.checked ?? false;
        this.createPasswordDraft = password;
        this.createPasswordConfirmDraft = passwordConfirm;
        this.createTermsAcceptedDraft = termsAccepted;
        void app.submitRegistration(
          email,
          password,
          passwordConfirm,
          termsAccepted,
        );
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-password-toggle]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const inputId = button.dataset.passwordToggle;
          if (!inputId) return;
          const input = this.root.querySelector<HTMLInputElement>(`#${inputId}`);
          if (!input) return;
          const showing = input.type === "text";
          input.type = showing ? "password" : "text";
          button.setAttribute(
            "aria-label",
            showing ? "Show password" : "Hide password",
          );
        });
      });

    const passwordInput =
      this.root.querySelector<HTMLInputElement>("#auth-password");
    const strengthHint = this.root.querySelector<HTMLElement>(
      "#auth-password-strength",
    );
    const syncPasswordStrength = (): void => {
      if (!passwordInput || !strengthHint) return;
      const strength = evaluatePasswordStrength(passwordInput.value);
      strengthHint.hidden = strength !== "strong";
    };
    passwordInput?.addEventListener("input", syncPasswordStrength);
    syncPasswordStrength();

    this.root
      .querySelector("#auth-terms-link")
      ?.addEventListener("click", () => {
        app.openAuthTerms();
      });

    this.root
      .querySelector("#auth-privacy-link")
      ?.addEventListener("click", () => {
        app.openAuthPrivacy();
      });

    this.root
      .querySelector("#auth-legal-back-btn")
      ?.addEventListener("click", () => {
        app.dismissAuthLegal();
      });

    this.root
      .querySelector("#legal-webview-cancel")
      ?.addEventListener("click", () => {
        app.dismissLegalWebView();
      });

    this.root
      .querySelector("#legal-webview-dismiss")
      ?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) {
          app.dismissLegalWebView();
        }
      });

    this.root
      .querySelector("#check-email-back-btn")
      ?.addEventListener("click", () => {
        app.dismissCheckEmail();
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
        void app.resendVerificationCode().then((ok) => {
          if (ok) this.restartVerifyResendCountdown();
        });
      });

    this.root
      .querySelector("#verify-email-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        void app.submitVerification(this.readOtpValue());
      });

    if (this.root.querySelector("#verify-resend-status")) {
      this.ensureVerifyResendCountdown();
    }

    this.root
      .querySelector("#pseudo-name-back-btn")
      ?.addEventListener("click", () => {
        app.dismissPseudoNameSetup();
      });

    this.root
      .querySelector("#pseudo-name-input")
      ?.addEventListener("input", (event) => {
        this.pseudoNameDraft = (
          event.currentTarget as HTMLInputElement
        ).value;
      });

    this.root
      .querySelector("#pseudo-name-shuffle-btn")
      ?.addEventListener("click", () => {
        this.pseudoNameDraft = null;
        app.shufflePseudoName();
      });

    this.root
      .querySelectorAll<HTMLButtonElement>(".interest-chip")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const interest = button.dataset.interest;
          if (interest) app.toggleInterest(interest);
        });
      });

    this.root
      .querySelector("#pseudo-name-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const input =
          this.root.querySelector<HTMLInputElement>("#pseudo-name-input");
        void app.submitPseudoNameSetup(
          input?.value ?? this.pseudoNameDraft ?? "",
        );
      });

    this.root
      .querySelector("#venue-select-back-btn")
      ?.addEventListener("click", () => {
        app.dismissVenueSelect();
      });

    this.root
      .querySelector("#venue-select-search-input")
      ?.addEventListener("input", (event) => {
        const value = (event.currentTarget as HTMLInputElement).value;
        this.venueSearchDraft = value;
        app.setVenueSearchQuery(value);
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-venue-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const venueId = button.dataset.venueId;
          if (venueId) app.selectOnboardingVenue(venueId);
        });
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-gate-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const gateId = button.dataset.gateId;
          if (gateId) app.selectOnboardingGate(gateId);
        });
      });

    this.root
      .querySelector("#venue-select-enter-btn")
      ?.addEventListener("click", () => {
        app.submitVenueSelect();
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
      .querySelector("#settings-edit-profile-btn")
      ?.addEventListener("click", () => {
        app.openEditProfileFromSettings();
      });

    this.root
      .querySelector("#settings-change-password-btn")
      ?.addEventListener("click", () => {
        app.openChangePasswordFromSettings();
      });

    this.root
      .querySelector("#settings-interests-btn")
      ?.addEventListener("click", () => {
        app.openEditProfileFromSettings();
      });

    this.root
      .querySelector("#settings-language-btn")
      ?.addEventListener("click", () => {
        app.openMapLanguageSettings();
      });

    this.root
      .querySelector("#settings-language-back-btn")
      ?.addEventListener("click", () => {
        app.closeMapLanguageSettings();
      });

    this.root
      .querySelector("#edit-profile-back-btn")
      ?.addEventListener("click", () => {
        app.closeEditProfileSettings();
      });

    this.root
      .querySelector("#edit-profile-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const input =
          this.root.querySelector<HTMLInputElement>("#pseudo-name-input");
        void app.submitProfileEditFromSettings(
          input?.value ?? this.pseudoNameDraft ?? "",
        );
      });

    this.root
      .querySelector("#change-password-back-btn")
      ?.addEventListener("click", () => {
        app.closeChangePasswordSettings();
      });

    this.root
      .querySelector("#change-password-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const oldPassword =
          this.root.querySelector<HTMLInputElement>("#change-password-old")
            ?.value ?? "";
        const newPassword =
          this.root.querySelector<HTMLInputElement>("#change-password-new")
            ?.value ?? "";
        void app.submitChangePassword(oldPassword, newPassword);
      });

    this.root
      .querySelector("#settings-privacy-btn")
      ?.addEventListener("click", () => {
        app.openPrivacySettings();
      });

    this.root
      .querySelector("#settings-terms-btn")
      ?.addEventListener("click", () => {
        app.openTermsSettings();
      });

    this.root
      .querySelector("#settings-about-btn")
      ?.addEventListener("click", () => {
        app.openAboutSettings();
      });

    this.root
      .querySelector("#settings-privacy-back-btn")
      ?.addEventListener("click", () => {
        app.closeSecondarySettings();
      });

    this.root
      .querySelector("#settings-about-back-btn")
      ?.addEventListener("click", () => {
        app.closeSecondarySettings();
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-map-language]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const code = button.dataset.mapLanguage;
          if (!code) return;
          void app.setMapLanguage(code);
        });
      });

    this.root
      .querySelector("#settings-notifications-toggle")
      ?.addEventListener("click", () => {
        app.toggleNotifications();
      });

    this.root
      .querySelector("#settings-change-venue-btn")
      ?.addEventListener("click", () => {
        app.openVenueSelectFromSettings();
      });

    this.root
      .querySelector("#settings-simulation-toggle")
      ?.addEventListener("click", () => {
        app.toggleSimulation();
      });

    this.root
      .querySelector("#settings-logout-btn")
      ?.addEventListener("click", () => {
        app.requestLogoutConfirm();
      });

    this.root
      .querySelector("#settings-delete-account-btn")
      ?.addEventListener("click", () => {
        app.requestDeleteAccountConfirm();
      });

    this.root
      .querySelector("#settings-confirm-cancel-btn")
      ?.addEventListener("click", () => {
        app.dismissSettingsConfirm();
      });

    this.root
      .querySelector("#settings-confirm-dismiss")
      ?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) {
          app.dismissSettingsConfirm();
        }
      });

    this.root
      .querySelector("#settings-confirm-logout-btn")
      ?.addEventListener("click", () => {
        void app.logout();
      });

    this.root
      .querySelector("#settings-confirm-delete-btn")
      ?.addEventListener("click", () => {
        void app.deleteAccount();
      });

    this.root
      .querySelector("#venue-feed-notify-btn")
      ?.addEventListener("click", () => {
        app.openNotifications();
      });

    this.root
      .querySelector("#notifications-back-btn")
      ?.addEventListener("click", () => {
        app.closeNotifications();
      });

    this.root
      .querySelector("#notification-detail-back-btn")
      ?.addEventListener("click", () => {
        app.closeNotificationDetail();
      });

    this.root
      .querySelector("#notifications-mark-all-btn")
      ?.addEventListener("click", () => {
        void app.markAllNotificationsAsRead();
      });

    this.root
      .querySelector("#notifications-load-more-btn")
      ?.addEventListener("click", () => {
        void app.loadMoreNotifications();
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-notification-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const notificationId = button.dataset.notificationId;
          if (notificationId) void app.openNotificationDetail(notificationId);
        });
      });

    this.root
      .querySelector("#post-comments-back-btn")
      ?.addEventListener("click", () => {
        app.closePostComments();
      });

    this.root
      .querySelector("#post-comments-input")
      ?.addEventListener("input", (event) => {
        app.setPostCommentsDraft(
          (event.currentTarget as HTMLInputElement).value,
        );
      });

    this.root
      .querySelector("#post-comments-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        void app.submitPostComment();
      });

    this.root
      .querySelector("#post-comments-edit-btn")
      ?.addEventListener("click", () => {
        app.beginEditVenueFeedPost();
      });

    this.root
      .querySelector("#post-comments-edit-cancel-btn")
      ?.addEventListener("click", () => {
        app.cancelEditVenueFeedPost();
      });

    this.root
      .querySelector("#post-comments-edit-save-btn")
      ?.addEventListener("click", () => {
        const content =
          this.root.querySelector<HTMLTextAreaElement>(
            "#post-comments-edit-input",
          )?.value ?? "";
        void app.saveEditedVenueFeedPost(content);
      });

    this.root
      .querySelector("#post-comments-delete-post-btn")
      ?.addEventListener("click", () => {
        void app.deleteOpenVenueFeedPost();
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-delete-comment-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const commentId = button.dataset.deleteCommentId;
          if (commentId) void app.deletePostComment(commentId);
        });
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-comments-id]")
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const postId = button.dataset.commentsId;
          if (postId) app.openPostComments(postId);
        });
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
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const postId = button.dataset.upvoteId;
          if (postId) void app.toggleVenueFeedUpvote(postId);
        });
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-flag-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const postId = button.dataset.flagId;
          if (postId) void app.flagVenueFeedPost(postId);
        });
      });

    const venueFeedInput =
      this.root.querySelector<HTMLInputElement>("#venue-feed-input");
    venueFeedInput?.addEventListener("input", () => {
      app.setVenueFeedDraft(venueFeedInput.value);
    });
    venueFeedInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void app.submitVenueFeedPost();
    });

    this.root
      .querySelector("#venue-feed-send-btn")
      ?.addEventListener("click", () => {
        void app.submitVenueFeedPost();
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

  private restoreLoginPasswordDraft(showLogin: boolean): void {
    if (!showLogin || !this.authPasswordDraft) return;
    const passwordInput =
      this.root.querySelector<HTMLInputElement>("#login-password");
    if (passwordInput && !passwordInput.value) {
      passwordInput.value = this.authPasswordDraft;
    }
  }

  private restoreCreateAccountDrafts(showCreateAccount: boolean): void {
    if (!showCreateAccount) return;

    const passwordInput =
      this.root.querySelector<HTMLInputElement>("#auth-password");
    const confirmInput = this.root.querySelector<HTMLInputElement>(
      "#auth-password-confirm",
    );
    const termsInput =
      this.root.querySelector<HTMLInputElement>("#auth-terms");
    const strengthHint = this.root.querySelector<HTMLElement>(
      "#auth-password-strength",
    );

    if (passwordInput) {
      passwordInput.value = this.createPasswordDraft;
    }
    if (confirmInput) {
      confirmInput.value = this.createPasswordConfirmDraft;
    }
    if (termsInput) {
      termsInput.checked = this.createTermsAcceptedDraft;
    }
    if (passwordInput && strengthHint) {
      strengthHint.hidden =
        evaluatePasswordStrength(passwordInput.value) !== "strong";
    }
  }

  private readOtpValue(): string {
    return Array.from(
      this.root.querySelectorAll<HTMLInputElement>(".otp-digit"),
    )
      .map((input) => input.value.trim())
      .join("");
  }

  private applyOtpDigits(inputs: HTMLInputElement[], raw: string): string {
    const digits = normalizeOtpDigits(raw);
    if (!digits) return this.readOtpValue();

    inputs.forEach((input, index) => {
      input.value = digits[index] ?? "";
    });

    this.otpDraft = digits;
    return this.otpDraft;
  }

  private bindOtpInputs(app: MapApp, focusedOtpIndex: number | null): void {
    const inputs = Array.from(
      this.root.querySelectorAll<HTMLInputElement>(".otp-digit"),
    );
    if (!inputs.length) return;

    if (this.otpDraft) {
      this.applyOtpDigits(inputs, this.otpDraft);
    }

    const focusIndex =
      focusedOtpIndex != null && Number.isFinite(focusedOtpIndex)
        ? Math.min(Math.max(focusedOtpIndex, 0), inputs.length - 1)
        : this.otpDraft.length < inputs.length
          ? this.otpDraft.length
          : 0;
    inputs[focusIndex]?.focus();

    const maybeSubmit = (code: string): void => {
      if (isCompleteOtpCode(code)) {
        void app.submitVerification(code);
      }
    };

    inputs.forEach((input, index) => {
      input.addEventListener("input", () => {
        const rawDigits = normalizeOtpDigits(input.value);
        // Browser / OS OTP autofill inserts the full code into one field.
        if (rawDigits.length > 1) {
          const code = this.applyOtpDigits(inputs, rawDigits);
          const nextIndex = Math.min(code.length, inputs.length) - 1;
          inputs[Math.max(nextIndex, 0)]?.focus();
          maybeSubmit(code);
          return;
        }

        const digit = rawDigits.slice(-1);
        input.value = digit;
        this.otpDraft = this.readOtpValue();
        if (digit && index < inputs.length - 1) {
          inputs[index + 1]?.focus();
        }
        maybeSubmit(this.otpDraft);
      });

      input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && index > 0) {
          const previous = inputs[index - 1];
          previous?.focus();
          if (previous) previous.value = "";
          this.otpDraft = this.readOtpValue();
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
        const pasted = normalizeOtpDigits(
          event.clipboardData?.getData("text") ?? "",
        );
        if (!pasted) return;

        const code = this.applyOtpDigits(inputs, pasted);
        const nextIndex = Math.min(code.length, OTP_CODE_LENGTH) - 1;
        inputs[Math.max(nextIndex, 0)]?.focus();
        maybeSubmit(code);
      });
    });
  }

  private ensureVerifyResendCountdown(): void {
    if (this.verifyResendEndsAt == null) {
      this.verifyResendEndsAt = Date.now() + RESEND_OTP_COOLDOWN_MS;
    }
    this.syncVerifyResendUi();
    if (this.verifyResendInterval == null) {
      this.verifyResendInterval = window.setInterval(() => {
        this.syncVerifyResendUi();
      }, 250);
    }
  }

  private restartVerifyResendCountdown(): void {
    this.verifyResendEndsAt = Date.now() + RESEND_OTP_COOLDOWN_MS;
    this.syncVerifyResendUi();
    if (this.verifyResendInterval == null) {
      this.verifyResendInterval = window.setInterval(() => {
        this.syncVerifyResendUi();
      }, 250);
    }
  }

  private clearVerifyResendCountdown(): void {
    if (this.verifyResendInterval != null) {
      window.clearInterval(this.verifyResendInterval);
      this.verifyResendInterval = null;
    }
    this.verifyResendEndsAt = null;
  }

  private syncVerifyResendUi(): void {
    const countdown = this.root.querySelector<HTMLElement>(
      ".verify-resend-countdown",
    );
    const ready = this.root.querySelector<HTMLElement>(".verify-resend-ready");
    const timer = this.root.querySelector<HTMLElement>("#verify-resend-timer");
    if (!countdown || !ready || !timer || this.verifyResendEndsAt == null) {
      return;
    }

    const remainingMs = this.verifyResendEndsAt - Date.now();
    if (remainingMs <= 0) {
      countdown.hidden = true;
      ready.hidden = false;
      return;
    }

    countdown.hidden = false;
    ready.hidden = true;
    timer.textContent = formatResendCountdown(remainingMs / 1000);
  }
}
