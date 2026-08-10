/**
 * Personal notifications façade — presentation and MapApp talk to this module only.
 * REST history + personal WebSocket live behind the notifications repository.
 */
import type {
  AppNotification,
  PaginatedList,
  PersonalNotificationEventHandler,
  PersonalNotificationSubscription,
} from '../notifications/domain/entities';
import { notificationsRepository } from '../notifications/data/notifications-repository-impl';

export type {
  AppNotification,
  PaginatedList,
  PersonalNotificationEvent,
  PersonalNotificationSubscription,
} from '../notifications/domain/entities';

export async function listNotifications(
  page = 1,
): Promise<PaginatedList<AppNotification>> {
  return notificationsRepository.listNotifications(page);
}

export async function getNotification(
  notificationId: number,
): Promise<AppNotification> {
  return notificationsRepository.getNotification(notificationId);
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  return notificationsRepository.getUnreadCount();
}

/** Initial paginated inbox fetch after auth / venue entry. */
export async function loadInitialNotifications(): Promise<
  PaginatedList<AppNotification>
> {
  return listNotifications(1);
}

export async function markNotificationRead(
  notificationId: number,
): Promise<AppNotification | void> {
  return notificationsRepository.markRead(notificationId);
}

export async function markAllNotificationsRead(): Promise<void> {
  return notificationsRepository.markAllRead();
}

/**
 * Open the receive-only personal notifications WebSocket.
 * Call after the user has a valid access token (account-level, cross-venue).
 */
export function subscribePersonalNotifications(
  onEvent: PersonalNotificationEventHandler,
): PersonalNotificationSubscription {
  return notificationsRepository.subscribePersonal(onEvent);
}

/** Unread count from a page of notifications (used to seed the badge). */
export function countUnread(notifications: AppNotification[]): number {
  return notifications.reduce(
    (total, notification) => total + (notification.is_read ? 0 : 1),
    0,
  );
}
