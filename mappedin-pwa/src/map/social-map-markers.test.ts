import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapData, MapView } from '@mappedin/mappedin-js';
import { initialAppState, type VenueFeedPost } from '../types';
import { SocialMapMarkerService } from './social-map-markers';

vi.mock('../utils/logger', () => ({ appLog: vi.fn() }));
const post: VenueFeedPost = {
  id: '1', author: 'Alex', authorId: 2, initials: 'AL', avatarColor: '#000',
  location: 'North', locationId: 'north', timeAgo: '1h', feedType: 'fan-vibe',
  categoryId: '1', content: 'Original post', upvotes: 0, comments: 0,
  createdAt: '2026-01-01T10:00:00Z',
};
function harness() {
  const active = new Map<string, string>();
  const removed = vi.fn();
  const add = vi.fn((anchor: { id: string }, html: string) => {
    active.set(anchor.id, html);
    return { remove: () => { removed(anchor.id); } };
  });
  const spaces = [{ id: 'north', name: 'North' }, { id: 'south', name: 'South' }];
  const data = { getByType: (type: string) => type === 'space' ? spaces : [] };
  const service = new SocialMapMarkerService(
    { Markers: { add } } as unknown as MapView, data as unknown as MapData, vi.fn(),
  );
  const state = { ...initialAppState(), venueFeedPosts: [post] };
  service.syncState(state);
  service.install({} as HTMLElement);
  add.mockClear();
  return { service, state, add, active, removed };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('social map marker updates', () => {
  it('uses state received before deferred installation', () => {
    const { active } = harness();
    expect(active.get('north')).toContain('social-map-marker__metric">1');
  });
  it('refreshes edited previews without reinstalling unrelated markers', () => {
    const { service, state, add, active, removed } = harness();
    service.syncState({ ...state, socialLocation: 'north' });
    add.mockClear(); removed.mockClear();
    service.syncState({ ...state, socialLocation: 'north', venueFeedPosts: [{ ...post, content: 'Edited post' }] });
    expect(active.get('north')).toContain('Edited post');
    expect(add).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledExactlyOnceWith('north');
  });
  it('updates engagement and location changes with unchanged IDs and upvotes', () => {
    const { service, state, active } = harness();
    service.syncState({ ...state, venueFeedPosts: [{ ...post, comments: 40 }] });
    expect(active.get('north')).toContain('social-map-marker--trending');
    service.syncState({ ...state, venueFeedPosts: [{ ...post, locationId: 'south' }] });
    expect(active.get('north')).toContain('social-map-marker__metric">0');
    expect(active.get('south')).toContain('social-map-marker__metric">1');
  });
  it('does not reinstall markers for equivalent feed arrays or GPS updates', () => {
    const { service, state, add } = harness();
    service.syncState({ ...state, venueFeedPosts: [{ ...post }] });
    service.syncState({ ...state, routeTraveledMeters: 20 });
    expect(add).not.toHaveBeenCalled();
  });
  it('marks disconnected heat stale until a new heat snapshot arrives', () => {
    const { service, state, active } = harness();
    const heat = { ...state, venueLiveStatus: 'connected' as const, sectionHeatmapActive: true,
      forumSections: [{ id: 4, name: 'North', mappedinLocationId: 'north' }],
      sectionHeatmap: [{ sectionId: 4, postCount: 9, priority: 'high' as const }] };
    service.syncState(heat);
    expect(active.get('north')).toContain('social-map-marker--heat-high');
    service.syncState({ ...heat, venueLiveStatus: 'reconnecting' });
    expect(active.get('north')).toContain('out of date');
    expect(active.get('north')).toContain('social-map-marker__metric">9');
    service.syncState(heat);
    expect(active.get('north')).toContain('out of date');
    service.syncState({ ...heat, sectionHeatmap: [...heat.sectionHeatmap] });
    expect(active.get('north')).toContain('social-map-marker--heat-high');
  });
  it('expires heat without store updates and clears its timer on destroy', () => {
    const { service, state, active, add } = harness();
    service.syncState({ ...state, venueLiveStatus: 'connected', sectionHeatmapActive: true,
      sectionHeatmap: [{ sectionId: 4, postCount: 9, priority: 'high' }] });
    vi.advanceTimersByTime(5 * 60_000);
    expect(active.get('north')).toContain('out of date');
    service.destroy();
    add.mockClear();
    vi.advanceTimersByTime(10 * 60_000);
    expect(add).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
