import 'package:mapsindoors_mapbox/mapsindoors.dart';

import '../utils/app_logger.dart';

class IndoorMapFocusResult {
  const IndoorMapFocusResult({
    this.venue,
    this.building,
    this.floor,
  });

  final MPVenue? venue;
  final MPBuilding? building;
  final MPFloor? floor;
}

/// Engine repository wrapping MapsIndoors SDK calls.
class IndoorMapRepository {
  const IndoorMapRepository();

  Future<MPError?> initializeEngine(String solutionId) async {
    appLog('Repository', 'Initializing MapsIndoors engine (solution: $solutionId)');
    final error = await loadMapsIndoors(solutionId);
    if (error != null) {
      appLog('Repository', 'Engine init failed: $error');
    } else {
      appLog('Repository', 'Engine initialized successfully');
    }
    return error;
  }

  Future<IndoorMapFocusResult> focusIndoorMap(MapsIndoorsWidget mapControl) async {
    final venueCollection = await getVenues();
    final buildingCollection = await getBuildings();
    final venues = venueCollection?.getAll() ?? const <MPVenue>[];
    final buildings = buildingCollection?.getAll() ?? const <MPBuilding>[];

    for (final venue in venues) {
      appLog('Repository', 'Available venue: ${venue.name}');
    }
    for (final building in buildings) {
      appLog(
        'Repository',
        'Available building: ${building.name} (${building.floorCount} floors)',
      );
    }

    final defaultVenue = await getDefaultVenue();
    appLog('Repository', 'Default venue from SDK: ${defaultVenue?.name ?? 'null'}');

    final targetVenue = _pickTargetVenue(venues, defaultVenue);
    if (targetVenue != null) {
      appLog('Repository', 'Navigating to venue: ${targetVenue.name}');
      await mapControl.selectVenue(targetVenue, true);
      await mapControl.goTo(targetVenue);
    }

    // Allow the platform map view to receive a full-size layout before selection.
    await Future<void>.delayed(const Duration(milliseconds: 350));

    final targetBuilding = _pickTargetBuilding(buildings, targetVenue);
    if (targetBuilding != null) {
      appLog(
        'Repository',
        'Selecting building: ${targetBuilding.name} (${targetBuilding.floorCount} floors)',
      );
      await mapControl.selectBuilding(targetBuilding, true);
      await mapControl.selectFloor(targetBuilding.initialFloorIndex);
    }

    final building = targetBuilding ?? await mapControl.getCurrentBuilding();
    final floor = await mapControl.getCurrentBuildingFloor();

    if (venues.length == 1 && venues.first.name == 'The White House') {
      appLog(
        'Repository',
        'NOTE: Solution loaded demo dataset (White House). '
        'MapsPeople HQ may require a different API key.',
      );
    }
    appLog(
      'Repository',
      'Focus complete — venue: ${targetVenue?.name}, '
      'building: ${building?.name}, floor: ${floor?.displayName}',
    );

    return IndoorMapFocusResult(
      venue: targetVenue,
      building: building,
      floor: floor,
    );
  }

  MPVenue? _pickTargetVenue(List<MPVenue> venues, MPVenue? defaultVenue) {
    for (final venue in venues) {
      final name = venue.name?.toLowerCase() ?? '';
      if (name.contains('mapspeople') || name.contains('hq')) {
        return venue;
      }
    }

    if (venues.length == 1) {
      return venues.first;
    }

    for (final venue in venues) {
      final name = venue.name?.toLowerCase() ?? '';
      if (!name.contains('white house')) {
        return venue;
      }
    }

    return defaultVenue ?? (venues.isNotEmpty ? venues.first : null);
  }

  MPBuilding? _pickTargetBuilding(
    List<MPBuilding> buildings,
    MPVenue? venue,
  ) {
    Iterable<MPBuilding> candidates =
        buildings.where((building) => building.floorCount > 0);

    if (venue != null) {
      final venueBuildings =
          candidates.where((building) => building.venueId == venue.id.value);
      if (venueBuildings.isNotEmpty) {
        candidates = venueBuildings;
      }
    }

    final ranked = candidates.toList()
      ..sort((a, b) => b.floorCount.compareTo(a.floorCount));

    if (ranked.isEmpty) {
      return buildings.isNotEmpty ? buildings.first : null;
    }

    // Prefer the main indoor building over auxiliary structures like pool house.
    for (final building in ranked) {
      final name = building.name.toLowerCase();
      if (name.contains('pool')) {
        continue;
      }
      return building;
    }

    return ranked.first;
  }

  Future<List<MPLocation>> searchLocations(String query, {int limit = 30}) async {
    appLog('Repository', 'Searching locations: "$query" (limit: $limit)');
    if (query.trim().isEmpty) {
      appLog('Repository', 'Empty query — returning no results');
      return const [];
    }

    final mpQuery = (MPQueryBuilder()..setQuery(query.trim())).build();
    final filter = (MPFilterBuilder()..setTake(limit)).build();
    final locations = await getLocationsByQuery(query: mpQuery, filter: filter);
    final results = locations ?? const [];
    appLog('Repository', 'Search returned ${results.length} location(s)');
    for (final location in results.take(5)) {
      appLog('Repository', '  · ${location.name} (${location.floorName})');
    }
    if (results.length > 5) {
      appLog('Repository', '  · ... and ${results.length - 5} more');
    }
    return results;
  }

  Future<List<MPLocation>> findLocationsByQuery(String query) async {
    appLog('Repository', 'Finding locations by query: "$query"');
    final mpQuery = (MPQueryBuilder()..setQuery(query)).build();
    final locations = await getLocationsByQuery(query: mpQuery);
    final results = locations ?? const [];
    appLog('Repository', 'Found ${results.length} location(s) for "$query"');
    return results;
  }

  Future<MPRoute> calculateRoute({
    required MPPoint origin,
    required MPPoint destination,
  }) async {
    appLog(
      'Repository',
      'Calculating route: '
      '(${origin.latitude}, ${origin.longitude}, floor ${origin.floorIndex}) → '
      '(${destination.latitude}, ${destination.longitude}, floor ${destination.floorIndex})',
    );
    final directionsService = MPDirectionsService()
      ..setTravelMode(MPDirectionsService.travelModeWalking);

    final route = await directionsService.getRoute(
      origin: origin,
      destination: destination,
    );
    appLog('Repository', 'Route calculated with ${route.legs?.length ?? 0} leg(s)');
    return route;
  }

  Future<MPBuilding?> currentBuilding(MapsIndoorsWidget mapControl) async {
    appLog('Repository', 'Fetching current building');
    final building = await mapControl.getCurrentBuilding();
    appLog(
      'Repository',
      'Current building: ${building?.name ?? 'null'} '
      '(${building?.floorCount ?? 0} floors)',
    );
    return building;
  }

  Future<MPFloor?> currentFloor(MapsIndoorsWidget mapControl) async {
    appLog('Repository', 'Fetching current floor');
    final floor = await mapControl.getCurrentBuildingFloor();
    appLog(
      'Repository',
      'Current floor: ${floor?.displayName ?? 'null'} (index ${floor?.floorIndex})',
    );
    return floor;
  }
}
