import type {
  AppNotification,
  PaginatedList,
  PersonalNotificationEventHandler,
  PersonalNotificationSubscription,
} from '../domain/entities';
import type { NotificationsRepository } from '../domain/repositories/notifications-repository';
import { notificationsRemoteDatasource } from './datasources/notifications-remote-datasource';
import { notificationsWsDatasource } from './datasources/notifications-ws-datasource';

export class NotificationsRepositoryImpl implements NotificationsRepository {
  listNotifications(page?: number): Promise<PaginatedList<AppNotification>> {
    return notificationsRemoteDatasource.listNotifications(page);
  }

  getNotification(notificationId: number): Promise<AppNotification> {
    return notificationsRemoteDatasource.getNotification(notificationId);
  }

  getUnreadCount(): Promise<number> {
    return notificationsRemoteDatasource.getUnreadCount();
  }

  markRead(notificationId: number): Promise<AppNotification | void> {
    return notificationsRemoteDatasource.markRead(notificationId);
  }

  markAllRead(): Promise<void> {
    return notificationsRemoteDatasource.markAllRead();
  }

  subscribePersonal(
    onEvent: PersonalNotificationEventHandler,
  ): PersonalNotificationSubscription {
    return notificationsWsDatasource.connect(onEvent);
  }
}

export const notificationsRepository = new NotificationsRepositoryImpl();
