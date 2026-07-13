import type { LocationActionPrompt } from '../types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderLocationActionSheet(
  prompt: LocationActionPrompt,
  hasStartPoint: boolean,
): string {
  const navigateLabel = hasStartPoint
    ? 'Navigate to here'
    : 'Navigate from here';

  return `
    <div class="location-action-backdrop" id="location-action-dismiss" aria-hidden="false">
      <div
        class="location-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-action-title"
      >
        <div class="location-action-handle" aria-hidden="true"></div>
        <h2 class="location-action-title" id="location-action-title">${escapeHtml(prompt.name)}</h2>
        <p class="location-action-subtitle">What would you like to do?</p>
        <div class="location-action-actions">
          <button type="button" id="location-action-conversation" class="location-action-btn location-action-btn--primary">
            Open conversation
          </button>
          <button type="button" id="location-action-navigate" class="location-action-btn">
            ${navigateLabel}
          </button>
        </div>
        <button type="button" id="location-action-cancel" class="location-action-cancel">Cancel</button>
      </div>
    </div>
  `;
}
