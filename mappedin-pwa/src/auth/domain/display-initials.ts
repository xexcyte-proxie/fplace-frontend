/**
 * Initials for pseudo-names like `RowdyGull_47` → `RG`.
 * Guest fallback is `G` when the name is empty.
 */
export function initialsFromName(name: string): string {
  const cleaned = name.trim().replace(/_\d+$/, '');
  const camelParts = cleaned.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g);
  if (camelParts && camelParts.length >= 2) {
    return `${camelParts[0]![0] ?? ''}${camelParts[1]![0] ?? ''}`.toUpperCase();
  }

  const parts = cleaned.split(/[\s_]+/).filter(Boolean);
  if (parts.length === 0) return 'G';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}
