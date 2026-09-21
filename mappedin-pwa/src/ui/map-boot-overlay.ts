import { renderBusyIndicator } from './content-loading-overlay';
import { escapeHtml } from './escape-html';
import { resolveMapBootErrorMessage } from '../map/domain/map-boot-error';

/** Full-screen in-map boot state: one circular spinner, no linear bar. */
export function renderMapBootOverlay(options: {
  mapStatus: 'initial' | 'loading' | 'ready' | 'error';
  loadingMessage: string;
}): string {
  const isError = options.mapStatus === 'error';
  const message = isError
    ? resolveMapBootErrorMessage(options.loadingMessage)
    : 'Loading map…';
  return `
      <div class="map-boot-overlay ${isError ? 'map-boot-overlay--error' : ''}" role="status" aria-busy="${isError ? 'false' : 'true'}" aria-label="${escapeHtml(message)}">
        ${isError ? '' : renderBusyIndicator()}
        <p class="map-boot-message">${escapeHtml(message)}</p>
      </div>
    `;
}
