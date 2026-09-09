import {
  formatRelativeDistance,
  metersFromUser,
  sortByUserDistance,
} from '../location/domain/user-relative-distance';
import type { PermissionChoice } from '../permissions/domain/permission-choice';
import type { LocationResult, UserLocationCoords } from '../types';

export interface SearchResultView {
  id: string;
  name: string;
  floorName?: string;
  distanceLabel: string | null;
}

export function buildSearchResultViews(
  results: readonly LocationResult[],
  permission: PermissionChoice,
  userLocation: UserLocationCoords | null,
): SearchResultView[] {
  const decorated = results.map((result) => {
    const meters = metersFromUser(permission, userLocation, result);
    return {
      id: result.id,
      name: result.name,
      floorName: result.floorName,
      meters,
      distanceLabel: formatRelativeDistance(meters),
    };
  });

  const ranked = decorated.some((item) => item.meters != null)
    ? sortByUserDistance(decorated, (item) => item.meters)
    : decorated;

  return ranked.map(({ id, name, floorName, distanceLabel }) => ({
    id,
    name,
    floorName,
    distanceLabel,
  }));
}
