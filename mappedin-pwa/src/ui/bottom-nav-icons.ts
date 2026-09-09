/** Inline SVGs so chrome paints without waiting on mask PNG downloads. */

function navIcon(inner: string): string {
  return `
    <svg
      class="bottom-nav-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >${inner}</svg>
  `;
}

export const bottomNavNavigateIcon = navIcon(
  '<path fill="currentColor" d="M12 2.25c-3.59 0-6.5 2.86-6.5 6.38 0 4.92 6.5 12.87 6.5 12.87s6.5-7.95 6.5-12.87c0-3.52-2.91-6.38-6.5-6.38z"/>',
);

/** @deprecated Prefer bottomNavNavigateIcon - kept for any legacy references. */
export const bottomNavMapIcon = bottomNavNavigateIcon;

export const bottomNavSocialIcon = navIcon(
  '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" d="M12 4.35a7.15 7.15 0 0 0-5.95 11.05L4.4 19.4l3.65-1.42A7.15 7.15 0 1 0 12 4.35z"/>',
);

export const bottomNavProfileIcon = navIcon(
  '<circle cx="12" cy="8" r="3.15" fill="none" stroke="currentColor" stroke-width="1.75"/><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M5.85 18.65c.95-2.55 3.2-4.05 6.15-4.05s5.2 1.5 6.15 4.05"/>',
);
