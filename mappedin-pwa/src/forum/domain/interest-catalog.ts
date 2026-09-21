import type { ForumInterest } from './entities';

/**
 * Labels for interest chips, in picker order.
 * Inactive rows stay off the catalog so retired tags do not reappear.
 */
export function activeInterestLabels(
  interests: readonly ForumInterest[],
): string[] {
  const sorted = [...interests]
    .filter((interest) => interest.is_active)
    .sort(
      (left, right) =>
        left.order - right.order || left.name.localeCompare(right.name),
    );

  const seen = new Set<string>();
  const labels: string[] = [];
  for (const interest of sorted) {
    const name = interest.name.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    labels.push(name);
  }
  return labels;
}
