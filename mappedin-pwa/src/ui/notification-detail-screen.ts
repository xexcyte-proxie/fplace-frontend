import type { NotificationItem } from '../types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function renderNotificationDetailScreen(options: {
  item: NotificationItem | null;
  loading: boolean;
  error: string | null;
}): string {
  const { item, loading, error } = options;

  const body = loading
    ? `<p class="notification-detail-empty" role="status">Loading…</p>`
    : error
      ? `<p class="notification-detail-error" role="alert">${escapeHtml(error)}</p>`
      : item
        ? `
        <article class="notification-detail-card">
          <p class="notification-detail-type">${escapeHtml(item.notificationType || 'Alert')}</p>
          <h2 class="notification-detail-title">${escapeHtml(item.title)}</h2>
          ${
            item.body
              ? `<p class="notification-detail-body">${escapeHtml(item.body)}</p>`
              : ''
          }
          <p class="notification-detail-meta">${escapeHtml(formatWhen(item.createdAt))}</p>
        </article>
      `
        : `<p class="notification-detail-empty">Notification not found.</p>`;

  return `
    <div class="notification-detail-screen">
      <header class="notifications-header">
        <button type="button" id="notification-detail-back-btn" class="notifications-back-btn" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
        <div class="notifications-header-copy">
          <h1 class="notifications-title">Notification</h1>
          <p class="notifications-subtitle">Details</p>
        </div>
      </header>
      <div class="notification-detail-content">
        ${body}
      </div>
    </div>
  `;
}
