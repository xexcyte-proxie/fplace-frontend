import { describe, expect, it } from 'vitest';

import { initialsFromName } from './display-initials';

describe('initialsFromName', () => {
  it('uses camel-case letters from a pseudo-name', () => {
    expect(initialsFromName('RowdyGull_47')).toBe('RG');
  });

  it('uses the first two letters of a single token', () => {
    expect(initialsFromName('Guest')).toBe('GU');
  });

  it('falls back to G when the name is empty', () => {
    expect(initialsFromName('   ')).toBe('G');
  });
});
