/** Password strength shown on the create-account form. */
export type PasswordStrength = 'empty' | 'weak' | 'strong';

/**
 * Evaluates password strength for registration UI feedback.
 * "Strong" matches the Figma create-account hint for a mixed alphanumeric password.
 */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password) return 'empty';

  const longEnough = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);

  if (longEnough && hasLetter && hasNumber) return 'strong';
  return 'weak';
}
