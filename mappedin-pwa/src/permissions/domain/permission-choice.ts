/** User's remembered permission decision (not the live browser Permissions API). */
export type PermissionChoice = 'undecided' | 'granted' | 'denied';

export function isSettledPermissionChoice(
  choice: PermissionChoice,
): choice is 'granted' | 'denied' {
  return choice === 'granted' || choice === 'denied';
}
