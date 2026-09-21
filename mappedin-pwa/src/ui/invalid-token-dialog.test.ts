import { describe, expect, it } from 'vitest';

import { invalidTokenCreateAccountCopy } from '../auth/domain/invalid-access-token';
import { renderInvalidTokenDialog } from './invalid-token-dialog';

describe('invalid token dialog', () => {
  it('renders the create-account prompt with a dismiss hook', () => {
    const copy = invalidTokenCreateAccountCopy();
    const html = renderInvalidTokenDialog();
    expect(html).toContain('role="dialog"');
    expect(html).toContain(copy.title);
    expect(html).toContain(copy.body);
    expect(html).toContain('id="invalid-token-dialog-dismiss-btn"');
    expect(html).toContain('id="invalid-token-dialog-title"');
    expect(html).toContain('id="invalid-token-dialog-desc"');
    expect(html).toContain('Got it');
  });
});
