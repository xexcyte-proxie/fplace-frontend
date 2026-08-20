const NAV_ASSETS = {
  home: '/nav/home.png',
  chats: '/nav/chats.png',
  profile: '/nav/profile.png',
} as const;

function navIcon(src: string): string {
  return `
    <span
      class="bottom-nav-icon"
      style="--bottom-nav-icon: url('${src}')"
      aria-hidden="true"
    ></span>
  `;
}

export const bottomNavNavigateIcon = navIcon(NAV_ASSETS.home);

/** @deprecated Prefer bottomNavNavigateIcon - kept for any legacy references. */
export const bottomNavMapIcon = bottomNavNavigateIcon;

export const bottomNavSocialIcon = navIcon(NAV_ASSETS.chats);

export const bottomNavProfileIcon = navIcon(NAV_ASSETS.profile);
