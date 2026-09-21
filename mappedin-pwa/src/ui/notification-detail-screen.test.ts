import { describe, expect, it } from 'vitest';

import type { NotificationItem } from '../types';
import { renderNotificationDetailScreen } from './notification-detail-screen';

function notification(
  overrides: Partial<NotificationItem> = {},
): NotificationItem {
  return {
    id: 5,
    title: 'New reply',
    body: 'Someone replied to your post',
    isRead: false,
    notificationType: 'comment',
    venueId: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('renderNotificationDetailScreen', () => {
  it('keeps notification-detail hooks used by ui-root-events', () => {
    const html = renderNotificationDetailScreen({
      loading: false,
      error: null,
      item: notification(),
    });
    expect(html).toContain('id="notification-detail-back-btn"');
    expect(html).toContain('aria-label="Back"');
    expect(html).toContain('Notification');
    expect(html).toContain('Details');
    expect(html).toContain('comment');
    expect(html).toContain('New reply');
    expect(html).toContain('Someone replied to your post');
  });

  it('shows empty copy when the notification is missing', () => {
    const html = renderNotificationDetailScreen({
      loading: false,
      error: null,
      item: null,
    });
    expect(html).toContain('Notification not found.');
    expect(html).not.toContain('notification-detail-card');
    expect(html).not.toContain('screen-loading-overlay');
  });

  it('shows an error alert instead of the missing-item copy', () => {
    const html = renderNotificationDetailScreen({
      loading: false,
      error: 'Could not load notification.',
      item: null,
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Could not load notification.');
    expect(html).not.toContain('Notification not found.');
  });

  it('falls back to Alert when the notification type is empty', () => {
    const html = renderNotificationDetailScreen({
      loading: false,
      error: null,
      item: notification({ notificationType: '' }),
    });
    expect(html).toContain('Alert');
  });

  it('escapes title, body, type, and errors that look like HTML', () => {
    const withMarkup = renderNotificationDetailScreen({
      loading: false,
      error: null,
      item: notification({
        notificationType: '<script>x</script>',
        title: '<img src=x>',
        body: '<b>hi</b>',
      }),
    });
    expect(withMarkup).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(withMarkup).toContain('&lt;img src=x&gt;');
    expect(withMarkup).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(withMarkup).not.toContain('<script>x</script>');
    expect(withMarkup).not.toContain('<img src=x>');
    expect(withMarkup).not.toContain('<b>hi</b>');

    const withError = renderNotificationDetailScreen({
      loading: false,
      error: '<img src=x onerror=alert(1)>',
      item: null,
    });
    expect(withError).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(withError).not.toContain('<img src=x onerror=alert(1)>');
  });
});
