import { describe, expect, it } from 'vitest';

import { renderPseudoNameScreen } from './pseudo-name-screen';

describe('pseudo name screen interests', () => {
  it('renders chips from the loaded catalog, not a hardcoded list', () => {
    const html = renderPseudoNameScreen({
      pseudoNameDraft: '',
      pseudoNameHint: 'Fan_01',
      selectedInterests: ['Live music'],
      interestOptions: ['Live music', 'Merch'],
      authLoading: false,
      authFieldErrors: {},
    });

    expect(html).toContain('Live music');
    expect(html).toContain('Merch');
    expect(html).not.toContain('Photography');
  });
});
