import { describe, expect, it } from 'vitest';

import { renderGuestArGateDialog } from './guest-ar-gate-dialog';

describe('renderGuestArGateDialog', () => {
  it('keeps title and continue/cancel hooks on the one-time trial', () => {
    const html = renderGuestArGateDialog('one-time-info');
    expect(html).toContain('id="guest-ar-gate-title"');
    expect(html).toContain('id="guest-ar-gate-desc"');
    expect(html).toContain('id="guest-ar-gate-continue-btn"');
    expect(html).toContain('id="guest-ar-gate-cancel-btn"');
    expect(html).toContain('Not now');
    expect(html).toContain('Continue to AR');
  });

  it('hides continue and cancel when the trial is already used', () => {
    const html = renderGuestArGateDialog('already-used');
    expect(html).toContain('id="guest-ar-gate-dismiss-btn"');
    expect(html).toContain('Got it');
    expect(html).not.toContain('id="guest-ar-gate-continue-btn"');
    expect(html).not.toContain('id="guest-ar-gate-cancel-btn"');
  });

  it('disables both trial actions while opening AR', () => {
    const html = renderGuestArGateDialog('one-time-info', { loading: true });
    expect(html).toMatch(/id="guest-ar-gate-continue-btn"[\s\S]*?disabled/);
    expect(html).toMatch(/id="guest-ar-gate-cancel-btn"[\s\S]*?disabled/);
    expect(html).toContain('aria-busy="true"');
  });
});
