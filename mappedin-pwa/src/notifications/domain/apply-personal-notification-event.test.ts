import { describe, expect, it } from 'vitest';

import { applyPersonalNotificationEvent } from './apply-personal-notification-event';
import type { AppNotification } from './entities';

function notification(
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: 1,
    title: 'Kickoff',
    body: 'Your section is heating up',
    is_read: false,
    notification_type: 'forum',
    venue: 1,
    created_at: '2026-09-02T10:00:00.000Z',
    updated_at: '2026-09-02T10:00:00.000Z',
    ...overrides,
  };
}

describe('applyPersonalNotificationEvent', () => {
  it('prepends unread notifications and increments the badge', () => {
    const next = applyPersonalNotificationEvent(
      { notifications: [notification({ id: 2, is_read: true })], unreadCount: 0 },
      { type: 'new_notification', notification: notification() },
    );
    expect(next.notifications.map((row) => row.id)).toEqual([1, 2]);
    expect(next.unreadCount).toBe(1);
  });

  it('ignores duplicates and already-read inserts do not bump unread', () => {
    const existing = notification();
    const duplicate = applyPersonalNotificationEvent(
      { notifications: [existing], unreadCount: 1 },
      { type: 'new_notification', notification: existing },
    );
    expect(duplicate.unreadCount).toBe(1);
    expect(duplicate.notifications).toHaveLength(1);

    const read = applyPersonalNotificationEvent(
      { notifications: [], unreadCount: 4 },
      {
        type: 'new_notification',
        notification: notification({ id: 9, is_read: true }),
      },
    );
    expect(read.unreadCount).toBe(4);
    expect(read.notifications[0]?.id).toBe(9);
  });
});
