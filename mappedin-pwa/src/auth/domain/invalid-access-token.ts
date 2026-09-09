/**
 * Django SimpleJWT rejects a Bearer JWT that is expired, the wrong class
 * (guest vs access, refresh vs access), or otherwise unreadable.
 */
export const TOKEN_NOT_VALID_DETAIL =
  'Given token not valid for any token type';

export type AuthSessionClearedReason = 'invalid-token' | 'expired';

export type CreateAccountPrompt = 'invalid-token' | null;

export function isTokenNotValidForAnyType(
  value: string | null | undefined,
): boolean {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) return false;
  return (
    normalized.includes('given token not valid for any token type') ||
    normalized.includes('token_not_valid')
  );
}

/** Walks nested API error payloads (DRF envelope, SimpleJWT `messages`, `details`). */
export function containsTokenNotValidDetail(value: unknown, depth = 0): boolean {
  if (depth > 6 || value == null) return false;
  if (typeof value === 'string') return isTokenNotValidForAnyType(value);
  if (typeof value === 'number' || typeof value === 'boolean') return false;
  if (Array.isArray(value)) {
    return value.some((entry) => containsTokenNotValidDetail(entry, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.values(value).some((entry) =>
      containsTokenNotValidDetail(entry, depth + 1),
    );
  }
  return false;
}

/**
 * Apply create-account / login recovery as soon as any auth shell is showing.
 * Defer only while splash is still covering a destination that has not been
 * chosen yet — otherwise Welcome back can stick with the raw SimpleJWT error.
 */
export function shouldDeferSessionRecoveryUi(options: {
  startupReady: boolean;
  authShellVisible: boolean;
  authFlowBootstrapped: boolean;
}): boolean {
  return (
    !options.startupReady &&
    !options.authShellVisible &&
    !options.authFlowBootstrapped
  );
}

export function invalidTokenCreateAccountCopy(): {
  title: string;
  body: string;
} {
  return {
    title: 'Create an account to continue',
    body: 'This session is no longer valid. Create an account to keep using fplaces.',
  };
}
