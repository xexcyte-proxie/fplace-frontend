import { describe, expect, it } from 'vitest';

import {
  normalizePseudoName,
  resolveDisplayName,
  resolveOnboardingStep,
  userNeedsPseudoName,
} from './entities';

describe('auth user pseudo-name helpers', () => {
  it('treats the account email as a missing pseudo-name', () => {
    expect(normalizePseudoName('azeezat@example.com')).toBe(
      'azeezat@example.com',
    );
    expect(
      resolveDisplayName({
        email: 'azeezat@example.com',
        pseudo_name: 'azeezat@example.com',
      }),
    ).toBe('Guest');
    expect(
      userNeedsPseudoName({
        email: 'azeezat@example.com',
        pseudo_name: 'azeezat@example.com',
      }),
    ).toBe(true);
    expect(
      resolveOnboardingStep(
        {
          email: 'azeezat@example.com',
          pseudo_name: 'azeezat@example.com',
        },
        { venueId: '1', sectionId: '2' },
      ),
    ).toBe('pseudo-name');
  });

  it('keeps handle-style pseudo-names that include @', () => {
    expect(normalizePseudoName('Azeezat@fplaces')).toBe('Azeezat@fplaces');
    expect(
      resolveDisplayName({
        email: 'azeezat@example.com',
        pseudo_name: 'Azeezat@fplaces',
      }),
    ).toBe('Azeezat@fplaces');
    expect(
      userNeedsPseudoName({
        email: 'azeezat@example.com',
        pseudo_name: 'Azeezat@fplaces',
      }),
    ).toBe(false);
    expect(
      resolveOnboardingStep(
        {
          email: 'azeezat@example.com',
          pseudo_name: 'Azeezat@fplaces',
        },
        { venueId: '1', sectionId: '2' },
      ),
    ).toBe('home');
  });

  it('keeps normal pseudo-names', () => {
    expect(normalizePseudoName('  RowdyGull_47  ')).toBe('RowdyGull_47');
    expect(resolveDisplayName({ pseudo_name: 'RowdyGull_47' })).toBe(
      'RowdyGull_47',
    );
  });
});
