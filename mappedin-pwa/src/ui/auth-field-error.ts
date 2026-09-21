/** Lookup a field error from the auth form error map. */
export function authFieldError(
  errors: Record<string, string>,
  key: string,
): string {
  return errors[key] ?? '';
}
