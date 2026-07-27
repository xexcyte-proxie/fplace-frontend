import type {
  AppNotification,
  PaginatedList,
  PersonalNotificationEventHandler,
  PersonalNotificationSubscription,
} from '../entities';

export interface NotificationsRepository {
  listNotifications(page?: number): Promise<PaginatedList<AppNotification>>;
  markRead(notificationId: number): Promise<AppNotification | void>;
  markAllRead(): Promise<void>;
  /**
   * Receive-only personal WebSocket.
   * Call after auth is established (cross-venue, account-level).
   */
  subscribePersonal(
    onEvent: PersonalNotificationEventHandler,
  ): PersonalNotificationSubscription;
}
