import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthRemoteDatasource } from '../auth/data/datasources/auth-remote-datasource';
import { ForumRemoteDatasource } from '../forum/data/datasources/forum-remote-datasource';
import { NotificationsRemoteDatasource } from '../notifications/data/datasources/notifications-remote-datasource';
import { MapsRemoteDatasource } from '../maps/data/datasources/maps-remote-datasource';
import { tokenLocalDatasource } from '../auth/data/datasources/token-local-datasource';

/**
 * Contract tests: newly wired non-admin OpenAPI endpoints hit the correct
 * method + path (admin endpoints intentionally excluded).
 */
describe('OpenAPI non-admin endpoint coverage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    tokenLocalDatasource.save({
      access: 'test-access',
      refresh: 'test-refresh',
    });
    fetchMock.mockReset();
  });

  afterEach(() => {
    tokenLocalDatasource.clear();
    vi.unstubAllGlobals();
  });

  function mockJson(body: unknown, status = 200): void {
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  }

  function lastCall(): { url: string; method: string; body: unknown } {
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return {
      url: String(url),
      method: String((init as RequestInit | undefined)?.method ?? 'GET'),
      body: (init as RequestInit | undefined)?.body
        ? JSON.parse(String((init as RequestInit).body))
        : null,
    };
  }

  describe('auth', () => {
    const auth = new AuthRemoteDatasource();

    it('POST /api/users/guest/', async () => {
      const { guestRemoteDatasource } = await import(
        '../guest/data/datasources/guest-remote-datasource'
      );
      mockJson({
        access: 'guest-access',
        token_type: 'guest',
        expires_in: 3600,
        trial_expires_at: '2026-08-12T00:00:00Z',
        mappedin: { token: 'mi', expires_in: 3600 },
      });
      await guestRemoteDatasource.obtainGuestToken({
        ip_address: '1.2.3.4',
        device_fingerprint: 'fp_abc',
      });
      const call = lastCall();
      expect(call.method).toBe('POST');
      expect(call.url).toContain('/api/users/guest/');
      expect(call.body).toEqual({
        ip_address: '1.2.3.4',
        device_fingerprint: 'fp_abc',
      });
    });

    it('GET/PATCH /api/users/guest/update/', async () => {
      const { guestRemoteDatasource } = await import(
        '../guest/data/datasources/guest-remote-datasource'
      );
      mockJson({ has_tried_ar_view: false, has_tried_2d_view: false });
      await guestRemoteDatasource.getSessionPreferences();
      expect(lastCall().method).toBe('GET');
      expect(lastCall().url).toContain('/api/users/guest/update/');

      mockJson({ has_tried_ar_view: true, has_tried_2d_view: true });
      await guestRemoteDatasource.updateSessionPreferences({
        has_tried_ar_view: true,
        has_tried_2d_view: true,
      });
      expect(lastCall().method).toBe('PATCH');
      expect(lastCall().url).toContain('/api/users/guest/update/');
      expect(lastCall().body).toEqual({
        has_tried_ar_view: true,
        has_tried_2d_view: true,
      });
    });

    it('POST /api/users/password-reset/', async () => {
      mockJson({ detail: 'A password reset email has been sent.' });
      const message = await auth.requestPasswordReset('fan@email.com');
      const call = lastCall();
      expect(call.method).toBe('POST');
      expect(call.url).toContain('/api/users/password-reset/');
      expect(call.body).toEqual({ email: 'fan@email.com' });
      expect(message).toContain('password reset');
    });

    it('POST /api/users/password-reset-confirm/', async () => {
      mockJson({ detail: 'ok' });
      await auth.confirmPasswordReset({
        uid: 'u1',
        token: 't1',
        new_password: 'NewPass123!',
      });
      const call = lastCall();
      expect(call.method).toBe('POST');
      expect(call.url).toContain('/api/users/password-reset-confirm/');
      expect(call.body).toEqual({
        uid: 'u1',
        token: 't1',
        new_password: 'NewPass123!',
      });
    });

    it('POST /api/users/change-password/', async () => {
      mockJson({ detail: 'ok' });
      await auth.changePassword({
        old_password: 'OldPass123!',
        new_password: 'NewPass123!',
      });
      const call = lastCall();
      expect(call.method).toBe('POST');
      expect(call.url).toContain('/api/users/change-password/');
    });

    it('PUT /api/users/me/', async () => {
      mockJson({
        id: 1,
        email: 'a@b.com',
        pseudo_name: 'Fan',
        is_email_verified: true,
        created_at: '',
        updated_at: '',
      });
      await auth.replaceProfile({ pseudo_name: 'Fan' });
      const call = lastCall();
      expect(call.method).toBe('PUT');
      expect(call.url).toContain('/api/users/me/');
    });
  });

  describe('forum catalog + posts', () => {
    const forum = new ForumRemoteDatasource();

    it('GET venue/section/category by id', async () => {
      mockJson({
        id: 9,
        name: 'LA',
        location: 'CA',
        latitude: null,
        longitude: null,
        mappedin_map_id: null,
        notes: '',
        created_at: '',
        updated_at: '',
      });
      await forum.getVenue(9);
      expect(lastCall().url).toContain('/api/forum/venues/9/');

      mockJson({
        id: 3,
        venue: 9,
        name: 'N1',
        code: 'N1',
        is_active: true,
        created_at: '',
        updated_at: '',
      });
      await forum.getSection(3);
      expect(lastCall().url).toContain('/api/forum/sections/3/');

      mockJson({
        id: 2,
        name: 'Food',
        slug: 'food',
        description: '',
        disclaimer: '',
        order: 1,
        is_active: true,
        created_at: '',
        updated_at: '',
      });
      await forum.getCategory(2);
      expect(lastCall().url).toContain('/api/forum/categories/2/');
    });

    it('GET/PUT/PATCH/DELETE/restore post by id', async () => {
      const post = {
        id: 44,
        user: { id: 1, display_name: 'Fan' },
        venue: 9,
        section: null,
        category: 2,
        content: 'hello',
        upvotes_count: 0,
        flags_count: 0,
        status: 'visible',
        has_upvoted: false,
        created_at: '',
        updated_at: '',
      };
      mockJson(post);
      await forum.getPost(44);
      expect(lastCall().method).toBe('GET');
      expect(lastCall().url).toContain('/api/forum/posts/44/');

      mockJson(post);
      await forum.updatePost(44, { content: 'edited' });
      expect(lastCall().method).toBe('PATCH');

      mockJson(post);
      await forum.replacePost(44, {
        venue: 9,
        category: 2,
        content: 'replaced',
      });
      expect(lastCall().method).toBe('PUT');

      mockJson({});
      await forum.deletePost(44);
      expect(lastCall().method).toBe('DELETE');

      mockJson(post);
      await forum.restorePost(44);
      expect(lastCall().method).toBe('POST');
      expect(lastCall().url).toContain('/api/forum/posts/44/restore/');
    });
  });

  describe('forum comments', () => {
    const forum = new ForumRemoteDatasource();
    const comment = {
      id: 7,
      post: 44,
      user: { id: 1, display_name: 'Fan' },
      content: 'nice',
      created_at: '',
      updated_at: '',
    };

    it('list/create/get/update/replace/delete/restore comments', async () => {
      mockJson({ count: 1, next: null, previous: null, results: [comment] });
      await forum.listComments({ post: 44 });
      expect(lastCall().url).toContain('/api/forum/comments/');
      expect(lastCall().url).toContain('post=44');

      mockJson(comment);
      await forum.createComment({ post: 44, content: 'nice' });
      expect(lastCall().method).toBe('POST');
      expect(lastCall().url).toContain('/api/forum/comments/');

      mockJson(comment);
      await forum.getComment(7);
      expect(lastCall().url).toContain('/api/forum/comments/7/');

      mockJson(comment);
      await forum.updateComment(7, { content: 'updated' });
      expect(lastCall().method).toBe('PATCH');

      mockJson(comment);
      await forum.replaceComment(7, { post: 44, content: 'replaced' });
      expect(lastCall().method).toBe('PUT');

      mockJson({});
      await forum.deleteComment(7);
      expect(lastCall().method).toBe('DELETE');

      mockJson(comment);
      await forum.restoreComment(7);
      expect(lastCall().method).toBe('POST');
      expect(lastCall().url).toContain('/api/forum/comments/7/restore/');
    });
  });

  describe('notifications', () => {
    const notifications = new NotificationsRemoteDatasource();

    it('GET unread_count + get by id + underscore mark paths', async () => {
      mockJson({ unread_count: 3 });
      await expect(notifications.getUnreadCount()).resolves.toBe(3);
      expect(lastCall().url).toContain('/api/notifications/unread_count/');

      mockJson({
        id: 5,
        title: 'Hi',
        body: 'There',
        is_read: false,
        notification_type: 'general',
        venue: null,
        created_at: '',
        updated_at: '',
      });
      await notifications.getNotification(5);
      expect(lastCall().url).toContain('/api/notifications/5/');

      mockJson({
        id: 5,
        title: 'Hi',
        body: 'There',
        is_read: true,
        notification_type: 'general',
        venue: null,
        created_at: '',
        updated_at: '',
      });
      await notifications.markRead(5);
      expect(lastCall().method).toBe('POST');
      expect(lastCall().url).toContain('/api/notifications/5/mark_read/');

      mockJson({ detail: 'ok' });
      await notifications.markAllRead();
      expect(lastCall().url).toContain('/api/notifications/mark_all_read/');
    });
  });

  describe('maps', () => {
    it('GET /api/maps/token/', async () => {
      mockJson({ token: 'mappedin-temp' });
      const maps = new MapsRemoteDatasource();
      const result = await maps.getToken();
      expect(result.token).toBe('mappedin-temp');
      expect(lastCall().method).toBe('GET');
      expect(lastCall().url).toContain('/api/maps/token/');
    });
  });
});
