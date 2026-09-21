import { describe, expect, it } from 'vitest';

import { renderMapBootOverlay } from './map-boot-overlay';

describe('renderMapBootOverlay', () => {
  it('shows a single circular spinner while the map loads', () => {
    const html = renderMapBootOverlay({
      mapStatus: 'loading',
      loadingMessage: 'Getting map credentials…',
    });
    expect(html).toContain('busy-indicator');
    expect(html).toContain('Loading map…');
    expect(html).not.toContain('map-boot-progress');
    expect(html).not.toContain('progressbar');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading map…"');
    expect(html).not.toContain('Getting map credentials…');
  });

  it('hides the spinner when the map failed', () => {
    const html = renderMapBootOverlay({
      mapStatus: 'error',
      loadingMessage: 'Check your network connection.',
    });
    expect(html).toContain('Check your network connection.');
    expect(html).toContain('map-boot-overlay--error');
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain('busy-indicator');
    expect(html).not.toContain('map-boot-progress');
  });

  it('falls back to a default error message when none is provided', () => {
    const html = renderMapBootOverlay({
      mapStatus: 'error',
      loadingMessage: '',
    });
    expect(html).toContain('Map failed to load. Please try again.');
  });

  it('never paints a bare HTTP status on the orange boot screen', () => {
    const html = renderMapBootOverlay({
      mapStatus: 'error',
      loadingMessage: '401',
    });
    expect(html).toContain('Map failed to load. Please try again.');
    expect(html).not.toContain('>401<');
  });

  it('escapes error copy that looks like HTML', () => {
    const html = renderMapBootOverlay({
      mapStatus: 'error',
      loadingMessage: '<b>hi</b>',
    });
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).not.toContain('<b>hi</b>');
  });
});
