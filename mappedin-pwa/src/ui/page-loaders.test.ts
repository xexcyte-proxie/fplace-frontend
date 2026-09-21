import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import { countPageLoaders } from './content-loading-overlay';
import { renderCreateAccountScreen } from './create-account-screen';
import { renderFirstVisitVenueScreen } from './first-visit-venue-screen';
import { renderGuestArGateDialog } from './guest-ar-gate-dialog';
import { renderLanguageSettingsScreen } from './language-settings-screen';
import { renderLocationPermissionScreen } from './location-permission-screen';
import { renderMapBootOverlay } from './map-boot-overlay';
import { renderNotificationDetailScreen } from './notification-detail-screen';
import { renderNotificationsScreen } from './notifications-screen';
import { renderPostCommentsScreen } from './post-comments-screen';
import { renderReturningHomeScreen } from './returning-home-screen';
import { renderVenueFeedScreen } from './venue-feed-screen';
import { renderVenueSelectScreen } from './venue-select-screen';
import { renderVerifyEmailScreen } from './verify-email-screen';

const samplePost = {
  id: '12',
  author: 'Fan',
  authorId: 1,
  initials: 'FA',
  avatarColor: '#3b5998',
  location: 'North',
  locationId: '3',
  timeAgo: '1m',
  feedType: 'fan-vibe' as const,
  categoryId: '1',
  content: 'Hello section',
  upvotes: 2,
  comments: 0,
};

