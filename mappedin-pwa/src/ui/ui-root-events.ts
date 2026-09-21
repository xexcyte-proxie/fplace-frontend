import type { MapApp } from '../services/map-app';
import type { AppState } from '../types';
import { evaluatePasswordStrength } from '../auth/domain/password-strength';
import { AUTH_AUTOFILL_ANIMATION_NAME } from './auth-autofill';

export interface UiRootEventHost {
  readonly root: HTMLElement;
  app(): MapApp | null;
  setAuthEmailDraft(value: string): void;
  setAuthPasswordDraft(value: string): void;
  setCreatePasswordDraft(value: string): void;
  setCreatePasswordConfirmDraft(value: string): void;
  setCreateTermsAcceptedDraft(value: boolean): void;
  setResetPasswordDraft(value: string): void;
  setChangePasswordOldDraft(value: string): void;
  setChangePasswordNewDraft(value: string): void;
  setChangePasswordOldVisible(value: boolean): void;
  setChangePasswordNewVisible(value: boolean): void;
  setPseudoNameDraft(value: string | null): void;
  setVenueSearchDraft(value: string): void;
  getPseudoNameDraft(): string | null;
  restartVerifyResendCountdown(): void;
  readOtpValue(): string;
}

function appOf(host: UiRootEventHost): MapApp | null {
  return host.app();
}

function syncAuthPasswordStrength(root: HTMLElement): void {
  const passwordInput = root.querySelector<HTMLInputElement>('#auth-password');
  const strengthHint = root.querySelector<HTMLElement>('#auth-password-strength');
  if (!passwordInput || !strengthHint) return;
  strengthHint.hidden = evaluatePasswordStrength(passwordInput.value) !== 'strong';
}

function togglePasswordVisibility(
  host: UiRootEventHost,
  button: HTMLElement,
): void {
  const inputId = button.dataset.passwordToggle;
  if (!inputId) return;
  const input = host.root.querySelector<HTMLInputElement>(`#${inputId}`);
  if (!input) return;
  const nextVisible = input.type !== 'text';
  input.type = nextVisible ? 'text' : 'password';
  button.setAttribute(
    'aria-label',
    nextVisible ? 'Hide password' : 'Show password',
  );
  button.setAttribute('aria-pressed', nextVisible ? 'true' : 'false');
  const icon = button.querySelector<HTMLImageElement>(
    '.auth-password-toggle-icon',
  );
  if (icon) {
    icon.src = nextVisible ? '/auth/eye-off.svg' : '/auth/eye.svg';
  }
  if (inputId === 'change-password-old') {
    host.setChangePasswordOldVisible(nextVisible);
  } else if (inputId === 'change-password-new') {
    host.setChangePasswordNewVisible(nextVisible);
  }
}

