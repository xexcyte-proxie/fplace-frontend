/**
 * Catalog of interest chips for onboarding / profile.
 * Labels must match strings stored on `User.interests`.
 *
 * Source of truth: GET /api/users/interests/.
 * This list is only used when that catalog has not loaded yet.
 */
export const DEFAULT_INTEREST_OPTIONS = [
  'Home team',
  'Away team',
  'Live music',
  'Family zone',
  'Food and drink',
  'Merch',
  'Stats and scores',
  'Photography',
] as const;

export type DefaultInterestOption = (typeof DEFAULT_INTEREST_OPTIONS)[number];

function labelFromUnknown(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of ['name', 'label', 'title', 'value'] as const) {
    if (typeof record[key] === 'string') {
      const trimmed = record[key].trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function uniqueLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * Accepts DRF paginated `{ results }`, `{ interests: string[] }`, or a raw array.
 */
export function parseInterestOptionsPayload(payload: unknown): string[] {
  if (payload == null) return [];
  if (Array.isArray(payload)) {
    return uniqueLabels(
      payload
        .map((entry) => labelFromUnknown(entry))
        .filter((label): label is string => Boolean(label)),
    );
  }
  if (typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.results)) {
    return parseInterestOptionsPayload(record.results);
  }
  if (Array.isArray(record.interests)) {
    return parseInterestOptionsPayload(record.interests);
  }
  if (Array.isArray(record.data)) {
    return parseInterestOptionsPayload(record.data);
  }
  return [];
}

/** Keep already-selected values visible even if the catalog dropped them. */
export function interestOptionsForPicker(
  catalog: readonly string[],
  selected: readonly string[],
): string[] {
  const options = uniqueLabels(
    catalog.map((item) => item.trim()).filter(Boolean),
  );
  const known = new Set(options.map((item) => item.toLowerCase()));
  for (const item of selected) {
    const trimmed = item.trim();
    if (!trimmed || known.has(trimmed.toLowerCase())) continue;
    options.push(trimmed);
    known.add(trimmed.toLowerCase());
  }
  return options;
}
