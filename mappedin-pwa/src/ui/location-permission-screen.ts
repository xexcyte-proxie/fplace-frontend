import { getLocationDiagnosticReport } from '../location/domain/location-diagnostics';
import type { AppState } from '../types';
import { renderBusyLabel } from './content-loading-overlay';
import { escapeHtml } from './escape-html';

/**
 * Location permission gate as a modal dialog over the current auth screen.
 */
export function renderLocationPermissionScreen(
  state: Pick<AppState, 'locationGateLoading'>,
): string {
  const loading = state.locationGateLoading;

  return `
    <div class="location-dialog-backdrop" id="location-gate-dismiss" role="presentation">
      <div
        class="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-dialog-title"
        aria-describedby="location-dialog-desc"
        aria-busy="${loading ? 'true' : 'false'}"
      >
        <h2 id="location-dialog-title" class="location-dialog-title">Enable location</h2>
        <p id="location-dialog-desc" class="location-dialog-body">
          Used to place you on the map and start indoor routes.
        </p>
        <button
          type="button"
          id="location-enable-btn"
          class="location-dialog-primary ${loading ? 'is-loading' : ''}"
          ${loading ? 'disabled' : ''}
        >
          ${
            loading
              ? renderBusyLabel('Getting location…')
              : 'Enable Location'
          }
        </button>
        <button type="button" id="location-dismiss-btn" class="location-dialog-secondary">Not now</button>
      </div>
    </div>
  `;
}

export function renderLocationPermissionRequiredScreen(
  state: Pick<
    AppState,
    'locationGateLoading' | 'locationPermanentlyDenied'
  >,
): string {
  const loading = state.locationGateLoading;
  const permanent = state.locationPermanentlyDenied;
  const help = permanent
    ? 'Your browser has blocked location for this site. The app cannot show the permission prompt again until you change the site setting.'
    : 'Allow location to use live positioning, or continue without it.';

  return `
    <div class="location-dialog-backdrop" id="location-gate-dismiss" role="presentation">
      <div
        class="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-required-title"
        aria-describedby="location-required-desc"
        aria-busy="${loading ? 'true' : 'false'}"
      >
        <h2 id="location-required-title" class="location-dialog-title">Location is off</h2>
        <p id="location-required-desc" class="location-dialog-body">${help}</p>
        ${permanent ? `
          <ol class="location-dialog-help">
            <li>Open this site’s browser or page settings.</li>
            <li>Find <strong>Location</strong> or <strong>Permissions</strong>, then set location to <strong>Ask</strong> or <strong>Allow</strong>.</li>
            <li>Return here and tap <strong>Check Again</strong>.</li>
          </ol>
        ` : ''}
        ${!permanent ? `<button
          type="button"
          id="location-try-again-btn"
          class="location-dialog-primary ${loading ? 'is-loading' : ''}"
          ${loading ? 'disabled' : ''}
        >
          ${loading ? renderBusyLabel('Checking…') : 'Try Again'}
        </button>` : ''}
        ${permanent ? '' : renderLocationDiagnostics()}
        <button type="button" id="location-dismiss-btn" class="location-dialog-secondary">Not now</button>
      </div>
    </div>
  `;
}

export function renderLocationErrorScreen(
  state: Pick<AppState, 'locationGateLoading' | 'locationGateError'>,
): string {
  const loading = state.locationGateLoading;
  const message =
    state.locationGateError?.trim() ||
    'We could not determine your current location.';

  return `
    <div class="location-dialog-backdrop" id="location-gate-dismiss" role="presentation">
      <div
        class="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-error-title"
        aria-describedby="location-error-desc"
        aria-busy="${loading ? 'true' : 'false'}"
      >
        <h2 id="location-error-title" class="location-dialog-title">Location Error</h2>
        <p id="location-error-desc" class="location-dialog-body">${escapeHtml(message)}</p>
        <button
          type="button"
          id="location-retry-btn"
          class="location-dialog-primary ${loading ? 'is-loading' : ''}"
          ${loading ? 'disabled' : ''}
        >
          ${
            loading
              ? renderBusyLabel('Retrying…')
              : 'Retry'
          }
        </button>
        ${renderLocationDiagnostics()}
        <button type="button" id="location-dismiss-btn" class="location-dialog-secondary">Not now</button>
      </div>
    </div>
  `;
}

function renderLocationDiagnostics(): string {
  return `<details class="location-diagnostics">
    <summary>Location debug details</summary>
    <p>Expand after a failed retry to inspect permission, timeout, and browser details.</p>
    <textarea readonly aria-label="Location diagnostic report" spellcheck="false">${escapeHtml(getLocationDiagnosticReport())}</textarea>
    <button type="button" id="location-copy-debug-btn" class="location-dialog-secondary">Copy debug report</button>
  </details>`;
}