function handleClick(event: Event, host: UiRootEventHost): void {
  const app = appOf(host);
  if (!app) return;
  const target = event.target;
  if (!(target instanceof Element)) return;

  const passwordToggle = target.closest<HTMLElement>('[data-password-toggle]');
  if (passwordToggle && host.root.contains(passwordToggle)) {
    event.preventDefault();
    event.stopPropagation();
    togglePasswordVisibility(host, passwordToggle);
    return;
  }

  if (target.id === 'arrival-dialog-dismiss') {
    void app.dismissArrivalDialog();
    return;
  }
  if (target.id === 'settings-confirm-dismiss') {
    app.dismissSettingsConfirm();
    return;
  }
  if (target.id === 'legal-webview-dismiss') {
    app.dismissLegalWebView();
    return;
  }
  if (target.id === 'location-action-dismiss') {
    app.dismissLocationActionPrompt();
    return;
  }

  const homeVenue = target.closest<HTMLElement>('[data-home-venue-id]');
  if (homeVenue?.dataset.homeVenueId) {
    app.selectHomeRecentVenue(homeVenue.dataset.homeVenueId);
    return;
  }

  const searchResult = target.closest<HTMLButtonElement>('.search-result');
  if (searchResult) {
    const id = searchResult.dataset.locationId;
    const name = searchResult.dataset.locationName;
    const floorName = searchResult.dataset.floorName;
    if (id && name) void app.selectSearchResult(id, name, floorName || undefined);
    return;
  }

  const category = target.closest<HTMLButtonElement>('.category-pill');
  if (category) {
    void app.setCategoryFilter(category.dataset.category ?? null);
    return;
  }

  const focus = target.closest<HTMLElement>('[data-focus]');
  if (focus?.dataset.focus === 'start') {
    app.focusRouteStart();
    return;
  }
  if (focus?.dataset.focus === 'end') {
    app.focusRouteEnd();
    return;
  }

  const interest = target.closest<HTMLButtonElement>('.interest-chip');
  if (interest?.dataset.interest) {
    app.toggleInterest(interest.dataset.interest);
    return;
  }

  const venue = target.closest<HTMLButtonElement>('[data-venue-id]');
  if (venue?.dataset.venueId) {
    app.selectOnboardingVenue(venue.dataset.venueId);
    return;
  }

  const gate = target.closest<HTMLButtonElement>('[data-gate-id]');
  if (gate?.dataset.gateId) {
    app.selectOnboardingGate(gate.dataset.gateId);
    return;
  }

  const mapLanguage = target.closest<HTMLButtonElement>('[data-map-language]');
  if (mapLanguage?.dataset.mapLanguage) {
    void app.setMapLanguage(mapLanguage.dataset.mapLanguage);
    return;
  }

  const notification = target.closest<HTMLButtonElement>('[data-notification-id]');
  if (notification?.dataset.notificationId) {
    void app.openNotificationDetail(notification.dataset.notificationId);
    return;
  }

  const deleteComment = target.closest<HTMLButtonElement>('[data-delete-comment-id]');
  if (deleteComment?.dataset.deleteCommentId) {
    void app.deletePostComment(deleteComment.dataset.deleteCommentId);
    return;
  }

  const comments = target.closest<HTMLButtonElement>('[data-comments-id]');
  if (comments?.dataset.commentsId) {
    event.preventDefault();
    event.stopPropagation();
    app.openPostComments(comments.dataset.commentsId);
    return;
  }

  const venueSection = target.closest<HTMLButtonElement>('[data-venue-section]');
  if (venueSection && venueSection.hasAttribute('data-venue-section')) {
    const locationId = venueSection.dataset.venueSection?.trim() || null;
    const locationName = venueSection.dataset.venueSectionName ?? null;
    if (locationId) {
      app.setSocialLocation(locationId, locationName);
    } else {
      app.clearSocialLocation();
    }
    return;
  }

  const venueFilter = target.closest<HTMLButtonElement>('[data-venue-filter]');
  if (venueFilter?.dataset.venueFilter) {
    app.setVenueFeedFilter(
      venueFilter.dataset.venueFilter as AppState['venueFeedFilter'],
    );
    return;
  }

  const quickReply = target.closest<HTMLButtonElement>('[data-venue-quick-reply]');
  if (quickReply?.dataset.venueQuickReply) {
    app.setVenueQuickReply(quickReply.dataset.venueQuickReply);
    return;
  }

  const upvote = target.closest<HTMLElement>('[data-upvote-id]');
  if (upvote?.dataset.upvoteId) {
    event.preventDefault();
    event.stopPropagation();
    void app.toggleVenueFeedUpvote(upvote.dataset.upvoteId);
    return;
  }

  const flag = target.closest<HTMLButtonElement>('[data-flag-id]');
  if (flag?.dataset.flagId) {
    void app.flagVenueFeedPost(flag.dataset.flagId);
    return;
  }

  if (target.closest('.product-tour-dont-show')) {
    return;
  }

  const button = target.closest<HTMLElement>('[id]');
  if (!button || !host.root.contains(button)) return;

  switch (button.id) {
    case 'product-tour-next-btn':
    case 'product-tour-scrim':
      app.advanceProductTour();
      return;
    case 'product-tour-back-btn':
      app.backProductTour();
      return;
    case 'product-tour-skip-btn':
      app.skipProductTour();
      return;
    case 'search-clear':
      void app.clearSearch();
      return;
    case 'first-visit-discover-btn':
    case 'first-visit-see-all-btn':
      app.openVenueDiscover();
      return;
    case 'first-visit-ar-btn':
      void app.openVenueArFromHome();
      return;
    case 'first-visit-ar-open-map-btn':
      app.confirmArRoutePrompt();
      return;
    case 'first-visit-ar-prompt-dismiss':
      app.dismissArRoutePrompt();
      return;
    case 'first-visit-ar-away-dismiss-btn':
      app.dismissArNotAtVenuePrompt();
      return;
    case 'zoom-in-btn':
      app.zoomIn();
      return;
    case 'zoom-out-btn':
      app.zoomOut();
      return;
    case 'my-location-btn':
      void app.goToMyLocation();
      return;
    case 'reset-points-btn':
    case 'reset-route-points-btn':
    case 'reset-route-sheet-btn':
      void app.clearRoutePoints();
      return;
    case 'close-route-btn':
      void app.dismissRouteSheet();
      return;
    case 'prev-leg-btn':
      app.routePreviousLeg();
      return;
    case 'next-leg-btn':
      app.routeNextLeg();
      return;
    case 'focus-start-btn':
      app.focusRouteStart();
      return;
    case 'focus-end-btn':
      app.focusRouteEnd();
      return;
    case 'open-ar-btn':
      void app.openAr();
      return;
    case 'guest-ar-gate-continue-btn':
      void app.confirmGuestArOneTimeTrial();
      return;
    case 'guest-ar-gate-cancel-btn':
    case 'guest-ar-gate-dismiss-btn':
      app.dismissGuestArGate();
      return;
    case 'invalid-token-dialog-dismiss-btn':
      app.dismissInvalidTokenDialog();
      return;
    case 'arrival-dialog-done-btn':
      void app.dismissArrivalDialog();
      return;
    case 'ar-nav-close-btn':
      app.closeAr();
      return;
    case 'ar-nav-minimize-btn':
      app.minimizeAr();
      return;
    case 'ar-nav-end-btn':
      void app.endArNavigation();
      return;
    case 'begin-route-btn':
      app.beginOrResetRoute();
      return;
    case 'onboarding-create-account':
    case 'ar-teaser-skip-btn':
    case 'ar-teaser-continue':
    case 'features-continue':
    case 'login-create-link':
      app.showCreateAccount();
      return;
    case 'onboarding-login':
    case 'auth-login-link':
    case 'check-email-login-link':
      app.showLogin();
      return;
    case 'introduction-continue':
      app.showFeatures();
      return;
    case 'auth-back-btn':
      app.dismissCreateAccount();
      return;
    case 'auth-google-btn':
    case 'login-google-btn':
      void app.submitGoogleSignIn();
      return;
    case 'auth-guest-btn':
      void app.continueAsGuest();
      return;
    case 'login-back-btn':
      app.dismissLogin();
      return;
    case 'login-forgot-link':
      app.showForgotPassword();
      return;
    case 'forgot-password-back-btn':
    case 'forgot-password-login-link':
      app.dismissForgotPassword();
      return;
    case 'reset-password-back-btn':
    case 'reset-password-login-link':
      app.dismissResetPasswordConfirm();
      return;
    case 'location-enable-btn':
      void app.enableLocationPermission();
      return;
    case 'location-try-again-btn':
      void app.retryLocationPermission();
      return;
    case 'location-retry-btn':
      void app.retryLocationRetrieval();
      return;
    case 'auth-terms-link':
      app.openAuthTerms();
      return;
    case 'auth-privacy-link':
      app.openAuthPrivacy();
      return;
    case 'auth-legal-back-btn':
      app.dismissAuthLegal();
      return;
    case 'legal-webview-cancel':
      app.dismissLegalWebView();
      return;
    case 'check-email-back-btn':
      app.dismissCheckEmail();
      return;
    case 'check-email-resend-btn':
      void app.resendCheckEmail();
      return;
    case 'verify-back-btn':
      app.dismissVerifyEmail();
      return;
    case 'verify-resend-btn':
      void app.resendVerificationCode().then((ok) => {
        if (ok) host.restartVerifyResendCountdown();
      });
      return;
    case 'pseudo-name-back-btn':
      app.dismissPseudoNameSetup();
      return;
    case 'pseudo-name-shuffle-btn':
      host.setPseudoNameDraft(null);
      app.shufflePseudoName();
      return;
    case 'venue-select-back-btn':
      app.dismissVenueSelect();
      return;
    case 'venue-select-enter-btn':
      app.submitVenueSelect();
      return;
    case 'nav-map':
      app.setActiveTab('map');
      return;
    case 'nav-social':
      app.setActiveTab('social');
      return;
    case 'nav-profile':
      app.setActiveTab('profile');
      return;
    case 'profile-settings-btn':
      app.openProfileSettings();
      return;
    case 'settings-back-btn':
      app.closeProfileSettings();
      return;
    case 'settings-edit-profile-btn':
    case 'settings-interests-btn':
      app.openEditProfileFromSettings();
      return;
    case 'settings-change-password-btn':
      app.openChangePasswordFromSettings();
      return;
    case 'settings-language-btn':
      app.openMapLanguageSettings();
      return;
    case 'settings-language-back-btn':
      app.closeMapLanguageSettings();
      return;
    case 'edit-profile-back-btn':
      app.closeEditProfileSettings();
      return;
    case 'change-password-back-btn':
      host.setChangePasswordOldDraft('');
      host.setChangePasswordNewDraft('');
      host.setChangePasswordOldVisible(false);
      host.setChangePasswordNewVisible(false);
      app.closeChangePasswordSettings();
      return;
    case 'settings-privacy-btn':
      app.openPrivacySettings();
      return;
    case 'settings-terms-btn':
      app.openTermsSettings();
      return;
    case 'settings-about-btn':
      app.openAboutSettings();
      return;
    case 'settings-tour-toggle':
      app.toggleProductTourEnabled();
      return;
    case 'settings-privacy-back-btn':
    case 'settings-about-back-btn':
      app.closeSecondarySettings();
      return;
    case 'settings-notifications-toggle':
      app.toggleNotifications();
      return;
    case 'settings-change-venue-btn':
      app.openVenueSelectFromSettings();
      return;
    case 'settings-logout-btn':
      app.requestLogoutConfirm();
      return;
    case 'settings-delete-account-btn':
      app.requestDeleteAccountConfirm();
      return;
    case 'settings-confirm-cancel-btn':
      app.dismissSettingsConfirm();
      return;
    case 'settings-confirm-logout-btn':
      void app.logout();
      return;
    case 'settings-confirm-delete-btn':
      void app.deleteAccount();
      return;
    case 'venue-feed-notify-btn':
      app.openNotifications();
      return;
    case 'notifications-back-btn':
      app.closeNotifications();
      return;
    case 'notification-detail-back-btn':
      app.closeNotificationDetail();
      return;
    case 'notifications-mark-all-btn':
      void app.markAllNotificationsAsRead();
      return;
    case 'notifications-load-more-btn':
      void app.loadMoreNotifications();
      return;
    case 'post-comments-back-btn':
      app.closePostComments();
      return;
    case 'post-comments-edit-btn':
      app.beginEditVenueFeedPost();
      return;
    case 'post-comments-edit-cancel-btn':
      app.cancelEditVenueFeedPost();
      return;
    case 'post-comments-edit-save-btn': {
      const content =
        host.root.querySelector<HTMLTextAreaElement>(
          '#post-comments-edit-input',
        )?.value ?? '';
      void app.saveEditedVenueFeedPost(content);
      return;
    }
    case 'post-comments-delete-post-btn':
      void app.deleteOpenVenueFeedPost();
      return;
    case 'venue-feed-send-btn':
      void app.submitVenueFeedPost();
      return;
    case 'venue-feed-load-more-btn':
      void app.loadMoreVenueFeedPosts();
      return;
    case 'venue-feed-clear-location-btn':
      app.clearSocialLocation();
      return;
    case 'location-action-cancel':
      app.dismissLocationActionPrompt();
      return;
    case 'location-action-conversation':
      app.confirmLocationConversation();
      return;
    case 'location-action-navigate':
      app.confirmLocationNavigate();
      return;
    default:
      return;
  }
}

