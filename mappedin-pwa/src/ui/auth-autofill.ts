/** HTML autocomplete tokens password managers expect on auth fields. */
export const AUTH_AUTOCOMPLETE = {
  username: 'username',
  currentPassword: 'current-password',
  newPassword: 'new-password',
  oneTimeCode: 'one-time-code',
  /** Pseudo-name is not an account identifier — keep managers off this field. */
  displayName: 'off',
} as const;

/**
 * Chrome/Safari fire this animation on `:autofill` instead of `input`.
 * Keep in sync with `@keyframes auth-autofill-start` in styles.css.
 */
export const AUTH_AUTOFILL_ANIMATION_NAME = 'auth-autofill-start';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Hidden username so password-only forms still map to the right account. */
export function renderHiddenUsernameField(email: string): string {
  return `
    <input
      type="email"
      class="visually-hidden"
      name="username"
      autocomplete="${AUTH_AUTOCOMPLETE.username}"
      value="${escapeHtml(email)}"
      tabindex="-1"
      aria-hidden="true"
    />
  `;
}
