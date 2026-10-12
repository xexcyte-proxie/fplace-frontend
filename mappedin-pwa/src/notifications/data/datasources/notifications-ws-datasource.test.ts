import { describe, expect, it } from 'vitest';

import { FPLACES_BACKEND_WS_ORIGIN } from '../../../config/fplaces-backend';
import {
  buildNotificationsWsUrl,
  parsePersonalNotificationMessage,
} from './notifications-ws-datasource';

describe('buildNotificationsWsUrl', () => {
  it('uses the backend websocket origin by default', () => {
    expect(buildNotificationsWsUrl('secret.jwt')).toBe(
      `${FPLACES_BACKEND_WS_ORIGIN}/ws/notifications/?token=secret.jwt`,
    );
  });
});

describe('parsePersonalNotificationMessage', () => {
  it('parses nested new_notification without using the event type as the category', () => {
    const parsed = parsePersonalNotificationMessage({
      type: 'new_notification',
      notification: {
        id: 12,
        title: 'Reply',
        body: 'Someone commented',
        is_read: false,
        notification_type: 'comment',
        venue: 1,
        created_at: '2026-09-02T10:00:00.000Z',
      },
    });
    expect(parsed).toMatchObject({
      type: 'new_notification',
      notification: {
        id: 12,
        title: 'Reply',
        notification_type: 'comment',
        is_read: false,
      },
    });
  });

  it('parses a flat payload and ignores unrelated frames', () => {
    const parsed = parsePersonalNotificationMessage({
      type: 'new_notification',
      id: 3,
      title: 'Welcome',
      message: 'You are in',
      isRead: true,
    });
    expect(parsed?.notification).toMatchObject({
      id: 3,
      title: 'Welcome',
      body: 'You are in',
      is_read: true,
      notification_type: 'general',
    });

    expect(parsePersonalNotificationMessage({ type: 'ping' })).toBeNull();
    expect(parsePersonalNotificationMessage({ type: 'new_notification' })).toBeNull();
  });
});
