import type {
  AppNotification,
  PersonalNotificationEvent,
} from './entities';

export interface PersonalInboxSnapshot {
  notifications: AppNotification[];
  unreadCount: number;
}

/**
 * Pure personal-inbox reducer for `new_notification` WebSocket events.
 */
export function applyPersonalNotificationEvent(
  snapshot: PersonalInboxSnapshot,
  event: PersonalNotificationEvent,
): PersonalInboxSnapshot {
  if (event.type !== 'new_notification') return snapshot;

  const incoming = event.notification;
  if (snapshot.notifications.some((item) => item.id === incoming.id)) {
    return snapshot;
  }

  return {
    notifications: [incoming, ...snapshot.notifications],
    unreadCount: incoming.is_read
      ? snapshot.unreadCount
      : snapshot.unreadCount + 1,
  };
}
