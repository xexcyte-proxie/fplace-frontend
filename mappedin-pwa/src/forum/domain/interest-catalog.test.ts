import { describe, expect, it } from 'vitest';

import { activeInterestLabels } from './interest-catalog';
import type { ForumInterest } from './entities';

function interest(
  partial: Partial<ForumInterest> & Pick<ForumInterest, 'id' | 'name'>,
): ForumInterest {
  return {
    slug: partial.slug ?? partial.name.toLowerCase().replace(/\s+/g, '-'),
    order: partial.order ?? 0,
    is_active: partial.is_active ?? true,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('activeInterestLabels', () => {
  it('keeps active names in order, skipping retired and duplicate labels', () => {
    expect(
      activeInterestLabels([
        interest({ id: 2, name: 'Live music', order: 2 }),
        interest({ id: 1, name: 'Home team', order: 1 }),
        interest({ id: 3, name: 'Merch', order: 3, is_active: false }),
        interest({ id: 4, name: 'Home team', order: 4 }),
      ]),
    ).toEqual(['Home team', 'Live music']);
  });
});
