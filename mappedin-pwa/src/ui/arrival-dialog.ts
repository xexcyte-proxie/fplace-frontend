import { escapeHtml } from './escape-html';

export function arrivalDialogCopy(destinationName?: string | null): {
  title: string;
  body: string;
} {
  const name = destinationName?.trim();
  const usableName =
    name && name !== 'End point' && name !== 'Destination' ? name : null;
  return {
    title: "You've arrived",
    body: usableName
      ? `You've gotten there: ${usableName}.`
      : "You've gotten there.",
  };
}

/**
 * 2D map arrival dialog - shown when navigation reaches the destination.
 * Stays locked on screen until the user taps Okay (or the backdrop).
 */
export function renderArrivalDialog(destinationName?: string | null): string {
  const copy = arrivalDialogCopy(destinationName);
  return `
    <div class="arrival-dialog-backdrop" id="arrival-dialog-dismiss" role="presentation">
      <div
        class="arrival-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="arrival-dialog-title"
        aria-describedby="arrival-dialog-desc"
      >
        <div class="arrival-dialog-icon" aria-hidden="true">✓</div>
        <h2 id="arrival-dialog-title" class="arrival-dialog-title">${escapeHtml(copy.title)}</h2>
        <p id="arrival-dialog-desc" class="arrival-dialog-body">${escapeHtml(copy.body)}</p>
        <button
          type="button"
          id="arrival-dialog-done-btn"
          class="arrival-dialog-ok"
        >
          Okay
        </button>
      </div>
    </div>
  `;
}
