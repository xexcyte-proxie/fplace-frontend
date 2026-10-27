import {
  isLocationGateAuthStep,
} from "../location/domain/location-gate";
import {
  resolveStartupShell,
  shouldHideMapCanvas,
  shouldShowMapBootOverlay,
} from "../session/domain/entities";
import type { AppState, AuthStep } from "../types";
import { resolveDisplayName } from "../types";
import type { MapApp } from "../services/map-app";
import { buildRouteSheetSummary } from "./route-summary";
import { renderOnboardingScreen } from "./onboarding-screen";
import { renderArTeaserScreen } from "./ar-teaser-screen";
import { renderIntroductionScreen } from "./introduction-screen";
import { renderFeaturesScreen } from "./features-screen";
import { renderCreateAccountScreen } from "./create-account-screen";
import { renderLoginScreen } from "./login-screen";
import { renderForgotPasswordScreen } from "./forgot-password-screen";
import { AUTH_AUTOFILL_ANIMATION_NAME } from "./auth-autofill";
import { renderResetPasswordConfirmScreen } from "./reset-password-confirm-screen";
import { renderCheckEmailScreen } from "./check-email-screen";
import { renderVerifyEmailScreen } from "./verify-email-screen";
import { renderPseudoNameScreen } from "./pseudo-name-screen";
import { buildSearchResultViews } from "./search-results-data";
import { renderContentLoadingOverlay } from "./content-loading-overlay";
import { renderMapBootOverlay } from "./map-boot-overlay";
import {
  applyVenueSelectGatePatch,
  renderVenueSelectScreen,
} from "./venue-select-screen";
import {
  renderLocationErrorScreen,
  renderLocationPermissionRequiredScreen,
  renderLocationPermissionScreen,
} from "./location-permission-screen";
import { renderVenueFeedScreen } from "./venue-feed-screen";
import { renderPostCommentsScreen } from "./post-comments-screen";
import { renderProfileScreen } from "./profile-screen";
import { canPatchProfileUpvotes, patchProfileUpvotes } from "./profile-upvote-patch";
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
import { renderGuestArGateDialog } from "./guest-ar-gate-dialog";
import { renderInvalidTokenDialog } from "./invalid-token-dialog";
import { renderArrivalDialog } from "./arrival-dialog";
import { renderReturningHomeScreen } from "./returning-home-screen";
import { renderFirstVisitVenueScreen } from "./first-visit-venue-screen";
import { renderNavigateHubScreen } from "./navigate-hub-screen";
import { renderLocationActionSheet } from "./location-action-sheet";
import {
  layoutProductTourOverlay,
  renderProductTour,
} from "./product-tour";
import {
  initialProductTourSteps,
  isProductTourDontShowAgain,
  productTourStepsByIds,
} from "../tour/domain/entities";
import {
  bottomNavNavigateIcon,
  bottomNavHomeIcon,
  bottomNavProfileIcon,
  bottomNavSocialIcon,
} from "./bottom-nav-icons";
import {
  applyLiveNavigationUiPatch,
  liveTrackingMessage,
  applyMyLocationFabPatch,
  applyNotifyBadgeUiPatch,
  applyToastUiPatch,
  classifyUiStateChange,
  myLocationFabPresentation,
  routeNavigationPresencePresentation,
  renderToastHtml,
} from "./live-navigation-ui";
import { buildReturningHomeViewModel } from "../home/presentation/returning-home-data";
import { renderHomeVenueSections } from "./home-venue-list";
import {
  installUiRootEventDelegation,
  syncAuthPasswordStrength,
} from "./ui-root-events";

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
  private authPasswordDraft = "";
  private createPasswordDraft = "";
  private createPasswordConfirmDraft = "";
  private createTermsAcceptedDraft = false;
  private resetPasswordDraft = "";
  private loginCredentialAutofillRequested = false;
  private changePasswordOldDraft = "";
  private changePasswordNewDraft = "";
  private changePasswordOldVisible = false;
  private changePasswordNewVisible = false;
  private pseudoNameDraft: string | null = null;
  private venueSearchDraft: string | null = null;
  private otpDraft = "";
  private verifyResendEndsAt: number | null = null;
  private verifyResendInterval: number | null = null;
  private lastRenderedState: AppState | null = null;
  private app: MapApp | null = null;

  constructor(container: HTMLElement) {
    this.root = container;
    this.root.className = "ui-root";
    installUiRootEventDelegation(this.root, {
      root: this.root,
      app: () => this.app,
      setAuthEmailDraft: (value) => {
        this.authEmailDraft = value;
      },
      setAuthPasswordDraft: (value) => {
        this.authPasswordDraft = value;
      },
      setCreatePasswordDraft: (value) => {
        this.createPasswordDraft = value;
      },
      setCreatePasswordConfirmDraft: (value) => {
        this.createPasswordConfirmDraft = value;
      },
      setCreateTermsAcceptedDraft: (value) => {
        this.createTermsAcceptedDraft = value;
      },
      setResetPasswordDraft: (value) => {
        this.resetPasswordDraft = value;
      },
      setChangePasswordOldDraft: (value) => {
        this.changePasswordOldDraft = value;
      },
      setChangePasswordNewDraft: (value) => {
        this.changePasswordNewDraft = value;
      },
      setChangePasswordOldVisible: (value) => {
        this.changePasswordOldVisible = value;
      },
      setChangePasswordNewVisible: (value) => {
        this.changePasswordNewVisible = value;
      },
      setPseudoNameDraft: (value) => {
        this.pseudoNameDraft = value;
      },
      setVenueSearchDraft: (value) => {
        this.venueSearchDraft = value;
      },
      getPseudoNameDraft: () => this.pseudoNameDraft,
      restartVerifyResendCountdown: () => this.restartVerifyResendCountdown(),
      readOtpValue: () => this.readOtpValue(),
    });
    window.addEventListener("resize", () => this.layoutProductTour());
    window.visualViewport?.addEventListener("resize", () =>
      this.layoutProductTour(),
    );
  }

  private layoutProductTour(): void {
    requestAnimationFrame(() => {
      layoutProductTourOverlay(this.root);
      requestAnimationFrame(() => layoutProductTourOverlay(this.root));
    });
  }

  render(state: AppState, app: MapApp): void {
    this.app = app;
    // Keep the splash DOM intact while only loading progress changes so the
    // bottom loader stays visible.
    if (this.patchSplashProgress(state)) {
      return;
    }
    if (this.patchMapBootProgress(state)) {
      return;
    }

    if (this.lastRenderedState) {
      if (canPatchProfileUpvotes(this.lastRenderedState, state) && patchProfileUpvotes(this.root, state)) {
        this.lastRenderedState = state;
        return;
      }
      const kind = classifyUiStateChange(this.lastRenderedState, state);
      if (kind === "live") {
        applyLiveNavigationUiPatch(this.root, state);
        this.lastRenderedState = state;
        return;
      }
      if (kind === "toast") {
        applyToastUiPatch(this.root, state.toast);
        this.lastRenderedState = state;
        return;
      }
      if (kind === "search") {
        this.applySearchPatch(state);
        this.lastRenderedState = state;
        return;
      }
      if (kind === "home-search") {
        this.applyHomeSearchPatch(state);
        this.lastRenderedState = state;
        return;
      }
      if (kind === "social-feed") {
        this.applySocialFeedPatch(state);
        this.lastRenderedState = state;
        return;
      }
      if (kind === "notify-badge") {
        applyNotifyBadgeUiPatch(this.root, state);
        this.lastRenderedState = state;
        return;
      }
      if (kind === "venue-select-gate") {
        applyVenueSelectGatePatch(this.root, state);
        this.lastRenderedState = state;
        return;
      }
      if (kind === "heatmap-map" || kind === "silent") {
        this.lastRenderedState = state;
        return;
      }
    }

    const activeEl = document.activeElement;
    const focusedSearch =
      activeEl?.id === "search-input"
        ? (activeEl as HTMLInputElement)
        : null;
    const focusedSearchId = focusedSearch?.id ?? "search-input";
    const selectionStart = focusedSearch?.selectionStart ?? null;
    const selectionEnd = focusedSearch?.selectionEnd ?? null;

    const startupShell = resolveStartupShell({
      destinationResolved: state.startupReady,
      onboardingComplete: state.onboardingComplete,
    });
    const showOnboardingFlow = startupShell === "onboarding";
    const locationDialogStep = isLocationGateAuthStep(state.authStep)
      ? state.authStep
      : null;
    const authUiStep: AuthStep = locationDialogStep
      ? state.authStepBeforeLocation ?? "create"
      : state.authStep;
    const showOnboardingScreen =
      showOnboardingFlow &&
      authUiStep === "none" &&
      (!state.authLoading || state.guestContinueLoading);
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
      state.startupReady && authUiStep === "reset-password-confirm";
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
      locationDialogStep === "location-permission";
    const showLocationRequired =
      locationDialogStep === "location-required";
    const showLocationError =
      locationDialogStep === "location-error";
    const arFullscreen = state.arPresentation === "fullscreen";
    const showOverlays =
      startupShell === "app" &&
      !arFullscreen &&
      !showResetPasswordConfirm;
    const showMapBootOverlay = shouldShowMapBootOverlay({
      shell: startupShell,
      activeTab: state.activeTab,
      navigateView: state.navigateView,
      mapStatus: state.mapStatus,
    });
    const onHomeTab = state.activeTab === "home";
    const onMapTab = state.activeTab === "map";
    const onNavigateHome =
      showOverlays && onMapTab && state.navigateView === "home";
    const onGeneralHome = showOverlays && onHomeTab;
    const onFirstVisitHome =
      onGeneralHome && state.homeExperience === "first-visit";
    const onReturningHome =
      onGeneralHome && state.homeExperience !== "first-visit";
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
    const tourSteps = state.productTourStepIds.length
      ? productTourStepsByIds(state.productTourStepIds)
      : initialProductTourSteps();
    const tourStep =
      showOverlays && state.productTourStepIndex != null
        ? (tourSteps[state.productTourStepIndex] ?? null)
        : null;
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

    // Full renders replace the DOM, which would snap the venue feed back to
    // the top on every keystroke, upvote, or live WebSocket event. Capture
    // the scroll offset so it can be restored after the rebuild.
    const venueFeedScrollTop =
      this.root.querySelector<HTMLElement>(".venue-feed-scroll")?.scrollTop ??
      null;

    // Same for venue-select: gate taps and live location updates rebuild the
    // screen and would otherwise yank the list back to the top.
    const venueSelectScrollTop =
      this.root.querySelector<HTMLElement>(".venue-select-body")?.scrollTop ??
      null;

    const focusedPostCommentsInput =
      activeEl?.id === "post-comments-input"
        ? (activeEl as HTMLInputElement)
        : null;
    const postCommentsSelectionStart =
      focusedPostCommentsInput?.selectionStart ?? null;
    const postCommentsSelectionEnd =
      focusedPostCommentsInput?.selectionEnd ?? null;

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

    const liveAuthEmail =
      this.root.querySelector<HTMLInputElement>(
        "#login-email, #auth-email, #forgot-password-email",
      )?.value;
    if (liveAuthEmail) this.authEmailDraft = liveAuthEmail;

    const preserveAuthEmailDraft =
      showCreateAccount ||
      showCheckEmail ||
      showVerifyEmail ||
      showLogin ||
      showForgotPassword ||
      showResetPasswordConfirm ||
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
    if (showResetPasswordConfirm) {
      const liveResetPassword =
        this.root.querySelector<HTMLInputElement>("#reset-password-new")
          ?.value;
      if (liveResetPassword) this.resetPasswordDraft = liveResetPassword;
    } else {
      this.resetPasswordDraft = "";
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
      activeEl?.id === "home-venue-search-input" ||
      activeEl?.id === "navigate-search-input"
        ? (activeEl as HTMLInputElement)
        : null;
    const focusedHomeVenueSearchId =
      focusedHomeVenueSearch?.id ?? "home-venue-search-input";
    const homeVenueSearchSelectionStart =
      focusedHomeVenueSearch?.selectionStart ?? null;
    const homeVenueSearchSelectionEnd =
      focusedHomeVenueSearch?.selectionEnd ?? null;

    // visibility:hidden keeps layout so Mappedin can boot off-screen.
    // Hide as soon as we are not on the indoor map, and while a venue map boots.
    const hideMapCanvas = shouldHideMapCanvas({
      shell: startupShell,
      activeTab: state.activeTab,
      navigateView: state.navigateView,
      mapStatus: state.mapStatus,
    });
    document
      .getElementById("mappedin-map")
      ?.classList.toggle("is-hidden", hideMapCanvas);

    const postCommentsPost =
      state.postCommentsPostId != null
        ? state.venueFeedPosts.find(
            (post) => post.id === state.postCommentsPostId,
          ) ?? null
        : null;

    this.root.innerHTML = `
      ${this.loadingOverlay(state)}
      ${state.locationGateLoading && !isLocationGateAuthStep(state.authStep)
        ? renderLocationPermissionScreen({ locationGateLoading: true })
        : ""}
      ${onNavigateMap && showMapBootOverlay ? renderMapBootOverlay(state) : ""}
      ${showOnboardingScreen ? renderOnboardingScreen({
        guestAccessAllowed: state.guestAccessAllowed,
        authLoading: state.authLoading,
      }) : ""}
      ${showArTeaser ? renderArTeaserScreen() : ""}
      ${showIntroduction ? renderIntroductionScreen() : ""}
      ${showFeatures ? renderFeaturesScreen() : ""}
      ${showCreateAccount ? renderCreateAccountScreen({
        authEmail: this.authEmailDraft || state.authEmail,
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
        guestAccessAllowed: state.guestAccessAllowed,
        guestContinueLoading: state.guestContinueLoading,
      }) : ""}
      ${
        showCreateAccount &&
        state.createAccountPrompt === "invalid-token" &&
        state.guestAccessAllowed !== false
          ? renderInvalidTokenDialog()
          : ""
      }
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
        username: this.authEmailDraft || state.authEmail,
      }) : ""}
      ${showAuthPrivacy ? renderAuthPrivacyScreen() : ""}
      ${showCheckEmail ? renderCheckEmailScreen({
        authEmail: state.authEmail || state.authUser?.email || "",
        authLoading: state.authLoading,
        checkEmailPurpose: state.checkEmailPurpose,
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
        interestOptions: state.interestOptions,
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
        allowBack: !state.authUser,
      }) : ""}
      ${showVenueSelect ? renderVenueSelectScreen({
        venueSearchQuery: this.venueSearchDraft ?? state.venueSearchQuery,
        selectedVenueId: state.selectedVenueId,
        selectedFloorId: state.selectedFloorId,
        selectedGateId: state.selectedGateId,
        forumVenues: state.forumVenues,
        forumFloors: state.forumFloors,
        forumSections: state.forumSections,
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
        locationPermission: state.locationPermission,
        userLocation: state.userLocation,
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
      ${onNavigateHome ? renderNavigateHubScreen(state) : ""}
      ${onNavigateMap ? this.homeHeader(state) : ""}
      ${onNavigateMap && !showMapBootOverlay && state.searchQuery.trim() ? this.searchResults(state) : ""}
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
        interestOptions: state.interestOptions,
        profileEditSaving: state.profileEditSaving,
        authFieldErrors: state.authFieldErrors,
      }) : ""}
      ${showOverlays && onProfileChangePassword ? renderChangePasswordScreen({
        authLoading: state.authLoading,
        authFieldErrors: state.authFieldErrors,
        oldPasswordVisible: this.changePasswordOldVisible,
        newPasswordVisible: this.changePasswordNewVisible,
        username: state.authUser?.email || state.authEmail,
      }) : ""}
      ${showOverlays && onProfileAbout ? renderAboutSettingsScreen() : ""}
      ${showOverlays && onProfilePrivacy ? renderPrivacySettingsScreen() : ""}
      ${showOverlays && !onProfileOverlay && !onNotificationsInbox ? this.bottomNav(state) : ""}
      ${
        showOverlays && state.guestArGatePrompt
          ? renderGuestArGateDialog(state.guestArGatePrompt, {
              loading: state.guestArGateLoading,
            })
          : ""
      }
      ${
        onNavigateMap && state.arrivalDialogOpen
          ? renderArrivalDialog(
              state.route?.destinationName ?? state.markers.destinationLabel,
            )
          : ""
      }
      ${showTermsWebView ? renderTermsWebViewSheet() : ""}
      ${state.toast ? renderToastHtml(state.toast) : ""}
      ${
        tourStep && state.productTourStepIndex != null
          ? renderProductTour({
              step: tourStep,
              index: state.productTourStepIndex,
              total: tourSteps.length,
              dontShowAgain: isProductTourDontShowAgain(state.productTourEnabled),
            })
          : ""
      }
    `;

    if (venueFeedScrollTop != null && venueFeedScrollTop > 0) {
      const venueFeedScroll =
        this.root.querySelector<HTMLElement>(".venue-feed-scroll");
      if (venueFeedScroll) {
        venueFeedScroll.scrollTop = venueFeedScrollTop;
      }
    }

    if (venueSelectScrollTop != null && venueSelectScrollTop > 0) {
      const venueSelectBody =
        this.root.querySelector<HTMLElement>(".venue-select-body");
      if (venueSelectBody) {
        venueSelectBody.scrollTop = venueSelectScrollTop;
      }
    }

    this.afterFullRender();
    this.bindOtpInputs(app, focusedOtpIndex);
    this.restoreLoginPasswordDraft(showLogin);
    this.restoreCreateAccountDrafts(showCreateAccount);
    this.restoreResetPasswordDraft(showResetPasswordConfirm);
    this.restoreChangePasswordDrafts(onProfileChangePassword);
    this.applySavedLoginCredential(showLogin, app);

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
        this.root.querySelector<HTMLInputElement>(
          `#${focusedHomeVenueSearchId}`,
        );
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

    if (focusedSearch && !tourStep) {
      const searchInput =
        this.root.querySelector<HTMLInputElement>(`#${focusedSearchId}`);
      if (searchInput) {
        searchInput.focus();
        if (selectionStart !== null && selectionEnd !== null) {
          searchInput.setSelectionRange(selectionStart, selectionEnd);
        }
      }
    } else if (onNavigateMap && !tourStep && app.shouldFocusMapSearch()) {
      app.consumeMapSearchFocus();
      requestAnimationFrame(() => {
        this.root.querySelector<HTMLInputElement>("#search-input")?.focus();
      });
    }

    if (focusedVenueInput && !tourStep) {
      const venueInput =
        this.root.querySelector<HTMLInputElement>("#venue-feed-input");
      if (venueInput) {
        venueInput.focus();
        if (venueSelectionStart !== null && venueSelectionEnd !== null) {
          venueInput.setSelectionRange(venueSelectionStart, venueSelectionEnd);
        }
      }
    }

    if (focusedPostCommentsInput && onPostComments) {
      const postCommentsInput = this.root.querySelector<HTMLInputElement>(
        "#post-comments-input",
      );
      if (postCommentsInput) {
        postCommentsInput.focus();
        if (
          postCommentsSelectionStart !== null &&
          postCommentsSelectionEnd !== null
        ) {
          postCommentsInput.setSelectionRange(
            postCommentsSelectionStart,
            postCommentsSelectionEnd,
          );
        }
      }
    }

    this.layoutProductTour();
    this.lastRenderedState = state;
  }

  /**
   * Updates the splash progress bar in place. Returns true when a full re-render
   * was skipped (splash still showing, not ready/error).
   */
  private patchSplashProgress(state: AppState): boolean {
    if (state.startupReady) {
      return false;
    }
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

  /**
   * Updates the in-map loader in place so background boot does not rebuild chrome.
   */
  private patchMapBootProgress(state: AppState): boolean {
    if (!state.startupReady) return false;
    if (state.mapStatus === "ready" || state.mapStatus === "error") {
      return false;
    }

    const overlay = this.root.querySelector(".map-boot-overlay");
    if (!overlay || overlay.classList.contains("map-boot-overlay--error")) {
      return false;
    }
    return true;
  }

  private loadingOverlay(state: AppState): string {
    if (state.startupReady) {
      return "";
    }
    const isError = state.mapStatus === "error";
    const progress = Math.max(0, Math.min(100, state.loadingProgress));
    return `
      <div class="splash-screen ${isError ? "splash-screen--error" : ""}" role="status">
        <div class="splash-brand">
          <h1 class="splash-title">fplaces</h1>
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
      <div class="search-bar ${state.arRouteSetupActive ? "search-bar--ar-setup" : ""}" data-tour-id="map-search">
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
    if (state.isSearching && !state.searchResults.length) {
      return `<div class="search-results search-results--loading screen-loading-host">${renderContentLoadingOverlay("Searching")}</div>`;
    }

    if (!state.searchResults.length) {
      return `<div class="search-results search-results--empty" role="status">No places found</div>`;
    }

    const items = buildSearchResultViews(
      state.searchResults,
      state.locationPermission,
      state.userLocation,
    )
      .map(
        (r) => `
          <button type="button" class="search-result" data-location-id="${escapeHtml(r.id)}" data-location-name="${escapeHtml(r.name)}" data-floor-name="${escapeHtml(r.floorName ?? "")}">
            <span class="search-result-name">${escapeHtml(r.name)}</span>
            ${
              r.distanceLabel || r.floorName
                ? `<span class="search-result-meta">${
                    r.distanceLabel
                      ? `<span class="search-result-distance">${escapeHtml(r.distanceLabel)}</span>`
                      : ""
                  }${
                    r.distanceLabel && r.floorName
                      ? `<span class="search-result-meta-sep" aria-hidden="true">·</span>`
                      : ""
                  }${
                    r.floorName
                      ? `<span class="search-result-floor">${escapeHtml(r.floorName)}</span>`
                      : ""
                  }</span>`
                : ""
            }
          </button>
        `,
      )
      .join("");

    return `<div class="search-results">${items}</div>`;
  }

  private fabs(state: AppState, app: MapApp): string {
    // Keep FABs clear of route sheet, or of the route-hint pill when that is showing.
    const hintVisible = !state.showRouteSheet || !state.route;
    const bottom =
      state.showRouteSheet && (state.route || state.markers.destination)
        ? "calc(252px + var(--bottom-nav-height) + env(safe-area-inset-bottom))"
        : hintVisible
          ? "calc(var(--bottom-nav-height) + 108px + env(safe-area-inset-bottom))"
          : "calc(var(--bottom-nav-height) + 48px + env(safe-area-inset-bottom))";
    const locationFab = myLocationFabPresentation(
      state,
      app.selectedVenuePresenceAnchor(),
    );
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
          class="fab ${locationFab.trackingActive ? "fab--tracking" : ""} ${locationFab.following ? "fab--following" : ""}"
          aria-label="${escapeHtml(locationFab.label)}"
          title="${escapeHtml(locationFab.label)}"
          ${locationFab.enabled ? "" : "disabled"}
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
              ? "Route ready. Open AR when you’re set."
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
        ${state.isCalculatingRoute && state.mapStatus === "ready" ? '<div class="mini-spinner"></div>' : ""}
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
    const navigationPresence = routeNavigationPresencePresentation(state);
    const resetDisabled = summary.isCalculating;
    const beginDisabled =
      summary.isCalculating ||
      state.routeSimulating ||
      summary.needsReset ||
      !state.route ||
      !navigationPresence.enabled;
    const arDisabled =
      summary.isCalculating ||
      summary.needsReset ||
      !state.route ||
      !navigationPresence.enabled;

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
        <p class="route-tracking-status" role="status" ${liveTrackingMessage(state) ? "" : "hidden"}>${escapeHtml(liveTrackingMessage(state))}</p>
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
            title="${escapeHtml(navigationPresence.label)}"
            ${beginDisabled ? "disabled" : ""}
          >${escapeHtml(summary.beginLabel)}</button>
          <button
            type="button"
            id="reset-route-sheet-btn"
            class="route-sheet-reset-btn ${resetDisabled ? "is-disabled" : ""}"
            ${resetDisabled ? "disabled" : ""}
          >Reset</button>
          <button type="button" id="open-ar-btn" class="route-sheet-ar-btn" title="${escapeHtml(navigationPresence.label)}" ${arDisabled ? "disabled" : ""}>
            <svg class="ar-nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
              <path d="M12 12.5 20 8M12 12.5v8.5M12 12.5 4 8" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
            </svg>
            AR Mode
          </button>
              `
          }
        </div>
      </div>
    `;
  }

  private bottomNav(state: AppState): string {
    const homeActive = state.activeTab === "home";
    const mapActive = state.activeTab === "map";
    const socialActive = state.activeTab === "social";
    const profileActive = state.activeTab === "profile";
    const showNavigateTab = state.homeExperience !== "first-visit";

    return `
      <nav class="bottom-nav" aria-label="Main navigation">
        <button
          type="button"
          id="nav-home"
          class="bottom-nav-item ${homeActive ? "bottom-nav-item--active" : ""}"
        >
          ${bottomNavHomeIcon}
          <span class="bottom-nav-label">Home</span>
        </button>
        ${showNavigateTab ? `<button
          type="button"
          id="nav-map"
          class="bottom-nav-item ${mapActive ? "bottom-nav-item--active" : ""}"
        >
          ${bottomNavNavigateIcon}
          <span class="bottom-nav-label">Navigate</span>
        </button>` : ""}
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

  private applySearchPatch(state: AppState): void {
    const input = this.root.querySelector<HTMLInputElement>("#search-input");
    if (input && document.activeElement !== input) {
      input.value = state.searchQuery;
    }

    applyMyLocationFabPatch(this.root, state);

    const bar = this.root.querySelector(".search-bar");
    if (bar) {
      const clear = bar.querySelector("#search-clear");
      if (state.searchQuery && !clear) {
        bar.insertAdjacentHTML(
          "beforeend",
          '<button type="button" id="search-clear" class="icon-btn" aria-label="Clear search">×</button>',
        );
      } else if (!state.searchQuery && clear) {
        clear.remove();
      }
    }

    this.root
      .querySelectorAll<HTMLButtonElement>(".category-pill")
      .forEach((button) => {
        button.classList.toggle(
          "is-active",
          state.categoryFilter === button.dataset.category,
        );
      });

    const nextHtml =
      state.mapStatus === "ready" && state.searchQuery.trim()
        ? this.searchResults(state)
        : "";
    const existing = this.root.querySelector(".search-results");
    if (!nextHtml) {
      existing?.remove();
      return;
    }
    if (existing) {
      existing.outerHTML = nextHtml;
      return;
    }
    this.root
      .querySelector(".home-header")
      ?.insertAdjacentHTML("afterend", nextHtml);
  }

  /** Live forum updates while Social is showing the feed list. */
  private applySocialFeedPatch(state: AppState): void {
    const existing = this.root.querySelector(".venue-feed");
    if (!existing) return;

    const scrollTop =
      this.root.querySelector<HTMLElement>(".venue-feed-scroll")?.scrollTop ??
      null;
    const activeEl = document.activeElement;
    const focusedInput =
      activeEl?.id === "venue-feed-input"
        ? (activeEl as HTMLInputElement)
        : null;
    const selectionStart = focusedInput?.selectionStart ?? null;
    const selectionEnd = focusedInput?.selectionEnd ?? null;
    const draft = focusedInput?.value;

    existing.outerHTML = renderVenueFeedScreen(state);

    const scroll = this.root.querySelector<HTMLElement>(".venue-feed-scroll");
    if (scroll && scrollTop != null) {
      scroll.scrollTop = scrollTop;
    }

    const input = this.root.querySelector<HTMLInputElement>("#venue-feed-input");
    if (input && focusedInput) {
      if (typeof draft === "string") input.value = draft;
      input.focus({ preventScroll: true });
      if (selectionStart !== null && selectionEnd !== null) {
        input.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }

  /** Returning-home venue filter: refresh list without tearing down chrome. */
  private applyHomeSearchPatch(state: AppState): void {
    const input =
      this.root.querySelector<HTMLInputElement>("#home-venue-search-input") ??
      this.root.querySelector<HTMLInputElement>("#navigate-search-input");
    if (input && document.activeElement !== input) {
      input.value = state.homeVenueSearchQuery;
    }

    const host = this.root.querySelector(".returning-home-venues");
    if (!host) return;

    const homeLoading = state.homeContent == null;
    const content = state.homeContent ?? {
      recentlyVisited: [],
      otherVenues: [],
      stats: { venues: 0, upvotesLabel: "0", posts: 0 },
    };
    const displayName = state.authUser
      ? resolveDisplayName(state.authUser)
      : state.pseudoNameDraft.trim() || resolveDisplayName(null);
    const view = buildReturningHomeViewModel({
      displayName,
      searchQuery: state.homeVenueSearchQuery,
      content,
      profileStat: state.authUser?.stat,
    });
    host.innerHTML = renderHomeVenueSections({
      recentlyVisited: view.recentlyVisited,
      otherVenues: view.otherVenues,
      searching: Boolean(view.searchQuery.trim()),
      loading: homeLoading,
    });
  }

  private afterFullRender(): void {
    const tourOverlay = this.root.querySelector<HTMLElement>(".product-tour");
    if (tourOverlay) {
      tourOverlay.tabIndex = -1;
      if (!tourOverlay.contains(document.activeElement)) {
        tourOverlay.focus({ preventScroll: true });
      }
    }
    syncAuthPasswordStrength(this.root);
    if (this.root.querySelector("#verify-resend-status")) {
      this.ensureVerifyResendCountdown();
    }
  }

  private restoreLoginPasswordDraft(showLogin: boolean): void {
    if (!showLogin || !this.authPasswordDraft) return;
    const passwordInput =
      this.root.querySelector<HTMLInputElement>("#login-password");
    if (passwordInput && !passwordInput.value) {
      passwordInput.value = this.authPasswordDraft;
    }
  }

  private restoreResetPasswordDraft(showResetPasswordConfirm: boolean): void {
    if (!showResetPasswordConfirm || !this.resetPasswordDraft) return;
    const passwordInput =
      this.root.querySelector<HTMLInputElement>("#reset-password-new");
    if (passwordInput && !passwordInput.value) {
      passwordInput.value = this.resetPasswordDraft;
    }
  }

  private applySavedLoginCredential(showLogin: boolean, app: MapApp): void {
    if (!showLogin) {
      this.loginCredentialAutofillRequested = false;
      return;
    }
    if (this.loginCredentialAutofillRequested) return;
    this.loginCredentialAutofillRequested = true;

    const emailInput =
      this.root.querySelector<HTMLInputElement>("#login-email");
    const passwordInput =
      this.root.querySelector<HTMLInputElement>("#login-password");
    if (emailInput?.value && passwordInput?.value) return;

    void app.loadSavedPasswordCredential().then((credential) => {
      if (!credential) return;
      const email = this.root.querySelector<HTMLInputElement>("#login-email");
      const password =
        this.root.querySelector<HTMLInputElement>("#login-password");
      if (!email || !password) return;
      if (!email.value) {
        email.value = credential.email;
        this.authEmailDraft = credential.email;
      }
      if (!password.value) {
        password.value = credential.password;
        this.authPasswordDraft = credential.password;
      }
    });
  }

  private restoreChangePasswordDrafts(showChangePassword: boolean): void {
    if (!showChangePassword) {
      this.changePasswordOldDraft = "";
      this.changePasswordNewDraft = "";
      this.changePasswordOldVisible = false;
      this.changePasswordNewVisible = false;
      return;
    }
    const oldInput =
      this.root.querySelector<HTMLInputElement>("#change-password-old");
    const newInput =
      this.root.querySelector<HTMLInputElement>("#change-password-new");
    if (oldInput && this.changePasswordOldDraft) {
      oldInput.value = this.changePasswordOldDraft;
    }
    if (newInput && this.changePasswordNewDraft) {
      newInput.value = this.changePasswordNewDraft;
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
      const onOtpFieldFilled = (): void => {
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
      };

      input.addEventListener("input", onOtpFieldFilled);
      input.addEventListener("animationstart", (event) => {
        if (!(event instanceof AnimationEvent)) return;
        if (event.animationName !== AUTH_AUTOFILL_ANIMATION_NAME) return;
        onOtpFieldFilled();
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
