import { apiRequest } from '../../../auth/data/datasources/api-client';
import type { AppNotification, PaginatedList } from '../../domain/entities';

function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export class NotificationsRemoteDatasource {
  async listNotifications(
    page = 1,
  ): Promise<PaginatedList<AppNotification>> {
    const response = await apiRequest<PaginatedList<unknown>>(
      withQuery('/api/notifications/', { page }),
      {
        auth: true,
        fallbackError: 'Could not load notifications. Please try again.',
      },
    );

    return {
      count: Number(response.count) || 0,
      next: response.next ?? null,
      previous: response.previous ?? null,
      results: (response.results ?? [])
        .map((row) => coerceNotification(row))
        .filter((row): row is AppNotification => row != null),
    };
  }

  async getNotification(notificationId: number): Promise<AppNotification> {
    const response = await apiRequest<unknown>(
      `/api/notifications/${notificationId}/`,
      {
        auth: true,
        fallbackError: 'Could not load that notification.',
      },
    );
    const notification = coerceNotification(response);
    if (!notification) {
      throw new Error('Could not load that notification.');
    }
    return notification;
  }

  async getUnreadCount(): Promise<number> {
    const response = await apiRequest<{ unread_count?: number }>(
      '/api/notifications/unread_count/',
      {
        auth: true,
        fallbackError: 'Could not load unread count.',
      },
    );
    return Number(response.unread_count) || 0;
  }

  async markRead(notificationId: number): Promise<AppNotification | void> {
    const response = await apiRequest<unknown>(
      `/api/notifications/${notificationId}/mark_read/`,
      {
        method: 'POST',
        auth: true,
        fallbackError: 'Could not mark that notification as read.',
      },
    );
    return coerceNotification(response) ?? undefined;
  }

  markAllRead(): Promise<void> {
    return apiRequest<void>('/api/notifications/mark_all_read/', {
      method: 'POST',
      auth: true,
      fallbackError: 'Could not mark notifications as read.',
    });
  }
}

export function coerceNotification(raw: unknown): AppNotification | null {
  if (!raw || typeof raw !== 'object') return null;
  const dto = raw as Record<string, unknown>;
  const id = Number(dto.id);
  if (!Number.isFinite(id)) return null;

  const venueRaw = dto.venue;
  const venue =
    venueRaw == null || venueRaw === ''
      ? null
      : Number(venueRaw);

  const isRead =
    typeof dto.is_read === 'boolean'
      ? dto.is_read
      : typeof dto.read === 'boolean'
        ? dto.read
        : typeof dto.isRead === 'boolean'
          ? dto.isRead
          : false;

  const createdAt = String(
    dto.created_at ?? dto.createdAt ?? dto.created ?? new Date().toISOString(),
  );
  const updatedAt = String(
    dto.updated_at ?? dto.updatedAt ?? dto.updated ?? createdAt,
  );

  return {
    id,
    title: String(dto.title ?? dto.subject ?? 'Notification').trim() || 'Notification',
    body: String(
      dto.body ?? dto.message ?? dto.content ?? dto.text ?? '',
    ).trim(),
    is_read: isRead,
    notification_type: String(
      dto.notification_type ?? dto.type ?? dto.event_type ?? 'general',
    ),
    venue: venue != null && Number.isFinite(venue) ? venue : null,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export const notificationsRemoteDatasource =
  new NotificationsRemoteDatasource();
