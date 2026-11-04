/** Public browser sessions default to demo; an explicit opt-out is tab-scoped. */
export function socialDemoEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const value = new URLSearchParams(window.location.search).get('socialDemo');
  if (value === '1' || value === '0') {
    try { window.sessionStorage.setItem('fplaces.socialDemo', value); } catch { /* storage is optional */ }
    return value === '1';
  }
  try { return window.sessionStorage.getItem('fplaces.socialDemo') !== '0'; } catch { return true; }
}

export const SOCIAL_DEMO_ENABLED = socialDemoEnabled();
