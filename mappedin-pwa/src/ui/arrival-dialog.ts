function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function arrivalDialogCopy(destinationName?: string | null): {
  title: string;
  body: string;
} {
  const name = destinationName?.trim();
  return {
    title: "You've arrived",
    body: name
      ? `You've gotten there: ${name}.`
      : "You've gotten there.",
  };
}

/**
 * 2D map arrival dialog - shown when navigation reaches the destination.
 */
export function renderArrivalDialog(destinationName?: string | null): string {
  const copy = arrivalDialogCopy(destinationName);
  return `
    <div class="location-dialog-backdrop" id="arrival-dialog-dismiss" role="presentation">
      <div
        class="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="arrival-dialog-title"
        aria-describedby="arrival-dialog-desc"
      >
        <h2 id="arrival-dialog-title" class="location-dialog-title">${escapeHtml(copy.title)}</h2>
        <p id="arrival-dialog-desc" class="location-dialog-body">${escapeHtml(copy.body)}</p>
        <button
          type="button"
          id="arrival-dialog-done-btn"
          class="location-dialog-primary"
        >
          Done
        </button>
      </div>
    </div>
  `;
}
