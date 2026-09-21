import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INTEREST_OPTIONS,
  interestOptionsAfterFetch,
  interestOptionsForPicker,
  parseInterestOptionsPayload,
} from './interest-options';

describe('parseInterestOptionsPayload', () => {
  it('reads a DRF paginated list of named objects', () => {
    expect(
      parseInterestOptionsPayload({
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: 1, name: 'Home team', slug: 'home-team' },
          { id: 2, name: 'Live music' },
        ],
      }),
    ).toEqual(['Home team', 'Live music']);
  });

  it('reads { interests: string[] }', () => {
    expect(
      parseInterestOptionsPayload({
        interests: ['Merch', 'Photography'],
      }),
    ).toEqual(['Merch', 'Photography']);
  });

  it('reads a raw string array', () => {
    expect(parseInterestOptionsPayload(['Food and drink'])).toEqual([
      'Food and drink',
    ]);
  });

  it('ignores empty payloads', () => {
    expect(parseInterestOptionsPayload({})).toEqual([]);
    expect(parseInterestOptionsPayload(null)).toEqual([]);
  });
});

describe('interestOptionsAfterFetch', () => {
  it('keeps a non-empty backend catalog', () => {
    expect(interestOptionsAfterFetch(['Live music', 'Merch'])).toEqual([
      'Live music',
      'Merch',
    ]);
  });

  it('uses the static fallback when the catalog is empty or missing', () => {
    expect(interestOptionsAfterFetch([])).toEqual([
      ...DEFAULT_INTEREST_OPTIONS,
    ]);
    expect(interestOptionsAfterFetch(null)).toEqual([
      ...DEFAULT_INTEREST_OPTIONS,
    ]);
    expect(interestOptionsAfterFetch(undefined)).toEqual([
      ...DEFAULT_INTEREST_OPTIONS,
    ]);
  });
});

describe('interestOptionsForPicker', () => {
  it('appends selected labels missing from the catalog', () => {
    expect(
      interestOptionsForPicker(['Home team'], ['Home team', 'Legacy tag']),
    ).toEqual(['Home team', 'Legacy tag']);
  });
});
