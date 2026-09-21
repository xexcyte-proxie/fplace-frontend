import { describe, expect, it } from 'vitest';

import {
  buildLocationWsUrl,
  parseLocationLiveMessage,
} from './forum-location-ws-datasource';

const messagePayload = {
  id: 21,
  venue: 3,
  location_id: 'section_abc123',
  location_name: 'North Stand',
  user: { id: 4, display_name: 'Jordan' },
  content: 'See you at the gate',
  created_at: '2026-09-02T10:00:00.000Z',
};

describe('parseLocationLiveMessage', () => {
  it('parses nested new_location_message', () => {
    expect(
      parseLocationLiveMessage({
        type: 'new_location_message',
        message: messagePayload,
      }),
    ).toMatchObject({
      type: 'new_location_message',
      message: { id: 21, location_id: 'section_abc123' },
    });
  });

  it('ignores unknown or malformed frames', () => {
    expect(parseLocationLiveMessage(null)).toBeNull();
    expect(parseLocationLiveMessage({ type: 'new_post' })).toBeNull();
    expect(
      parseLocationLiveMessage({
        type: 'new_location_message',
        message: { id: 1 },
      }),
    ).toBeNull();
  });
});

describe('buildLocationWsUrl', () => {
  it('puts the access token on the venue location room path', () => {
    const url = buildLocationWsUrl(3, 'section_abc123', 'secret.jwt');
    expect(url).toContain('/ws/venues/3/locations/section_abc123/');
    expect(url).toContain('token=secret.jwt');
  });

  it('encodes location ids that contain reserved characters', () => {
    const url = buildLocationWsUrl(3, 'loc/a b', 'secret.jwt');
    expect(url).toContain('/ws/venues/3/locations/loc%2Fa%20b/');
  });
});
