import { sortVenuesByNameDescending } from '../home/domain/home-venues';
import { formatCountNoun } from '../auth/domain/user-stats';
import type { RecentVenueVisit } from '../home/domain/entities';
import { escapeHtml } from './escape-html';

function recentVenueIcon(kind: 'pin' | 'globe'): string {
  if (kind === 'globe') {
    return `
      <span class="returning-home-venue-icon returning-home-venue-icon--globe" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.75"></circle>
          <path d="M3.75 12h16.5M12 3.75c2.4 2.6 3.6 5.3 3.6 8.25S14.4 17.65 12 20.25C9.6 17.65 8.4 14.95 8.4 12S9.6 6.35 12 3.75z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
        </svg>
      </span>
    `;
  }

  return `
    <span class="returning-home-venue-icon returning-home-venue-icon--pin" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 21s6.25-4.35 6.25-10a6.25 6.25 0 10-12.5 0c0 5.65 6.25 10 6.25 10z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
        <circle cx="12" cy="11" r="2.15" stroke="currentColor" stroke-width="1.75"></circle>
      </svg>
    </span>
  `;
}

const chevronIcon = `
  <svg class="returning-home-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

function venueMeta(venue: RecentVenueVisit): string {
  if (venue.postCount > 0) {
    return `${venue.visitedLabel} · ${formatCountNoun(venue.postCount, 'post')}`;
  }
  return venue.visitedLabel;
}

export function renderHomeVenueCard(venue: RecentVenueVisit): string {
  return `
          <button
            type="button"
            class="returning-home-venue-card"
            data-home-venue-id="${escapeHtml(venue.id)}"
          >
            ${recentVenueIcon(venue.icon)}
            <span class="returning-home-venue-copy">
              <span class="returning-home-venue-name">${escapeHtml(venue.name)}</span>
              <span class="returning-home-venue-meta">${escapeHtml(venueMeta(venue))}</span>
            </span>
            ${chevronIcon}
          </button>
        `;
}

export function renderHomeVenueSections(options: {
  recentlyVisited: RecentVenueVisit[];
  otherVenues: RecentVenueVisit[];
  searching?: boolean;
  loading?: boolean;
}): string {
  const searching = Boolean(options.searching);
  const loading = Boolean(options.loading);
  const recentRows = loading
    ? ''
    : options.recentlyVisited.length
      ? sortVenuesByNameDescending(options.recentlyVisited).map(renderHomeVenueCard).join('')
      : searching
        ? ''
        : `<p class="returning-home-empty" role="status">No recent venues yet</p>`;
  const otherRows = loading
    ? ''
    : sortVenuesByNameDescending(options.otherVenues).map(renderHomeVenueCard).join('');
  const showRecentSection = loading || Boolean(recentRows);
  const showOtherSection = !loading && Boolean(otherRows);
  const noSearchMatches =
    searching &&
    !loading &&
    options.recentlyVisited.length === 0 &&
    options.otherVenues.length === 0;

  return `
      ${
        showRecentSection
          ? `
      <div class="returning-home-section" data-tour-id="returning-recent">
        <h2 class="returning-home-section-title">Recently visited</h2>
        <div class="returning-home-venue-list">
          ${recentRows}
        </div>
      </div>`
          : ''
      }

      ${
        showOtherSection
          ? `
      <div class="returning-home-section" data-tour-id="returning-other">
        <h2 class="returning-home-section-title">Other venues</h2>
        <div class="returning-home-venue-list">
          ${otherRows}
        </div>
      </div>`
          : ''
      }

      ${
        noSearchMatches
          ? `<p class="returning-home-empty" role="status">No matching venues</p>`
          : ''
      }
  `;
}
