import { describe, expect, it } from 'vitest';

import { renderChangePasswordScreen } from './change-password-screen';
import { renderResetPasswordConfirmScreen } from './reset-password-confirm-screen';
import { renderPostCommentsScreen } from './post-comments-screen';
import { renderNotificationDetailScreen } from './notification-detail-screen';
import { renderNotificationsScreen } from './notifications-screen';
import { renderVenueSelectScreen } from './venue-select-screen';
import { initialAppState } from '../types';

describe('API-backed screens (widget)', () => {
  it('renders change password form hooks', () => {
    const html = renderChangePasswordScreen({
      authLoading: false,
      authFieldErrors: {},
    });
    expect(html).toContain('Change password');
    expect(html).toContain('id="change-password-form"');
    expect(html).toContain('id="change-password-old"');
    expect(html).toContain('id="change-password-new"');
    expect(html).toContain('data-password-toggle="change-password-old"');
    expect(html).toContain('data-password-toggle="change-password-new"');
    expect(html).toContain('/auth/eye.svg');
  });

  it('uses eye-off icon when change password fields are visible', () => {
    const html = renderChangePasswordScreen({
      authLoading: false,
      authFieldErrors: {},
      oldPasswordVisible: true,
      newPasswordVisible: true,
    });
    expect(html).toContain('/auth/eye-off.svg');
    expect(html).toContain('aria-label="Hide password"');
  });

  it('renders reset password confirm form hooks', () => {
    const html = renderResetPasswordConfirmScreen({
      authLoading: false,
      authFieldErrors: {},
    });
    expect(html).toContain('Set new password');
    expect(html).toContain('id="reset-password-confirm-form"');
    expect(html).toContain('id="reset-password-new"');
    expect(html).toContain('/auth/eye.svg');
  });

  it('renders post comments composer and back control', () => {
    const state = initialAppState();
    state.postCommentsOpen = true;
    state.postCommentsPostId = '12';
    const html = renderPostCommentsScreen(state, {
      id: '12',
      author: 'Fan',
      authorId: 1,
      initials: 'FA',
      avatarColor: '#3b5998',
      location: 'North',
      locationId: '3',
      timeAgo: '1m',
      feedType: 'fan-vibe',
      categoryId: '1',
      content: 'Hello section',
      upvotes: 2,
      comments: 0,
    });
    expect(html).toContain('Comments');
    expect(html).toContain('0 comment(s)');
    expect(html).toContain('id="post-comments-back-btn"');
    expect(html).toContain('id="post-comments-form"');
    expect(html).toContain('Hello section');
  });

  it('lets remote visitors read comments but not add one', () => {
    const state = initialAppState();
    state.postCommentsOpen = true;
    state.postCommentsPostId = '12';
    state.selectedVenueId = '1';
    state.forumVenues = [
      {
        id: 1,
        name: 'Riverside',
        location: 'Lagos',
        latitude: 6.45,
        longitude: 3.4,
      },
    ];
    state.locationPermission = 'granted';
    state.userLocation = { latitude: 43.64, longitude: -79.38, accuracy: 8 };
    const html = renderPostCommentsScreen(state, {
      id: '12',
      author: 'Fan',
      authorId: 1,
      initials: 'FA',
      avatarColor: '#3b5998',
      location: 'North',
      locationId: '3',
      timeAgo: '1m',
      feedType: 'fan-vibe',
      categoryId: '1',
      content: 'Hello section',
      upvotes: 2,
      comments: 0,
    });
    expect(html).toContain('Hello section');
    expect(html).toContain("You're not at Riverside");
    expect(html).toContain('You can still browse the map and posts');
    expect(html).toMatch(/id="post-comments-input"[\s\S]*?disabled/);
    expect(html).toMatch(/id="post-comments-send-btn"[\s\S]*?disabled/);
  });

  it('renders notification detail title', () => {
    const html = renderNotificationDetailScreen({
      loading: false,
      error: null,
      item: {
        id: 5,
        title: 'New reply',
        body: 'Someone replied to your post',
        isRead: false,
        notificationType: 'comment',
        venueId: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    });
    expect(html).toContain('New reply');
    expect(html).toContain('id="notification-detail-back-btn"');
  });

  it('shows a circular overlay when comments are loading with an empty thread', () => {
    const state = initialAppState();
    state.postCommentsLoading = true;
    const html = renderPostCommentsScreen(state, {
      id: '12',
      author: 'Fan',
      authorId: 1,
      initials: 'FA',
      avatarColor: '#3b5998',
      location: 'North',
      locationId: '3',
      timeAgo: '1m',
      feedType: 'fan-vibe',
      categoryId: '1',
      content: 'Hello section',
      upvotes: 2,
      comments: 0,
    });
    expect(html).toContain('screen-loading-overlay');
    expect(html).toContain('aria-label="Loading comments"');
    expect(html).not.toContain('Loading comments…');
    expect(html).not.toContain('No comments yet');
  });

  it('shows a circular overlay when notification detail is loading without cached data', () => {
    const html = renderNotificationDetailScreen({
      loading: true,
      error: null,
      item: null,
    });
    expect(html).toContain('screen-loading-overlay');
    expect(html).toContain('aria-label="Loading notification"');
    expect(html).not.toContain('Loading…');
  });

  it('shows a circular overlay when the notifications inbox is empty and loading', () => {
    const state = initialAppState();
    state.notificationsLoading = true;
    const html = renderNotificationsScreen(state);
    expect(html).toContain('screen-loading-overlay');
    expect(html).toContain('aria-label="Loading notifications"');
    expect(html).not.toContain('Loading notifications…');
    expect(html).not.toContain('No notifications yet');
  });

  it('renders backend catalog venues without a local sandbox card', () => {
    const html = renderVenueSelectScreen({
      venueSearchQuery: '',
      selectedVenueId: null,
      selectedGateId: null,
      forumVenues: [
        { id: 1, name: 'Riverside', location: 'Lagos' },
        {
          id: 8,
          name: 'LTV 8',
          location: 'Agidigbi',
          mappedinMapId: 'ltv-8',
        },
      ],
      forumSections: [],
      authLoading: false,
      authFieldErrors: {},
      locationPermission: 'undecided',
      userLocation: null,
    });
    expect(html).toContain('data-venue-id="1"');
    expect(html).toContain('data-venue-id="8"');
    expect(html).toContain('LTV 8');
    expect(html).not.toContain('venue-select-card--sandbox');
    expect(html).not.toContain('TEST');
  });

  it('shows a circular overlay while venues have not arrived yet', () => {
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
    expect(html).toContain('screen-loading-overlay');
    expect(html).toContain('aria-label="Loading venues"');
    expect(html).not.toContain('Loading venues…');
    expect(html).not.toContain('Entering venue…');
    expect(html).not.toContain('busy-indicator');
  });
});
