/** Cross-venue, account-level alert for the signed-in user. */
export interface AppNotification {
  id: number;
  title: string;
  body: string;
  is_read: boolean;
  notification_type: string;
  venue: number | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedList<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Receive-only pushes on `ws/notifications/`. */
export type PersonalNotificationEvent = {
  type: 'new_notification';
  notification: AppNotification;
};

export type PersonalNotificationEventHandler = (
  event: PersonalNotificationEvent,
) => void;

export interface PersonalNotificationSubscription {
  disconnect(): void;
}
