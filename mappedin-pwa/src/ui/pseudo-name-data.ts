/** Interests + pseudo-name options for post-signup profile setup (Frame-5). */

export const PROFILE_INTEREST_OPTIONS = [
  'Home team',
  'Away team',
  'Live music',
  'Family zone',
  'Food and drink',
  'Merch',
  'Stats and scores',
  'Photography',
] as const;

export type ProfileInterest = (typeof PROFILE_INTEREST_OPTIONS)[number];

/** Example shown as input placeholder until the user types or shuffles. */
export const PSEUDO_NAME_PLACEHOLDER = 'RowdyGull_47';

const PSEUDO_NAME_ADJECTIVES = [
  'Rowdy',
  'Lucky',
  'Swift',
  'Bold',
  'Quiet',
  'Wild',
  'Bright',
  'Clever',
  'Mighty',
  'Chill',
] as const;

const PSEUDO_NAME_NOUNS = [
  'Gull',
  'Fox',
  'Hawk',
  'Wolf',
  'Lynx',
  'Bear',
  'Otter',
  'Raven',
  'Tiger',
  'Falcon',
] as const;

export function generatePseudoName(exclude?: string): string {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const adjective =
      PSEUDO_NAME_ADJECTIVES[
        Math.floor(Math.random() * PSEUDO_NAME_ADJECTIVES.length)
      ]!;
    const noun =
      PSEUDO_NAME_NOUNS[Math.floor(Math.random() * PSEUDO_NAME_NOUNS.length)]!;
    const number = Math.floor(Math.random() * 90) + 10;
    const candidate = `${adjective}${noun}_${number}`;
    if (candidate !== exclude) return candidate;
  }
  return PSEUDO_NAME_PLACEHOLDER;
}
