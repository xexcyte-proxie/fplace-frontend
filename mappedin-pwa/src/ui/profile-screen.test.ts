import { describe, expect, it } from 'vitest';

import { renderProfileScreen } from './profile-screen';
import { initialAppState } from '../types';

describe('renderProfileScreen', () => {
  it('renders live stats and recent posts from the profile payload', () => {
    const state = initialAppState();
    state.authUser = {
      id: 1,
      email: 'fan@email.com',
      pseudo_name: 'RowdyGull_47',
      is_email_verified: true,
      stat: { posts_count: 86, upvotes_count: 3200, venues_count: 14 },
      recent_posts: [
        {
          id: 21,
          content: 'That goal just shook the whole north stand.',
          section: null,
          venue: 1,
          upvotes_count: 248,
          created_at: new Date().toISOString(),
        },
      ],
      created_at: '',
      updated_at: '',
    };
    state.forumVenues = [{ id: 1, name: 'LA Stadium', location: 'LA' }];
    state.selectedVenueId = '1';

    const html = renderProfileScreen(state);
    expect(html).toContain('id="profile-settings-btn"');
    expect(html).toContain('aria-label="Settings"');
    expect(html).toContain('RowdyGull_47');
    expect(html).toContain('>RG</span>');
    expect(html).toContain('>86</div>');
    expect(html).toContain('>3.2k</div>');
    expect(html).toContain('>14</div>');
    expect(html).toContain('Post(s)');
    expect(html).toContain('Upvote(s)');
    expect(html).toContain('Venue(s)');
    expect(html).toContain('That goal just shook the whole north stand.');
    expect(html).toContain('248');
    expect(html).toContain('data-upvote-id="21"');
    expect(html).not.toContain('No posts yet.');
  });

  it('escapes post content that looks like HTML', () => {
    const state = initialAppState();
    state.authUser = {
      id: 1,
      email: 'fan@email.com',
      pseudo_name: 'RowdyGull_47',
      is_email_verified: true,
      recent_posts: [
        {
          id: 21,
          content: '<b>hi</b>',
          section: null,
          venue: 1,
          upvotes_count: 1,
          created_at: new Date().toISOString(),
        },
      ],
      created_at: '',
      updated_at: '',
    };

    const html = renderProfileScreen(state);
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).not.toContain('<b>hi</b>');
  });

  it('shows an empty recent-posts state when the user has no posts', () => {
    const html = renderProfileScreen(initialAppState());
    expect(html).toContain('No posts yet.');
    expect(html).toContain('No interests yet.');
    expect(html).toContain('>0</div>');
    expect(html).not.toContain('Home team');
    expect(html).not.toContain('profile-interest-tag');
  });
});