function captureAuthAutofillField(
  target: HTMLInputElement | HTMLTextAreaElement,
  host: UiRootEventHost,
): void {
  switch (target.id) {
    case 'forgot-password-email':
    case 'login-email':
    case 'auth-email':
      host.setAuthEmailDraft(target.value);
      return;
    case 'login-password':
      host.setAuthPasswordDraft(target.value);
      return;
    case 'auth-password':
      host.setCreatePasswordDraft(target.value);
      syncAuthPasswordStrength(host.root);
      return;
    case 'auth-password-confirm':
      host.setCreatePasswordConfirmDraft(target.value);
      return;
    case 'reset-password-new':
      host.setResetPasswordDraft(target.value);
      return;
    case 'change-password-old':
      host.setChangePasswordOldDraft(target.value);
      return;
    case 'change-password-new':
      host.setChangePasswordNewDraft(target.value);
      return;
    default:
      return;
  }
}

function handleInput(event: Event, host: UiRootEventHost): void {
  const app = appOf(host);
  const target = event.target;
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
    return;
  }

  switch (target.id) {
    case 'search-input':
      app?.onSearchInput(target.value);
      return;
    case 'home-venue-search-input':
      app?.setHomeVenueSearchQuery(target.value);
      return;
    case 'pseudo-name-input':
      host.setPseudoNameDraft(target.value);
      return;
    case 'venue-select-search-input':
      host.setVenueSearchDraft(target.value);
      app?.setVenueSearchQuery(target.value);
      return;
    case 'post-comments-input':
      app?.setPostCommentsDraft(target.value);
      return;
    case 'venue-feed-input':
      app?.setVenueFeedDraft(target.value);
      return;
    default:
      captureAuthAutofillField(target, host);
      return;
  }
}

