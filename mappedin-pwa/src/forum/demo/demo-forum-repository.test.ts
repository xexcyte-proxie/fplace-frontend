import { describe, expect, it, vi } from 'vitest';
import { createDemoForumRepository } from './demo-forum-repository';
import type { ForumRepository } from '../domain/repositories/forum-repository';
import type { ForumCategory } from '../domain/entities';

const categories = ['fan-vibe', 'food-and-drinks', 'crowds', 'help'].map((slug, index) => ({ id: index + 1, slug, name: slug, is_active: true } as ForumCategory));
function setup() {
  const calls: string[] = [];
  const catalog = new Proxy({
    listCategories: vi.fn(async () => ({ results: categories, next: null })),
    listSections: vi.fn(async (venue: number) => ({ results: [{ id: venue * 10, venue }], next: null })),
  } as unknown as ForumRepository, {
    get(target, property) {
      if (property in target) return Reflect.get(target, property);
      return () => { calls.push(String(property)); throw new Error('Unexpected real social access'); };
    },
  });
  return { repo: createDemoForumRepository(catalog), calls, catalog };
}

describe('isolated social demo', () => {
  it('seeds every category for each venue with comments, respecting post limits', async () => {
    const { repo, calls } = setup();
    for (const venue of [1, 2]) {
      const feed = await repo.listPosts({ venue });
      expect(feed.count).toBe(16);
      expect(new Set(feed.results.map(post => post.category)).size).toBe(4);
      for (const post of feed.results) {
        expect(post.venue).toBe(venue);
        expect(post.section).toBe(venue * 10);
        expect(post.content.length).toBeLessThanOrEqual(140);
        expect(post.user.display_name).not.toMatch(/demo/i);
        expect(post.user.display_name.length).toBeGreaterThan(2);
        expect(post.content).not.toMatch(/demo/i);
        expect((await repo.listComments({ post: post.id })).count).toBe(2);
      }
    }
    expect(calls).toEqual([]);
  });

  it('does not duplicate concurrent seeds or leak posts across venues/categories', async () => {
    const { repo, catalog } = setup();
    const [first, same] = await Promise.all([repo.listPosts({ venue: 3 }), repo.listPosts({ venue: 3 })]);
    expect(first.results.map(p => p.id)).toEqual(same.results.map(p => p.id));
    expect(catalog.listSections).toHaveBeenCalledOnce();
    const filtered = await repo.listPosts({ venue: 3, category: 4 });
    expect(filtered.count).toBe(4);
    expect(filtered.results.every(post => post.category === 4)).toBe(true);
    expect((await repo.listPosts({ venue: 4, section: 30 })).count).toBe(0);
  });

  it('keeps posting, upvotes, comments, edits, and flags off the real backend', async () => {
    const { repo, calls } = setup();
    const post = await repo.createPost({ venue: 1, category: 1, content: 'A local demo post' });
    expect((await repo.toggleUpvote(post.id)).has_upvoted).toBe(true);
    expect((await repo.toggleUpvote(post.id)).upvotes_count).toBe(0);
    expect((await repo.flagPost(post.id)).flags_count).toBe(1);
    expect((await repo.updatePost(post.id, { content: 'Edited locally' })).content).toBe('Edited locally');
    const comment = await repo.createComment({ post: post.id, content: 'A local reply' });
    expect((await repo.listComments({ post: post.id })).results[0].id).toBe(comment.id);
    await repo.deletePost(post.id);
    expect((await repo.listPosts({ venue: 1 })).results.some(item => item.id === post.id)).toBe(false);
    await repo.restorePost(post.id);
    expect((await repo.getPost(post.id)).status).toBe('visible');
    expect(calls).toEqual([]);
  });

  it('seeds map conversations separately by venue and location without real sockets', async () => {
    const { repo, calls } = setup();
    const a = await repo.listLocationMessages({ venue: 1, location_id: 'cafe' });
    const b = await repo.listLocationMessages({ venue: 2, location_id: 'cafe' });
    expect(a.count).toBe(3);
    expect(b.count).toBe(3);
    expect(a.results.every(item => item.venue === 1)).toBe(true);
    const message = await repo.createLocationMessage({ venue: 1, location_id: 'cafe', content: 'Local message' });
    await repo.updateLocationMessage(message.id, { content: 'Updated locally' });
    expect((await repo.listLocationMessages({ venue: 1, location_id: 'cafe' })).count).toBe(4);
    repo.subscribeVenueLive(1, vi.fn()).disconnect();
    repo.subscribeLocationLive(1, 'cafe', vi.fn()).disconnect();
    expect(calls).toEqual([]);
  });

  it('returns copies so the UI cannot mutate stored demo data', async () => {
    const { repo } = setup();
    const feed = await repo.listPosts({ venue: 1 });
    feed.results[0].content = 'Changed outside the repository';
    expect((await repo.getPost(feed.results[0].id)).content).not.toBe('Changed outside the repository');
  });
});
