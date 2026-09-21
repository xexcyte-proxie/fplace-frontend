import { describe, expect, it } from 'vitest';

import {
  countPageLoaders,
  renderBusyLabel,
  renderContentLoadingOverlay,
} from './content-loading-overlay';

describe('renderContentLoadingOverlay', () => {
  it('renders a circular spinner with an accessible status label', () => {
    const html = renderContentLoadingOverlay('Loading posts');
    expect(html).toContain('screen-loading-overlay');
    expect(html).toContain('screen-loading-spinner');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading posts"');
  });

  it('renders an inline circular spinner next to a busy label', () => {
    const html = renderBusyLabel('Logging in…');
    expect(html).toContain('busy-indicator');
    expect(html).toContain('Logging in…');
    expect(countPageLoaders(html)).toBe(1);
  });

  it('counts one overlay spinner and does not treat the splash fill as a second loader', () => {
    expect(countPageLoaders(renderContentLoadingOverlay('Loading'))).toBe(1);
    expect(
      countPageLoaders(
        '<div class="splash-progress"><div class="splash-progress-bar"></div></div>',
      ),
    ).toBe(1);
    expect(
      countPageLoaders(
        `${renderContentLoadingOverlay('Loading')}${renderBusyLabel('Saving…')}`,
      ),
    ).toBe(2);
  });

  it('uses Loading as the default overlay label', () => {
    const html = renderContentLoadingOverlay();
    expect(html).toContain('aria-label="Loading"');
  });

  it('escapes overlay and busy labels that look like HTML', () => {
    expect(renderContentLoadingOverlay('<b>hi</b>')).toContain(
      'aria-label="&lt;b&gt;hi&lt;/b&gt;"',
    );
    expect(renderContentLoadingOverlay('<b>hi</b>')).not.toContain('<b>hi</b>');
    expect(renderBusyLabel('<b>hi</b>')).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(renderBusyLabel('<b>hi</b>')).not.toContain('<b>hi</b>');
  });
});
