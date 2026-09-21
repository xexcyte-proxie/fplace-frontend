import { escapeHtml } from './escape-html';

const PAGE_LOADER_CLASSES = [
  'busy-indicator',
  'screen-loading-spinner',
  'mini-spinner',
  'splash-progress',
  'ar-boot-spinner',
  'map-boot-progress',
] as const;

/**
 * Counts circular and linear page loaders in markup. A screen should render
 * at most one. Does not count debug HUD bars or splash-progress-bar fills.
 */
export function countPageLoaders(html: string): number {
  return PAGE_LOADER_CLASSES.reduce((total, className) => {
    const pattern = new RegExp(`(?:^|[\\s"'])${className}(?:[\\s"']|$)`, 'g');
    return total + (html.match(pattern)?.length ?? 0);
  }, 0);
}

/** Inline circular spinner for buttons and compact controls. */
export function renderBusyIndicator(): string {
  return '<span class="busy-indicator" aria-hidden="true"></span>';
}

/** Spinner plus label for a control that is waiting on IO. */
export function renderBusyLabel(label: string): string {
  return `${renderBusyIndicator()}<span>${escapeHtml(label)}</span>`;
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
