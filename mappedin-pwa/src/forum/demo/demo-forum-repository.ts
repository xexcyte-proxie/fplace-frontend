import type { ForumRepository } from '../domain/repositories/forum-repository';
import type { ForumPost, ForumComment, LocationMessage, PaginatedList, ForumCategory } from '../domain/entities';

// Eight international-style usernames and two African-inspired usernames.
const AUTHORS = [
  'jaymiles24',
  'lexiB',
  'kairos_7',
  'tobzino',
  'marcoflux',
  'ellavibes',
  'rylo99',
  'chizzyp',
  'sammyJ23',
  'itsmika',
];
const COPY = {
  food: [
    'Anyone else planning a snack stop before finding their seats? What would you go for?',
    'Pre-event ritual: something cold to drink, a quick bite, then a wander around the concourse.',
    'Sweet or savoury snacks for the event? Our group is completely split on this.',
    'Taking a food break before the next part of the event. Catch you back in the stands!',
  ],
  crowd: [
    'Our group is meeting up before we head to our seats. Giving ourselves a little extra time to settle in.',
    'First visit here! Taking a slow lap to get familiar with the venue before the event starts.',
    'Anyone else prefer arriving early so there is time to explore rather than rush?',
    'We have picked a meeting point for after the event. Future us will be grateful!',
  ],
  alerts: [
    'Quick reminder: agree on a meeting point with your group before the event starts.',
    'Quick reminder: keep your ticket handy and follow directions from venue staff.',
    'Quick tip: for real medical or security concerns, contact venue staff directly.',
    'Quick reminder: check the official venue information for entry and event updates.',
  ],
  vibe: [
    'Made it! Who else loves the build-up before an event starts?',
    'The best part of coming with friends is everyone having a different favourite moment afterwards.',
    'First time visiting this venue and already planning a group photo before we leave.',
    'What is your event-day ritual? Ours always includes a very enthusiastic group playlist.',
  ],
};
function messages(category: ForumCategory): readonly string[] {
  const topic = `${category.slug} ${category.name}`.toLowerCase();
  if (/help|alert|security|medical/.test(topic)) return COPY.alerts;
  if (/food|drink/.test(topic)) return COPY.food;
  if (/crowd|queue|line|transport|parking/.test(topic)) return COPY.crowd;
  return COPY.vibe;
}
function page<T>(results: T[]): PaginatedList<T> {
  return { count: results.length, next: null, previous: null, results: structuredClone(results) };
}

