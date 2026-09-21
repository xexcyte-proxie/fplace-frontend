import { describe, expect, it } from 'vitest';

import {
  applyLocationLiveEvent,
  mergeLiveLocationMessage,
  mergeLocationMessageLists,
  sortLocationMessagesNewestFirst,
} from './apply-location-live-event';
import type { LocationMessage } from './entities';

function message(overrides: Partial<LocationMessage> = {}): LocationMessage {
  return {
    id: 10,
    venue: 3,
    location_id: 'loc-north',
    location_name: 'North Stand',
    user: { id: 2, display_name: 'Alex' },
    content: "Let's go",
    created_at: '2026-09-02T10:00:00.000Z',
    updated_at: '2026-09-02T10:00:00.000Z',
    ...overrides,
  };
}

describe('sortLocationMessagesNewestFirst', () => {
  it('orders by created_at then id, newest first', () => {
    const sorted = sortLocationMessagesNewestFirst([
      message({ id: 1, created_at: '2026-09-02T10:00:00.000Z' }),
      message({ id: 2, created_at: '2026-09-02T11:00:00.000Z' }),
      message({ id: 3, created_at: '2026-09-02T11:00:00.000Z' }),
    ]);
    expect(sorted.map((row) => row.id)).toEqual([3, 2, 1]);
  });
});

describe('mergeLocationMessageLists', () => {
  it('dedupes by id and keeps newest first across locations', () => {
    const merged = mergeLocationMessageLists([
      [message({ id: 1, location_id: 'loc-north', created_at: '2026-09-02T10:00:00.000Z' })],
      [
        message({ id: 1, location_id: 'loc-north', created_at: '2026-09-02T10:00:00.000Z' }),
        message({
          id: 4,
          location_id: 'loc-church',
          created_at: '2026-09-02T12:00:00.000Z',
        }),
      ],
    ]);
    expect(merged.map((row) => row.id)).toEqual([4, 1]);
  });
});

describe('mergeLiveLocationMessage', () => {
  it('prepends a new message and replaces an existing id', () => {
    const existing = [message()];
    expect(
      mergeLiveLocationMessage(existing, message({ id: 11, content: 'New' })).map(
        (row) => row.id,
      ),
    ).toEqual([11, 10]);

    expect(
      mergeLiveLocationMessage(existing, message({ content: 'Edited' }))[0]
        .content,
    ).toBe('Edited');
  });
});

describe('applyLocationLiveEvent', () => {
  it('ignores messages for a different location', () => {
    const current = [message()];
    const next = applyLocationLiveEvent(
      current,
      {
        type: 'new_location_message',
        message: message({
          id: 12,
          location_id: 'loc-other',
          content: 'Other',
        }),
      },
      'loc-north',
    );
    expect(next.map((row) => row.id)).toEqual([10]);
  });

  it('merges a matching new_location_message', () => {
    const next = applyLocationLiveEvent(
      [message()],
      {
        type: 'new_location_message',
        message: message({ id: 12, content: 'Live' }),
      },
      'loc-north',
    );
    expect(next.map((row) => row.content)).toEqual(['Live', "Let's go"]);
  });
});
