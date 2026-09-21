import { resolveUserFacingApiErrorMessage } from '../../auth/domain/user-facing-api-error';

const MAP_BOOT_ERROR_FALLBACK = 'Map failed to load. Please try again.';

/** Never show bare HTTP codes like "401" on the orange map boot screen. */
export function resolveMapBootErrorMessage(
  rawMessage: string | null | undefined,
): string {
  return resolveUserFacingApiErrorMessage(rawMessage, MAP_BOOT_ERROR_FALLBACK);
}
