/** Browser-saved login pair used to autofill sign-in. */
export interface SavedPasswordCredential {
  email: string;
  password: string;
}

export function isUsableSavedPasswordCredential(
  value: SavedPasswordCredential | null | undefined,
): value is SavedPasswordCredential {
  return Boolean(value?.email.trim() && value.password);
}
