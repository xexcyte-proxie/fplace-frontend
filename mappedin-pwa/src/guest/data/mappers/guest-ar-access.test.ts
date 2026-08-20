import { describe, expect, it } from 'vitest';

import {
  guestCanUseArTrial,
  guestArAlreadyUsedMessage,
  guestArOneTimeTrialMessage,
} from '../../domain/entities';
import { mapGuestSessionPreferences } from './guest-session-mapper';
import { renderGuestArGateDialog } from '../../../ui/guest-ar-gate-dialog';

describe('guest AR eligibility', () => {
  it('allows AR only while has_tried_ar_view is false', () => {
    expect(guestCanUseArTrial({ hasTriedArView: false })).toBe(true);
    expect(guestCanUseArTrial({ hasTriedArView: true })).toBe(false);
  });

  it('maps GET/PATCH preference payloads', () => {
    expect(
      mapGuestSessionPreferences({
        has_tried_ar_view: true,
        has_tried_2d_view: false,
      }),
    ).toEqual({ hasTriedArView: true, hasTried2dView: false });
  });

  it('renders one-time trial dialog hooks', () => {
    const html = renderGuestArGateDialog('one-time-info');
    expect(html).toContain('One-time AR trial');
    expect(html).toContain(guestArOneTimeTrialMessage());
    expect(html).toContain('id="guest-ar-gate-continue-btn"');
    expect(html).toContain('id="guest-ar-gate-cancel-btn"');
  });

  it('renders already-used dialog hooks', () => {
    const html = renderGuestArGateDialog('already-used');
    expect(html).toContain('AR trial used');
    expect(html).toContain(guestArAlreadyUsedMessage());
    expect(html).toContain('id="guest-ar-gate-dismiss-btn"');
  });
});
