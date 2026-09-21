import type { AppState } from '../types';
import { renderBusyLabel, renderContentLoadingOverlay } from './content-loading-overlay';
import { escapeHtml } from './escape-html';
import {
  formatUnreadBadge,
  mapNotificationsToListItems,
} from './notifications-data';

export function renderNotificationsScreen(state: AppState): string {
  const items = mapNotificationsToListItems(state.notifications);
  const unread = state.notificationsUnreadCount;
  const loading = state.notificationsLoading;
  const markingAll = state.notificationsMarkingAll;

  const showOverlay = loading && items.length === 0;
  const list = items.length
    ? items
        .map(
          (item) => `
        <button
          type="button"
          class="notifications-row${!item.isRead ? ' is-unread' : ''}"
          data-notification-id="${escapeHtml(item.id)}"
        >
          <span class="notifications-row-indicator" aria-hidden="true"></span>
          <span class="notifications-row-copy">
            <span class="notifications-row-title">${escapeHtml(item.title)}</span>
            ${
              item.body
                ? `<span class="notifications-row-body">${escapeHtml(item.body)}</span>`
                : ''
            }
            <span class="notifications-row-meta">${escapeHtml(item.timeAgo)}</span>
          </span>
        </button>
      `,
        )
        .join('<div class="notifications-divider"></div>')
    : showOverlay
      ? ''
      : `<p class="notifications-empty">No notifications yet.</p>`;

  const badge = formatUnreadBadge(unread);
  const markAllDisabled = markingAll || unread <= 0 || loading;
  const showMarkAllSpinner = markingAll && !showOverlay;
  const showLoadMoreSpinner = loading && items.length > 0 && !markingAll;

  return `
    <div class="notifications-screen">
      <header class="notifications-header">
        <button type="button" id="notifications-back-btn" class="notifications-back-btn" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
        <div class="notifications-header-copy">
          <h1 class="notifications-title">Notifications</h1>
          ${
            badge
              ? `<p class="notifications-subtitle">${escapeHtml(badge)} unread</p>`
              : `<p class="notifications-subtitle">Account alerts</p>`
          }
        </div>
        <button
          type="button"
          id="notifications-mark-all-btn"
          class="notifications-mark-all-btn${showMarkAllSpinner ? ' is-loading' : ''}"
          ${markAllDisabled ? 'disabled' : ''}
          aria-busy="${showMarkAllSpinner ? 'true' : 'false'}"
        >
          ${showMarkAllSpinner ? renderBusyLabel('Marking…') : 'Mark all read'}
        </button>
      </header>

      <div class="notifications-content screen-loading-host">
        <div class="notifications-card">
          ${list}
        </div>
        ${
          state.notificationsNext && !showOverlay
            ? `<button type="button" id="notifications-load-more-btn" class="notifications-load-more${showLoadMoreSpinner ? ' is-loading' : ''}" ${loading || markingAll ? 'disabled' : ''} aria-busy="${showLoadMoreSpinner ? 'true' : 'false'}">
                ${showLoadMoreSpinner ? renderBusyLabel('Loading…') : 'Load more'}
              </button>`
            : ''
        }
        ${
          showOverlay
            ? renderContentLoadingOverlay('Loading notifications')
            : ''
        }
      </div>
    </div>
  `;
}