const sampleNotification = {
  id: 5,
  title: 'New reply',
  body: 'Someone replied',
  isRead: false,
  notificationType: 'comment',
  venueId: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function expectOneLoader(html: string) {
  expect(countPageLoaders(html)).toBe(1);
}

describe('one page loader per screen', () => {
  it('keeps map boot on a single circular spinner', () => {
    const html = renderMapBootOverlay({
      mapStatus: 'loading',
      loadingMessage: 'Getting map credentials…',
    });
    expectOneLoader(html);
    expect(html).not.toContain('splash-progress');
    expect(html).not.toContain('progressbar');
  });

  it('does not stack the venue list overlay with the Enter button spinner', () => {
    const html = renderVenueSelectScreen({
      venueSearchQuery: '',
      selectedVenueId: null,
      selectedGateId: null,
      forumVenues: [],
      forumSections: [],
      authLoading: true,
      authFieldErrors: {},
      locationPermission: 'undecided',
      userLocation: null,
    });
    expectOneLoader(html);
    expect(html).toContain('Loading venues');
    expect(html).not.toContain('Entering venue…');
  });

  it('shows only the Enter spinner after venues and gates have loaded', () => {
    const html = renderVenueSelectScreen({
      venueSearchQuery: '',
      selectedVenueId: '1',
      selectedGateId: '2',
      forumVenues: [{ id: 1, name: 'Riverside', location: 'Lagos' }],
      forumSections: [
        { id: 2, venue: 1, name: 'North', code: 'N', is_active: true },
      ],
      authLoading: true,
      authFieldErrors: {},
      locationPermission: 'undecided',
      userLocation: null,
    });
    expectOneLoader(html);
    expect(html).toContain('Entering venue…');
    expect(html).not.toContain('screen-loading-overlay');
  });

  it('does not stack gate and venue overlays', () => {
    const html = renderVenueSelectScreen({
      venueSearchQuery: '',
      selectedVenueId: '1',
      selectedGateId: null,
      forumVenues: [],
      forumSections: [],
      authLoading: true,
      authFieldErrors: {},
      locationPermission: 'undecided',
      userLocation: null,
    });
    expectOneLoader(html);
    expect(html).toContain('Loading venues');
    expect(html).not.toContain('Loading entry gates');
  });

  it('renders one language overlay even if catalog load and language change overlap', () => {
    const state = initialAppState();
    state.mapStatus = 'loading';
    state.mapLanguages = [];
    state.mapLanguageChanging = true;
    const html = renderLanguageSettingsScreen(state);
    expectOneLoader(html);
    expect(html).toContain('Updating map language');
    expect(html).not.toContain('Loading languages');
  });

  it('keeps verify-email on a single spinner while the code is submitting', () => {
    const html = renderVerifyEmailScreen({
      authEmail: 'fan@email.com',
      authLoading: true,
      authFieldErrors: {},
    });
    expectOneLoader(html);
    expect(html).toContain('Verifying…');
    expect(html).not.toContain('Resending…');
  });

  it('does not stack create-account form and guest spinners', () => {
    expectOneLoader(
      renderCreateAccountScreen({
        authEmail: '',
        authLoading: true,
        authFieldErrors: {},
        guestAccessAllowed: true,
        guestContinueLoading: true,
      }),
    );
    expectOneLoader(
      renderCreateAccountScreen({
        authEmail: '',
        authLoading: true,
        authFieldErrors: {},
        guestAccessAllowed: true,
        guestContinueLoading: false,
      }),
    );
  });

  it('keeps the venue feed overlay off while send is spinning', () => {
    const state = initialAppState();
    state.venueFeedLoading = true;
    state.venueFeedSubmitting = true;
    state.venueFeedDraft = 'Hello';
    state.forumFeedNext = 'https://api.example.com/next';
    state.venueFeedLoadingMore = true;
    const html = renderVenueFeedScreen(state);
    expectOneLoader(html);
    expect(html).not.toContain('screen-loading-overlay');
    expect(html).toContain('Sending');
  });

  it('does not stack comments overlay with send', () => {
    const state = initialAppState();
    state.postCommentsLoading = true;
    state.postCommentsSubmitting = true;
    state.postCommentsDraft = 'Nice';
    const html = renderPostCommentsScreen(state, samplePost);
    expectOneLoader(html);
    expect(html).not.toContain('screen-loading-overlay');
  });

  it('does not stack comments save and send spinners', () => {
    const state = initialAppState();
    state.postCommentsEditing = true;
    state.postCommentsSubmitting = true;
    state.postCommentsDraft = 'Nice';
    const html = renderPostCommentsScreen(state, samplePost);
    expectOneLoader(html);
    expect(html).toContain('Saving…');
    expect(html).not.toContain('aria-label="Sending comment"');
  });

  it('does not stack notifications overlay with load-more or mark-all', () => {
    const emptyLoading = initialAppState();
    emptyLoading.notificationsLoading = true;
    emptyLoading.notificationsNext = 'https://api.example.com/next';
    emptyLoading.notificationsMarkingAll = true;
    expectOneLoader(renderNotificationsScreen(emptyLoading));

    const paging = initialAppState();
    paging.notifications = [sampleNotification];
    paging.notificationsUnreadCount = 1;
    paging.notificationsNext = 'https://api.example.com/next';
    paging.notificationsLoading = true;
    paging.notificationsMarkingAll = true;
    const pagingHtml = renderNotificationsScreen(paging);
    expectOneLoader(pagingHtml);
    expect(pagingHtml).toContain('Marking…');
    expect(pagingHtml).not.toContain('>Loading…<');
  });

  it('keeps notification detail, home, first-visit, location, and AR gate on one loader', () => {
    expectOneLoader(
      renderNotificationDetailScreen({
        loading: true,
        error: null,
        item: null,
      }),
    );
    expectOneLoader(
      renderReturningHomeScreen({
        authUser: null,
        pseudoNameDraft: 'Fan',
        homeVenueSearchQuery: '',
        homeContent: null,
      }),
    );
    const firstVisit = initialAppState();
    firstVisit.venueFeedLoading = true;
    firstVisit.venueFeedPosts = [];
    expectOneLoader(renderFirstVisitVenueScreen(firstVisit));
    expectOneLoader(
      renderLocationPermissionScreen({ locationGateLoading: true }),
    );
    expectOneLoader(
      renderGuestArGateDialog('one-time-info', { loading: true }),
    );
  });
});
