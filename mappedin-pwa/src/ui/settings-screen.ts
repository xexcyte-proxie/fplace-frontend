import { PROFILE_DESIGN } from './profile-data';
import type { AppState } from '../types';

/** Static settings screen content from Frame-11 design spec. */
export const SETTINGS_DESIGN = {
  pseudoName: PROFILE_DESIGN.displayName,
  interestsCount: PROFILE_DESIGN.interests.length,
  venue: 'LA Stadium',
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const chevronRight = `
  <svg class="settings-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

function settingsRow(options: {
  iconClass: string;
  icon: string;
  title: string;
  subtitle?: string;
  titleClass?: string;
  subtitleClass?: string;
  accessory?: string;
  tag?: string;
}): string {
  const subtitle = options.subtitle
    ? `<span class="settings-row-subtitle ${options.subtitleClass ?? ''}">${escapeHtml(options.subtitle)}</span>`
    : '';

  return `
    <${options.tag ?? 'button'}${options.tag ? '' : ' type="button"'} class="settings-row ${options.tag ? 'settings-row--static' : ''}">
      <span class="settings-row-icon ${options.iconClass}">${options.icon}</span>
      <span class="settings-row-copy">
        <span class="settings-row-title ${options.titleClass ?? ''}">${escapeHtml(options.title)}</span>
        ${subtitle}
      </span>
      ${options.accessory ?? chevronRight}
    </${options.tag ?? 'button'}>
  `;
}

export function renderSettingsScreen(state: AppState): string {
  const design = SETTINGS_DESIGN;
  const notificationsOn = state.notificationsEnabled;

  return `
    <div class="settings-screen">
      <header class="settings-header">
        <button type="button" id="settings-back-btn" class="settings-back-btn" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
        <h1 class="settings-title">Settings</h1>
      </header>

      <div class="settings-content">
        <section class="settings-group">
          <h2 class="settings-group-label">Account</h2>
          <div class="settings-card">
            ${settingsRow({
              iconClass: 'settings-row-icon--purple',
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.7L12 15.8 6.4 19.5l2.1-6.7L3 8.8h6.8L12 2z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path></svg>`,
              title: 'Pseudo-name',
              subtitle: design.pseudoName,
            })}
            <div class="settings-divider"></div>
            ${settingsRow({
              iconClass: 'settings-row-icon--green',
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.75"></circle><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.75"></circle><path d="M12 4v2M12 18v2M4 12h2M18 12h2" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path></svg>`,
              title: 'Interests',
              subtitle: `${design.interestsCount} selected`,
            })}
            <div class="settings-divider"></div>
            ${settingsRow({
              iconClass: 'settings-row-icon--blue',
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s6.5-4.5 6.5-10a6.5 6.5 0 10-13 0c0 5.5 6.5 10 6.5 10z" stroke="currentColor" stroke-width="1.75"></path><circle cx="12" cy="11" r="2.25" stroke="currentColor" stroke-width="1.75"></circle></svg>`,
              title: 'Change venue',
              subtitle: design.venue,
            })}
          </div>
        </section>

        <section class="settings-group">
          <h2 class="settings-group-label">Preferences</h2>
          <div class="settings-card">
            ${settingsRow({
              tag: 'div',
              iconClass: 'settings-row-icon--orange',
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4a4 4 0 00-4 4v1.1c0 .5-.2 1-.5 1.4L6 12.5V14h12v-1.5l-1.5-2c-.3-.4-.5-.9-.5-1.4V8a4 4 0 00-4-4z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path><path d="M10 18a2 2 0 004 0" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path></svg>`,
              title: 'Notifications',
              subtitle: 'Feed replies and alerts',
              accessory: `
                <button
                  type="button"
                  id="settings-notifications-toggle"
                  class="settings-toggle ${notificationsOn ? 'is-on' : ''}"
                  role="switch"
                  aria-checked="${notificationsOn}"
                  aria-label="Notifications"
                >
                  <span class="settings-toggle-thumb"></span>
                </button>
              `,
            })}
          </div>
        </section>

        <section class="settings-group settings-group--danger">
          <h2 class="settings-group-label settings-group-label--danger">Danger zone</h2>
          <div class="settings-card settings-card--danger">
            ${settingsRow({
              iconClass: 'settings-row-icon--danger',
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6H5a2 2 0 00-2 2v8a2 2 0 002 2h4M16 12H9m0 0l3-3m-3 3l3 3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
              title: 'Log out',
            })}
            <div class="settings-divider settings-divider--danger"></div>
            ${settingsRow({
              iconClass: 'settings-row-icon--danger',
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 4h4v2h3v2h-2l-1 10H10L9 8H7V6h3V4z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path><path d="M14 16H10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path></svg>`,
              title: 'Delete account',
              titleClass: 'settings-row-title--danger',
              subtitle: 'Permanently remove your data',
              subtitleClass: 'settings-row-subtitle--danger',
            })}
          </div>
        </section>
      </div>
    </div>
  `;
}
