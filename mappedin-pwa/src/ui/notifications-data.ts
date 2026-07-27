import type { NotificationItem } from '../types';
import { formatTimeAgo } from './venue-feed-data';

export interface NotificationListItem {
  id: string;
  title: string;
  body: string;
  timeAgo: string;
  isRead: boolean;
  type: string;
}

export function mapNotificationsToListItems(
  notifications: NotificationItem[],
): NotificationListItem[] {
  return notifications.map(mapNotificationToListItem);
}

export function mapNotificationToListItem(
  notification: NotificationItem,
): NotificationListItem {
  return {
    id: String(notification.id),
    title: notification.title,
    body: notification.body,
    timeAgo: formatTimeAgo(notification.createdAt),
    isRead: notification.isRead,
    type: notification.notificationType,
  };
}

export function formatUnreadBadge(count: number): string {
  if (count <= 0) return '';
  if (count > 99) return '99+';
  return String(count);
}
