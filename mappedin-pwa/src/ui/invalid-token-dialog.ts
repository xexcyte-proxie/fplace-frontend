import { invalidTokenCreateAccountCopy } from '../auth/domain/invalid-access-token';
import { escapeHtml } from './escape-html';

/** One-shot dialog over Create account after SimpleJWT rejects the session. */
export function renderInvalidTokenDialog(): string {
  const copy = invalidTokenCreateAccountCopy();
  return `
    <div class="location-dialog-backdrop invalid-token-dialog" role="presentation">
      <div
        class="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invalid-token-dialog-title"
        aria-describedby="invalid-token-dialog-desc"
      >
        <h2 id="invalid-token-dialog-title" class="location-dialog-title">${escapeHtml(copy.title)}</h2>
        <p id="invalid-token-dialog-desc" class="location-dialog-body">${escapeHtml(copy.body)}</p>
        <button
          type="button"
          id="invalid-token-dialog-dismiss-btn"
          class="location-dialog-primary"
        >
          Got it
        </button>
      </div>
    </div>
  `;
}
