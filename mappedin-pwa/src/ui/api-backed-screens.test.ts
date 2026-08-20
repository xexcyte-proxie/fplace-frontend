import { describe, expect, it } from 'vitest';

import { renderChangePasswordScreen } from './change-password-screen';
import { renderResetPasswordConfirmScreen } from './reset-password-confirm-screen';
import { renderPostCommentsScreen } from './post-comments-screen';
import { renderNotificationDetailScreen } from './notification-detail-screen';
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
    expect(html).toContain('id="post-comments-back-btn"');
    expect(html).toContain('id="post-comments-form"');
    expect(html).toContain('Hello section');
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
});
