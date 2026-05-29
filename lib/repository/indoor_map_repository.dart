import '../models/indoor_map_models.dart';
import '../services/mappedin_bridge_service.dart';
import '../utils/map_diagnostic_logger.dart';

/// Repository wrapping Mappedin Web SDK bridge calls.
class IndoorMapRepository {
  const IndoorMapRepository();

  Future<void> initializeMap(MappedinBridgeService bridge) async {
    MapDiagnosticLogger.step('Repository', 'Calling bridge.initializeMap()');
    await bridge.initializeMap();
    MapDiagnosticLogger.ok('Repository', 'bridge.initializeMap() dispatched');
  }

  Future<IndoorMapFocusResult> parseMapReady(Map<String, dynamic> data) async {
    final floors = _parseFloors(data['floors']);
    final currentFloor = data['currentFloor'] is Map
        ? _parseFloor(Map<String, dynamic>.from(data['currentFloor'] as Map))
        : (floors.isNotEmpty ? floors.first : null);

    MapDiagnosticLogger.ok(
      'Repository',
      'Parsed ready payload — ${floors.length} floor(s), '
      'current: ${currentFloor?.displayName ?? 'none'}',
    );

    return IndoorMapFocusResult(
      mapName: data['mapName']?.toString(),
      floors: floors,
      currentFloor: currentFloor,
    );
  }

  List<IndoorFloor> _parseFloors(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => _parseFloor(Map<String, dynamic>.from(e)))
        .toList();
  }

  IndoorFloor _parseFloor(Map<String, dynamic> json) {
    return IndoorFloor(
      id: json['id']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? '?',
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
    );
  }

  List<IndoorLocation> parseSearchResults(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => IndoorLocation.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  IndoorRoute? parseRoute(dynamic raw) {
    if (raw is! Map) return null;
    return IndoorRoute.fromJson(Map<String, dynamic>.from(raw));
  }

  Future<List<IndoorLocation>> searchLocations(
    MappedinBridgeService bridge,
    String query, {
    int limit = 30,
  }) async {
    MapDiagnosticLogger.step('Repository', 'Searching: "$query" (limit: $limit)');
    if (query.trim().isEmpty) {
      return const [];
    }
    await bridge.search(query, limit: limit);
    return const [];
  }

  Future<List<IndoorLocation>> findLocationsByQuery(
    MappedinBridgeService bridge,
    String query,
  ) async {
    await bridge.search(query);
    return const [];
  }
}