/** Only public catalog reads reach the real repository. All social activity is local. */
export function createDemoForumRepository<T extends ForumRepository>(catalog: T): T {
  let nextId = 900_000_000;
  const posts = new Map<number, ForumPost>();
  const comments = new Map<number, ForumComment>();
  const conversations = new Map<number, LocationMessage>();
  const seeded = new Map<number, Promise<void>>();
  const seededLocations = new Set<string>();
  const now = Date.now();
  const time = (minutes = 0) => new Date(now - minutes * 60_000).toISOString();
  const author = (index: number) => ({ id: 800_000_000 + index, display_name: AUTHORS[index % AUTHORS.length] });
  const viewer = { id: 800_000_099, display_name: 'You' };
  function find<T>(items: Map<number, T>, id: number): T {
    const item = items.get(id);
    if (!item) throw new Error('This item is no longer available.');
    return item;
  }
  async function seed(venueId: number): Promise<void> {
    const existing = seeded.get(venueId);
    if (existing) return existing;
    const pending = (async () => {
      const categories: ForumCategory[] = [];
      let categoryPage: number | undefined;
      do {
        const result = await catalog.listCategories(categoryPage);
        categories.push(...result.results.filter(category => category.is_active));
        categoryPage = result.next ? (categoryPage ?? 1) + 1 : undefined;
      } while (categoryPage);
      const sections = (await catalog.listSections(venueId)).results;
      let order = 0;
      for (const category of categories) {
        for (const content of messages(category)) {
          const index = order++;
          const id = nextId++;
          const stamp = time(2 + index * 7 + venueId % 5);
          posts.set(id, { id, user: author((index + venueId) % AUTHORS.length), venue: venueId,
            section: sections.length ? sections[index % sections.length].id : null,
            category: category.id, content, upvotes_count: 2 + (index * 7 + venueId) % 24,
            flags_count: 0, status: 'visible', has_upvoted: false, created_at: stamp, updated_at: stamp });
          for (const [replyIndex, reply] of ['Love having a little time to explore before we settle in.', 'Same here! Enjoy the event, everyone.'].entries()) {
            const commentId = nextId++;
            comments.set(commentId, { id: commentId, post: id, user: author((index + replyIndex + 1) % AUTHORS.length),
              content: /help|alert|security|medical/.test(category.slug) ? ['Good reminder to plan ahead with the group.', 'Thanks! Official venue staff are the right people for urgent concerns.'][replyIndex] : reply,
              created_at: time(1 + index * 7 + replyIndex), updated_at: time(1 + index * 7 + replyIndex) });
          }
        }
      }
    })();
    seeded.set(venueId, pending);
    try { await pending; } catch (error) { seeded.delete(venueId); throw error; }
  }
  const local: Partial<ForumRepository> = {
    async listPosts(params) {
      await seed(params.venue);
      return page([...posts.values()].filter(post => post.venue === params.venue
        && post.status === (params.status ?? 'visible')
        && (params.category == null || post.category === params.category)
        && (params.section == null || post.section === params.section))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
    async getPost(id) { return structuredClone(find(posts, id)); },
    async createPost(payload) {
      await seed(payload.venue);
      const id = nextId++;
      const post: ForumPost = { ...payload, id, section: payload.section ?? null, user: viewer,
        upvotes_count: 0, flags_count: 0, status: 'visible', has_upvoted: false, created_at: time(), updated_at: time() };
      posts.set(id, post); return structuredClone(post);
    },
    async updatePost(id, payload) { const post = find(posts, id); Object.assign(post, payload, { updated_at: time() }); return structuredClone(post); },
    async replacePost(id, payload) { return local.updatePost!(id, payload); },
    async deletePost(id) { find(posts, id).status = 'hidden'; },
    async restorePost(id) { find(posts, id).status = 'visible'; return structuredClone(find(posts, id)); },
    async toggleUpvote(id) {
      const post = find(posts, id); post.has_upvoted = !post.has_upvoted; post.upvotes_count += post.has_upvoted ? 1 : -1;
      return structuredClone(post);
    },
    async flagPost(id) { const post = find(posts, id); post.flags_count++; return structuredClone(post); },
    async listComments(params) { return page([...comments.values()].filter(comment => params?.post == null || comment.post === params.post)); },
    async getComment(id) { return structuredClone(find(comments, id)); },
    async createComment(payload) {
      find(posts, payload.post);
      const comment = { ...payload, id: nextId++, user: viewer, created_at: time(), updated_at: time() };
      comments.set(comment.id, comment); return structuredClone(comment);
    },
    async updateComment(id, payload) { const comment = find(comments, id); Object.assign(comment, payload, { updated_at: time() }); return structuredClone(comment); },
    async replaceComment(id, payload) { return local.updateComment!(id, payload); },
    async deleteComment(id) { comments.delete(id); },
    async restoreComment(id) { return structuredClone(find(comments, id)); },
    async listLocationMessages(params) {
      const key = `${params.venue}:${params.location_id}`;
      if (!seededLocations.has(key)) {
        seededLocations.add(key);
        for (const [index, content] of ['Using this spot as our group meeting point before we explore.', 'Good idea! We are taking a look around before finding our seats.', 'Enjoy the event, everyone!'].entries()) {
          const id = nextId++;
          conversations.set(id, { id, venue: params.venue, location_id: params.location_id, location_name: 'Meeting point',
            user: author(index), content, created_at: time(3 + index * 4), updated_at: time(3 + index * 4) });
        }
      }
      return page([...conversations.values()].filter(message => message.venue === params.venue && message.location_id === params.location_id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)));
    },
    async getLocationMessage(id) { return structuredClone(find(conversations, id)); },
    async createLocationMessage(payload) {
      const message = { ...payload, location_name: payload.location_name ?? 'Meeting point', id: nextId++, user: viewer, created_at: time(), updated_at: time() };
      conversations.set(message.id, message); return structuredClone(message);
    },
    async updateLocationMessage(id, payload) { const message = find(conversations, id); Object.assign(message, payload); return structuredClone(message); },
    async replaceLocationMessage(id, payload) { return local.updateLocationMessage!(id, payload); },
    async deleteLocationMessage(id) { conversations.delete(id); },
    async restoreLocationMessage(id) { return structuredClone(find(conversations, id)); },
    subscribeVenueLive(_venue, _event, status) { status?.('idle'); return { disconnect() {} }; },
    subscribeLocationLive(_venue, _location, _event, status) { status?.('idle'); return { disconnect() {} }; },
  };
  const catalogMethods = new Set(['listVenues', 'getVenue', 'listSections', 'listFloors', 'getSection', 'listCategories', 'getCategory', 'listInterests']);
  return new Proxy(catalog, {
    get(target, property, receiver) {
      const method = local[property as keyof ForumRepository];
      if (method) return method;
      if (typeof property === 'string' && !catalogMethods.has(property)) {
        return () => { throw new Error('That action is currently unavailable.'); };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
