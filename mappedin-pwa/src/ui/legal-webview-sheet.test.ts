import { describe, expect, it } from 'vitest';

import { TERMS_OF_USE, TERMS_OF_USE_URL } from './settings-data';
import { renderTermsWebViewSheet } from './legal-webview-sheet';

describe('renderTermsWebViewSheet', () => {
  it('keeps terms webview hooks used by ui-root-events', () => {
    const html = renderTermsWebViewSheet();
    expect(html).toContain('id="legal-webview-dismiss"');
    expect(html).toContain('id="legal-webview-title"');
    expect(html).toContain('id="legal-webview-cancel"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Cancel');
  });

  it('loads Terms of Use from the in-app legal page', () => {
    const html = renderTermsWebViewSheet();
    expect(html).toContain(TERMS_OF_USE.title);
    expect(html).toContain(`src="${TERMS_OF_USE_URL}"`);
    expect(html).toContain(`title="${TERMS_OF_USE.title}"`);
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
  });
});
