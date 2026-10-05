import { describe, expect, it } from 'vitest';

import {
  normalizePseudoName,
  resolveDisplayName,
  resolveOnboardingStep,
  userNeedsPseudoName,
} from './entities';

describe('auth user pseudo-name helpers', () => {
  it('treats email-like pseudo-names as missing', () => {
    expect(normalizePseudoName('Azeezat@fplaces')).toBeNull();
    expect(resolveDisplayName({ pseudo_name: 'Azeezat@fplaces' })).toBe(
      'Guest',
    );
    expect(userNeedsPseudoName({ pseudo_name: 'Azeezat@fplaces' })).toBe(true);
    expect(
      resolveOnboardingStep(
        { pseudo_name: 'Azeezat@fplaces' },
        { venueId: '1', sectionId: '2' },
      ),
    ).toBe('pseudo-name');
  });

  it('keeps normal pseudo-names', () => {
    expect(normalizePseudoName('  RowdyGull_47  ')).toBe('RowdyGull_47');
    expect(resolveDisplayName({ pseudo_name: 'RowdyGull_47' })).toBe(
      'RowdyGull_47',
    );
  });
});
