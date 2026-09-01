import { resolveDisplayName, type AppState } from '../types';
import { APP_VERSION, SETTINGS_SUPPORT } from './settings-data';

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
  id?: string;
  href?: string;
  disabled?: boolean;
}): string {
  const subtitle = options.subtitle
    ? `<span class="settings-row-subtitle ${options.subtitleClass ?? ''}">${escapeHtml(options.subtitle)}</span>`
    : '';
  const idAttr = options.id ? ` id="${escapeHtml(options.id)}"` : '';
  const disabledAttr =
    !options.tag && !options.href && options.disabled
      ? ' disabled aria-disabled="true"'
      : '';

  if (options.href) {
    return `
      <a${idAttr} class="settings-row" href="${escapeHtml(options.href)}">
        <span class="settings-row-icon ${options.iconClass}">${options.icon}</span>
        <span class="settings-row-copy">
          <span class="settings-row-title ${options.titleClass ?? ''}">${escapeHtml(options.title)}</span>
          ${subtitle}
        </span>
        ${options.accessory ?? chevronRight}
      </a>
    `;
  }

  return `
    <${options.tag ?? 'button'}${options.tag ? '' : ' type="button"'}${idAttr}${disabledAttr} class="settings-row ${options.tag ? 'settings-row--static' : ''}${options.disabled ? ' settings-row--disabled' : ''}">
      <span class="settings-row-icon ${options.iconClass}">${options.icon}</span>
      <span class="settings-row-copy">
        <span class="settings-row-title ${options.titleClass ?? ''}">${escapeHtml(options.title)}</span>
        ${subtitle}
      </span>
      ${options.accessory ?? (options.tag ? '' : chevronRight)}
    </${options.tag ?? 'button'}>
  `;
}

function renderSettingsConfirm(state: AppState): string {
  const kind = state.settingsConfirm;
  if (!kind) return '';

  const isDelete = kind === 'delete-account';
  const title = isDelete ? 'Delete account?' : 'Log out?';
  const body = isDelete
    ? 'This permanently removes your account and cannot be undone.'
    : 'You will need to sign in again to use fPlaces.';
  const confirmLabel = isDelete ? 'Delete account' : 'Log out';
  const confirmId = isDelete
    ? 'settings-confirm-delete-btn'
    : 'settings-confirm-logout-btn';

  return `
    <div class="settings-confirm-backdrop" id="settings-confirm-dismiss">
      <div
        class="settings-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-confirm-title"
      >
        <h2 class="settings-confirm-title" id="settings-confirm-title">${escapeHtml(title)}</h2>
        <p class="settings-confirm-body">${escapeHtml(body)}</p>
        <div class="settings-confirm-actions">
          <button type="button" id="settings-confirm-cancel-btn" class="settings-confirm-btn">
            Cancel
          </button>
          <button
            type="button"
            id="${confirmId}"
            class="settings-confirm-btn settings-confirm-btn--danger"
            ${state.authLoading ? 'disabled' : ''}
          >
            ${state.authLoading ? 'Working…' : escapeHtml(confirmLabel)}
          </button>
        </div>
      </div>
    </div>
  `;
}