function handleChange(event: Event, host: UiRootEventHost): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id === 'auth-terms') {
    host.setCreateTermsAcceptedDraft(target.checked);
  }
  if (target.id === 'product-tour-dont-show') {
    const app = appOf(host);
    app?.setProductTourDontShowAgain(target.checked);
  }
  captureAuthAutofillField(target, host);
}

function handleAnimationStart(event: Event, host: UiRootEventHost): void {
  if (!(event instanceof AnimationEvent)) return;
  if (event.animationName !== AUTH_AUTOFILL_ANIMATION_NAME) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  captureAuthAutofillField(target, host);
}

function handleSubmit(event: Event, host: UiRootEventHost): void {
  const app = appOf(host);
  if (!app) return;
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  switch (form.id) {
    case 'forgot-password-form': {
      event.preventDefault();
      const email =
        form.querySelector<HTMLInputElement>('#forgot-password-email')?.value ??
        '';
      void app.submitForgotPassword(email);
      return;
    }
    case 'reset-password-confirm-form': {
      event.preventDefault();
      const password =
        host.root.querySelector<HTMLInputElement>('#reset-password-new')
          ?.value ?? '';
      host.setResetPasswordDraft(password);
      void app.submitResetPasswordConfirm(password);
      return;
    }
    case 'login-form': {
      event.preventDefault();
      const email =
        form.querySelector<HTMLInputElement>('#login-email')?.value ?? '';
      const password =
        form.querySelector<HTMLInputElement>('#login-password')?.value ?? '';
      host.setAuthPasswordDraft(password);
      void app.submitLogin(email, password);
      return;
    }
    case 'create-account-form': {
      event.preventDefault();
      const email =
        form.querySelector<HTMLInputElement>('#auth-email')?.value ?? '';
      const password =
        form.querySelector<HTMLInputElement>('#auth-password')?.value ?? '';
      const passwordConfirm =
        form.querySelector<HTMLInputElement>('#auth-password-confirm')?.value ??
        '';
      const termsAccepted =
        form.querySelector<HTMLInputElement>('#auth-terms')?.checked ?? false;
      host.setCreatePasswordDraft(password);
      host.setCreatePasswordConfirmDraft(passwordConfirm);
      host.setCreateTermsAcceptedDraft(termsAccepted);
      void app.submitRegistration(
        email,
        password,
        passwordConfirm,
        termsAccepted,
      );
      return;
    }
    case 'verify-email-form': {
      event.preventDefault();
      void app.submitVerification(host.readOtpValue());
      return;
    }
    case 'pseudo-name-form': {
      event.preventDefault();
      const input =
        host.root.querySelector<HTMLInputElement>('#pseudo-name-input');
      void app.submitPseudoNameSetup(
        input?.value ?? host.getPseudoNameDraft() ?? '',
      );
      return;
    }
    case 'edit-profile-form': {
      event.preventDefault();
      const input =
        host.root.querySelector<HTMLInputElement>('#pseudo-name-input');
      void app.submitProfileEditFromSettings(
        input?.value ?? host.getPseudoNameDraft() ?? '',
      );
      return;
    }
    case 'change-password-form': {
      event.preventDefault();
      const oldPassword =
        host.root.querySelector<HTMLInputElement>('#change-password-old')
          ?.value ?? '';
      const newPassword =
        host.root.querySelector<HTMLInputElement>('#change-password-new')
          ?.value ?? '';
      host.setChangePasswordOldDraft(oldPassword);
      host.setChangePasswordNewDraft(newPassword);
      void app.submitChangePassword(oldPassword, newPassword);
      return;
    }
    case 'post-comments-form': {
      event.preventDefault();
      void app.submitPostComment();
      return;
    }
    default:
      return;
  }
}

function handleKeydown(event: KeyboardEvent, host: UiRootEventHost): void {
  const app = appOf(host);
  if (!app) return;
  const target = event.target;

  if (event.key === 'Escape') {
    const tour = host.root.querySelector('.product-tour');
    if (tour && (target === tour || tour.contains(target as Node))) {
      app.skipProductTour();
    }
    return;
  }

  if (!(target instanceof HTMLInputElement)) return;
  if (event.key !== 'Enter') return;
  if (target.id === 'search-input') {
    void app.submitSearch(target.value);
  }
  if (target.id === 'venue-feed-input') {
    void app.submitVenueFeedPost();
  }
}

export function installUiRootEventDelegation(
  root: HTMLElement,
  host: UiRootEventHost,
): void {
  root.addEventListener('click', (event) => handleClick(event, host));
  root.addEventListener('input', (event) => handleInput(event, host));
  root.addEventListener('change', (event) => handleChange(event, host));
  root.addEventListener('animationstart', (event) =>
    handleAnimationStart(event, host),
  );
  root.addEventListener('submit', (event) => handleSubmit(event, host));
  root.addEventListener('keydown', (event) => handleKeydown(event, host));
}

export { syncAuthPasswordStrength };
