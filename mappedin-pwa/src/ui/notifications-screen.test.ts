import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import type { NotificationItem } from '../types';
import { renderNotificationsScreen } from './notifications-screen';

function notification(
  overrides: Partial<NotificationItem> = {},
): NotificationItem {
  return {
    id: 5,
    title: 'New reply',
    body: 'Someone replied',
    isRead: false,
    notificationType: 'comment',
    venueId: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('renderNotificationsScreen', () => {
  it('keeps notifications hooks used by ui-root-events', () => {
    const state = initialAppState();
    state.notifications = [notification()];
    state.notificationsUnreadCount = 1;
    state.notificationsNext = 'https://api.example.com/next';
    const html = renderNotificationsScreen(state);
    expect(html).toContain('id="notifications-back-btn"');
    expect(html).toContain('aria-label="Back"');
    expect(html).toContain('id="notifications-mark-all-btn"');
    expect(html).toContain('id="notifications-load-more-btn"');
    expect(html).toContain('data-notification-id="5"');
  });

  it('shows the empty inbox copy when there are no notifications', () => {
    const html = renderNotificationsScreen(initialAppState());
    expect(html).toContain('No notifications yet.');
    expect(html).toContain('Account alerts');
    expect(html).toContain('Mark all read');
    expect(html).not.toContain('data-notification-id');
    expect(html).not.toContain('id="notifications-load-more-btn"');
  });

  it('shows an unread badge and enables mark-all when there are unread items', () => {
    const state = initialAppState();
    state.notifications = [notification()];
    state.notificationsUnreadCount = 3;
    const html = renderNotificationsScreen(state);
    expect(html).toContain('3 unread');
    expect(html).toContain('is-unread');
    expect(html).toContain('New reply');
    expect(html).toContain('Someone replied');
    const markAll = /<button[^>]*id="notifications-mark-all-btn"[\s\S]*?>/.exec(
      html,
    );
    expect(markAll?.[0]).not.toContain('disabled');
  });

  it('caps the unread badge at 99+', () => {
    const state = initialAppState();
    state.notificationsUnreadCount = 100;
    const html = renderNotificationsScreen(state);
    expect(html).toContain('99+ unread');
  });

  it('disables mark-all when there are no unread items', () => {
    const html = renderNotificationsScreen(initialAppState());
    expect(html).toMatch(/id="notifications-mark-all-btn"[\s\S]*?disabled/);
  });

  it('shows Load more when a next page is available', () => {
    const state = initialAppState();
    state.notifications = [notification({ isRead: true })];
    state.notificationsNext = 'https://api.example.com/next';
    const html = renderNotificationsScreen(state);
    expect(html).toContain('id="notifications-load-more-btn"');
    expect(html).toContain('Load more');
    expect(html).not.toContain('is-unread');
  });

  it('escapes notification title and body that look like HTML', () => {
    const state = initialAppState();
    state.notifications = [
      notification({
        title: '<img src=x>',
        body: '<b>hi</b>',
      }),
    ];
    const html = renderNotificationsScreen(state);
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('<b>hi</b>');
  });
});
