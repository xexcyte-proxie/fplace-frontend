import { PROFILE_DESIGN } from './profile-data';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderProfileScreen(): string {
  const profile = PROFILE_DESIGN;

  const interestTags = profile.interests
    .map(
      (interest) =>
        `<span class="profile-interest-tag">${escapeHtml(interest)}</span>`,
    )
    .join('');

  return `
    <div class="profile-screen">
      <header class="profile-header">
        <div class="profile-header-toolbar">
          <button type="button" id="profile-settings-btn" class="profile-settings-btn" aria-label="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" stroke="currentColor" stroke-width="1.75"></path>
              <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 00.12-.64l-2-3.46a.5.5 0 00-.6-.22l-2.49 1a7.03 7.03 0 00-1.7-.98l-.38-2.65A.5.5 0 0014 2h-4a.5.5 0 00-.49.42l-.38 2.65a7.03 7.03 0 00-1.7.98l-2.49-1a.5.5 0 00-.6.22l-2 3.46a.5.5 0 00.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 00-.12.64l2 3.46a.5.5 0 00.6.22l2.49-1c.52.4 1.09.73 1.7.98l.38 2.65A.5.5 0 0010 22h4a.5.5 0 00.49-.42l.38-2.65c.61-.25 1.18-.58 1.7-.98l2.49 1a.5.5 0 00.6-.22l2-3.46a.5.5 0 00-.12-.64l-2.11-1.65z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
            </svg>
          </button>
        </div>

        <div class="profile-identity">
          <span class="profile-avatar">${escapeHtml(profile.initials)}</span>
          <h1 class="profile-username">${escapeHtml(profile.displayName)}</h1>
          <p class="profile-location">
            <svg class="profile-location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 21s6.5-4.5 6.5-10a6.5 6.5 0 10-13 0c0 5.5 6.5 10 6.5 10z" stroke="currentColor" stroke-width="1.75"></path>
              <circle cx="12" cy="11" r="2.25" stroke="currentColor" stroke-width="1.75"></circle>
            </svg>
            <span>${escapeHtml(profile.location)}</span>
          </p>
        </div>
      </header>

      <div class="profile-stats">
        <div class="profile-stat-card">
          <div class="profile-stat-value">${profile.stats.posts}</div>
          <div class="profile-stat-label">Posts</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-value profile-stat-value--green">${profile.stats.upvotes}</div>
          <div class="profile-stat-label">Upvotes</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-value">${profile.stats.venues}</div>
          <div class="profile-stat-label">Venues</div>
        </div>
      </div>

      <section class="profile-section">
        <h2 class="profile-section-title">Interests</h2>
        <div class="profile-interests">${interestTags}</div>
      </section>

      <section class="profile-section">
        <h2 class="profile-section-title">Recent Posts</h2>
        <article class="profile-post-card">
          <p class="profile-post-content">${escapeHtml(profile.recentPost.content)}</p>
          <div class="profile-post-footer">
            <span class="profile-post-meta">${escapeHtml(profile.recentPost.meta)}</span>
            <span class="profile-post-upvotes">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5l6 7h-4v7H10v-7H6l6-7z" fill="currentColor"></path>
              </svg>
              ${profile.recentPost.upvotes}
            </span>
          </div>
        </article>
      </section>
    </div>
  `;
}
