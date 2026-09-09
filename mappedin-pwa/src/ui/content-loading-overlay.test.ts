import { describe, expect, it } from 'vitest';

import { renderContentLoadingOverlay } from './content-loading-overlay';

describe('renderContentLoadingOverlay', () => {
  it('renders a circular spinner with an accessible status label', () => {
    const html = renderContentLoadingOverlay('Loading posts');
    expect(html).toContain('screen-loading-overlay');
    expect(html).toContain('screen-loading-spinner');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading posts"');
  });
});