export function renderSettingsScreen(state: AppState): string {
  const notificationsOn = state.notificationsEnabled;
  const simulationOn = state.simulationEnabled;
  const pseudoName = resolveDisplayName(state.authUser);
  const interests =
    state.authUser?.interests?.length
      ? state.authUser.interests
      : state.selectedInterests;
  const interestsSubtitle =
    interests.length > 0
      ? `${interests.length} selected`
      : 'None selected';
  const venue =
    state.forumVenues.find((item) => String(item.id) === state.selectedVenueId)
      ?.name || 'Choose a venue';
  const mapLanguage =
    state.mapLanguageName ||
    state.mapLanguages.find((item) => item.code === state.mapLanguageCode)?.name ||
    (state.mapLanguages.length ? 'Default' : 'Not available');
  const languageDisabled = state.mapLanguages.length === 0;

  return `
    <div class="settings-screen">
      <header class="settings-header">
        <button type="button" id="settings-back-btn" class="settings-back-btn" aria-label="Back">
          <img class="settings-back-icon" src="/auth/back-chevron.svg" alt="" width="22" height="22" />
        </button>
        <h1 class="settings-title">Settings</h1>
      </header>

      <div class="settings-content">
        <section class="settings-group">
          <h2 class="settings-group-label">Account</h2>
          <div class="settings-card">
            ${settingsRow({
              id: 'settings-edit-profile-btn',
              iconClass: 'settings-row-icon--purple',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.7L12 15.8 6.4 19.5l2.1-6.7L3 8.8h6.8L12 2z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path></svg>`,
              title: 'Pseudo-name',
              subtitle: pseudoName,
            })}
            <div class="settings-divider"></div>
            ${settingsRow({
              id: 'settings-interests-btn',
              iconClass: 'settings-row-icon--green',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.75"></circle><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.75"></circle><path d="M12 4v2M12 18v2M4 12h2M18 12h2" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path></svg>`,
              title: 'Interests',
              subtitle: interestsSubtitle,
            })}
            <div class="settings-divider"></div>
            ${settingsRow({
              id: 'settings-change-password-btn',
              iconClass: 'settings-row-icon--indigo',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.75"></rect><path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path></svg>`,
              title: 'Change password',
              subtitle: 'Update your sign-in password',
            })}
            <div class="settings-divider"></div>
            ${settingsRow({
              id: 'settings-change-venue-btn',
              iconClass: 'settings-row-icon--blue',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s6.5-4.5 6.5-10a6.5 6.5 0 10-13 0c0 5.5 6.5 10 6.5 10z" stroke="currentColor" stroke-width="1.75"></path><circle cx="12" cy="11" r="2.25" stroke="currentColor" stroke-width="1.75"></circle></svg>`,
              title: 'Change venue',
              subtitle: venue,
            })}
          </div>
        </section>

        <section class="settings-group">
          <h2 class="settings-group-label">Preferences</h2>
          <div class="settings-card">
            ${settingsRow({
              tag: 'div',
              iconClass: 'settings-row-icon--orange',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4a4 4 0 00-4 4v1.1c0 .5-.2 1-.5 1.4L6 12.5V14h12v-1.5l-1.5-2c-.3-.4-.5-.9-.5-1.4V8a4 4 0 00-4-4z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path><path d="M10 18a2 2 0 004 0" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path></svg>`,
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
            <div class="settings-divider"></div>
            ${settingsRow({
              id: 'settings-language-btn',
              iconClass: 'settings-row-icon--indigo',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"></circle><path d="M3 12h18M12 3c2.8 2.6 4.2 5.8 4.2 9s-1.4 6.4-4.2 9c-2.8-2.6-4.2-5.8-4.2-9S9.2 5.6 12 3z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path></svg>`,
              title: 'Map language',
              subtitle: mapLanguage,
              disabled: languageDisabled,
              accessory: languageDisabled
                ? `<span class="settings-row-locked" aria-hidden="true"></span>`
                : chevronRight,
            })}
            <div class="settings-divider"></div>
            ${settingsRow({
              tag: 'div',
              iconClass: 'settings-row-icon--teal',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5.5v13l11-6.5L8 5.5z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path><path d="M4 8v8M20 8v8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path></svg>`,
              title: 'Simulation',
              subtitle: simulationOn
                ? 'Simulate movement along routes'
                : 'Live indoor positioning on the route',
              accessory: `
                <button
                  type="button"
                  id="settings-simulation-toggle"
                  class="settings-toggle ${simulationOn ? 'is-on' : ''}"
                  role="switch"
                  aria-checked="${simulationOn}"
                  aria-label="Simulation"
                >
                  <span class="settings-toggle-thumb"></span>
                </button>
              `,
            })}
          </div>
        </section>

        <section class="settings-group">
          <h2 class="settings-group-label">Support</h2>
          <div class="settings-card">
            ${settingsRow({
              id: 'settings-help-btn',
              href: SETTINGS_SUPPORT.mailto,
              iconClass: 'settings-row-icon--green',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"></circle><path d="M9.5 9.5a2.5 2.5 0 114.2 1.8c-.8.7-1.7 1.2-1.7 2.2V14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path><path d="M12 17h.01" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"></path></svg>`,
              title: 'Help & support',
              subtitle: SETTINGS_SUPPORT.email,
            })}
            <div class="settings-divider"></div>
            ${settingsRow({
              id: 'settings-replay-tour-btn',
              iconClass: 'settings-row-icon--orange',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"></circle><path d="M12 8v4l3 2" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
              title: 'App tour',
              subtitle: 'Replay the highlight walkthrough',
            })}
            <div class="settings-divider"></div>
            ${settingsRow({
              id: 'settings-privacy-btn',
              iconClass: 'settings-row-icon--indigo',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-2.8 8.2-7 10-4.2-1.8-7-5.5-7-10V6l7-3z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path></svg>`,
              title: 'Privacy policy',
            })}
            <div class="settings-divider"></div>
            ${settingsRow({
              id: 'settings-terms-btn',
              iconClass: 'settings-row-icon--blue',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4h10a2 2 0 012 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 012-2z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path><path d="M9 9h6M9 13h6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path></svg>`,
              title: 'Terms & Conditions',
            })}
            <div class="settings-divider"></div>
            ${settingsRow({
              id: 'settings-about-btn',
              iconClass: 'settings-row-icon--purple',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"></circle><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path></svg>`,
              title: 'About',
              subtitle: `Version ${APP_VERSION}`,
            })}
          </div>
        </section>

        <section class="settings-group settings-group--danger">
          <h2 class="settings-group-label settings-group-label--danger">Danger zone</h2>
          <div class="settings-card settings-card--danger">
            ${settingsRow({
              id: 'settings-logout-btn',
              iconClass: 'settings-row-icon--danger',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6H5a2 2 0 00-2 2v8a2 2 0 002 2h4M16 12H9m0 0l3-3m-3 3l3 3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
              title: 'Log out',
              accessory: '',
            })}
            <div class="settings-divider settings-divider--danger"></div>
            ${settingsRow({
              id: 'settings-delete-account-btn',
              iconClass: 'settings-row-icon--danger',
              icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 4h4v2h3v2h-2l-1 10H10L9 8H7V6h3V4z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path><path d="M14 16H10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path></svg>`,
              title: 'Delete account',
              titleClass: 'settings-row-title--danger',
              subtitle: 'Permanently remove your data',
              subtitleClass: 'settings-row-subtitle--danger',
              accessory: '',
            })}
          </div>
        </section>
      </div>

      ${renderSettingsConfirm(state)}
    </div>
  `;
}
