/** Lucide icons rendered inline so navigation paints without network requests. */

function navIcon(inner: string): string {
  return `
    <svg
      class="bottom-nav-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >${inner}</svg>
  `;
}

export const bottomNavNavigateIcon = navIcon(
  '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
);

export const bottomNavHomeIcon = navIcon(
  '<path d="m3 10 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
);

/** @deprecated Prefer bottomNavNavigateIcon - kept for any legacy references. */
export const bottomNavMapIcon = bottomNavNavigateIcon;

export const bottomNavSocialIcon = navIcon(
  '<path d="M16 10a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M20 8a2 2 0 0 1 2 2v12l-4-4h-8a2 2 0 0 1-2-2v-2"/>',
);

export const bottomNavProfileIcon = navIcon(
  '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a5 5 0 0 1 10 0v1.662"/>',
);
