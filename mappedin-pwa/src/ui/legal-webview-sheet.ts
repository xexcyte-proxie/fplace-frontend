import { TERMS_OF_USE, TERMS_OF_USE_URL } from './settings-data';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Bottom-sheet in-app WebView for Terms — stays in the PWA (no external browser). */
export function renderTermsWebViewSheet(): string {
  const title = TERMS_OF_USE.title;
  const url = TERMS_OF_USE_URL;

  return `
    <div class="legal-webview-backdrop" id="legal-webview-dismiss" aria-hidden="false">
      <div
        class="legal-webview-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-webview-title"
      >
        <div class="legal-webview-handle" aria-hidden="true"></div>
        <header class="legal-webview-header">
          <h2 class="legal-webview-title" id="legal-webview-title">${escapeHtml(title)}</h2>
        </header>
        <div class="legal-webview-frame-wrap">
          <iframe
            class="legal-webview-frame"
            title="${escapeHtml(title)}"
            src="${escapeHtml(url)}"
            referrerpolicy="no-referrer"
          ></iframe>
        </div>
        <button type="button" id="legal-webview-cancel" class="legal-webview-cancel">
          Cancel
        </button>
      </div>
    </div>
  `;
}
