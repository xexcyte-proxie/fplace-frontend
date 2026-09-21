import {
  guestArAlreadyUsedMessage,
  guestArOneTimeTrialMessage,
} from '../guest/domain/entities';
import { renderBusyLabel } from './content-loading-overlay';
import { escapeHtml } from './escape-html';

export type GuestArGatePrompt = 'one-time-info' | 'already-used';

/**
 * Guest AR eligibility dialogs - one-time trial notice or already-used block.
 */
export function renderGuestArGateDialog(
  prompt: GuestArGatePrompt,
  options?: { loading?: boolean },
): string {
  const loading = Boolean(options?.loading);
  const isBlocked = prompt === 'already-used';
  const title = isBlocked ? 'AR trial used' : 'One-time AR trial';
  const body = isBlocked
    ? guestArAlreadyUsedMessage()
    : guestArOneTimeTrialMessage();
  const primaryId = isBlocked
    ? 'guest-ar-gate-dismiss-btn'
    : 'guest-ar-gate-continue-btn';
  const primaryLabel = isBlocked
    ? 'Got it'
    : loading
      ? renderBusyLabel('Opening…')
      : 'Continue to AR';

  return `
    <div class="location-dialog-backdrop guest-ar-gate" role="presentation">
      <div
        class="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-ar-gate-title"
        aria-describedby="guest-ar-gate-desc"
        aria-busy="${loading ? 'true' : 'false'}"
      >
        <h2 id="guest-ar-gate-title" class="location-dialog-title">${escapeHtml(title)}</h2>
        <p id="guest-ar-gate-desc" class="location-dialog-body">${escapeHtml(body)}</p>
        <button
          type="button"
          id="${primaryId}"
          class="location-dialog-primary${loading && !isBlocked ? ' is-loading' : ''}"
          ${loading ? 'disabled' : ''}
          aria-busy="${loading ? 'true' : 'false'}"
        >
          ${primaryLabel}
        </button>
        ${
          isBlocked
            ? ''
            : `<button
          type="button"
          id="guest-ar-gate-cancel-btn"
          class="first-visit-ar-prompt-dismiss"
          ${loading ? 'disabled' : ''}
        >
          Not now
        </button>`
        }
      </div>
    </div>
  `;
}
