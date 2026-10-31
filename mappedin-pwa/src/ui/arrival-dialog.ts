import { escapeHtml } from './escape-html';

export function arrivalDialogCopy(destinationName?: string | null): {
  title: string;
  body: string;
  destination: string;
} {
  const name = destinationName?.trim();
  const usableName = name && name !== 'End point' && name !== 'Destination' ? name : null;
  return {
    title: "You've arrived",
    body: "You've reached your destination.",
    destination: usableName || 'Your destination',
  };
}

/** Presentation only; existing Done/backdrop actions still end navigation. */
export function renderArrivalDialog(destinationName?: string | null): string {
  const copy = arrivalDialogCopy(destinationName);
  return `
    <div class="arrival-dialog-backdrop" id="arrival-dialog-dismiss" role="presentation">
      <div class="arrival-dialog" role="dialog" aria-modal="true"
        aria-labelledby="arrival-dialog-title" aria-describedby="arrival-dialog-desc arrival-dialog-destination">
        <div class="arrival-dialog-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none"><path d="m14 32 13 13 23-26" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p class="arrival-dialog-eyebrow">Journey complete</p>
        <h2 id="arrival-dialog-title" class="arrival-dialog-title">${escapeHtml(copy.title)}</h2>
        <p id="arrival-dialog-desc" class="arrival-dialog-body">${escapeHtml(copy.body)}</p>
        <p id="arrival-dialog-destination" class="arrival-dialog-destination">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.2" stroke="currentColor" stroke-width="1.7"/></svg>
          <span>${escapeHtml(copy.destination)}</span>
        </p>
        <button type="button" id="arrival-dialog-done-btn" class="arrival-dialog-ok">Done</button>
      </div>
    </div>
  `;
}
