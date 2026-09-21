import { describe, expect, it } from 'vitest';

import {
  coerceLocationMessage,
  coerceLocationMessageList,
} from './location-message-mapper';

const payload = {
  id: 21,
  venue: 3,
  location_id: 'section_abc123',
  location_name: 'North Stand',
  user: { id: 4, display_name: 'Jordan' },
  content: 'See you at the gate',
  created_at: '2026-09-02T10:00:00.000Z',
  updated_at: '2026-09-02T10:01:00.000Z',
};

describe('coerceLocationMessage', () => {
  it('reads snake_case and nested live payloads', () => {
    expect(coerceLocationMessage(payload)).toMatchObject({
      id: 21,
      venue: 3,
      location_id: 'section_abc123',
      location_name: 'North Stand',
      user: { id: 4, display_name: 'Jordan' },
      content: 'See you at the gate',
    });

    expect(
      coerceLocationMessage({
        type: 'new_location_message',
        message: { ...payload, user: { id: 4, displayName: 'Jordan' } },
      }),
    ).toMatchObject({ id: 21, user: { display_name: 'Jordan' } });
  });

  it('rejects incomplete rows', () => {
    expect(coerceLocationMessage({ id: 1, content: 'x' })).toBeNull();
    expect(coerceLocationMessage(null)).toBeNull();
  });
});

describe('coerceLocationMessageList', () => {
  it('maps paginated results and empty payloads', () => {
    expect(
      coerceLocationMessageList({
        count: 1,
        next: 'https://api.example.com/api/forum/conversations/?page=2',
        previous: null,
        results: [payload],
      }),
    ).toMatchObject({
      count: 1,
      next: 'https://api.example.com/api/forum/conversations/?page=2',
      results: [{ id: 21, location_id: 'section_abc123' }],
    });

    expect(coerceLocationMessageList(null)).toEqual({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  });
});
