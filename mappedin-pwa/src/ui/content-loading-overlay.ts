function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Circular spinner overlay for screens that have already painted chrome
 * while the primary list/detail payload is still empty.
 */
export function renderContentLoadingOverlay(label = 'Loading'): string {
  return `
    <div
      class="screen-loading-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="${escapeHtml(label)}"
    >
      <span class="screen-loading-spinner" aria-hidden="true"></span>
    </div>
  `;
}
