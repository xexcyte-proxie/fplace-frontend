import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/indoor_map_models.dart';
import '../repository/indoor_map_repository.dart';
import '../services/device_location_service.dart';
import '../services/mappedin_bridge_service.dart';
import '../services/route_controller.dart';
import '../utils/app_logger.dart';
import '../utils/map_diagnostic_logger.dart';
import 'indoor_map_state.dart';

final mappedinBridgeProvider = Provider<MappedinBridgeService>((ref) {
  final bridge = MappedinBridgeService();
  ref.onDispose(() {
    bridge.onEvent = null;
    bridge.dispose();
  });
  return bridge;
});

final routeControllerProvider = Provider<RouteController>((ref) {
  final controller = RouteController();
  ref.onDispose(controller.dispose);
  return controller;
});

final indoorMapRepositoryProvider = Provider<IndoorMapRepository>(
  (ref) => const IndoorMapRepository(),
);

final deviceLocationServiceProvider = Provider<DeviceLocationService>(
  (ref) => DeviceLocationService(),
);

final indoorMapProvider =
    NotifierProvider<IndoorMapNotifier, IndoorMapState>(IndoorMapNotifier.new);

class IndoorMapNotifier extends Notifier<IndoorMapState> {
  late final IndoorMapRepository _repository;
  late final RouteController _routeController;
  late final MappedinBridgeService _bridge;

  List<IndoorLocation> _pendingSearchResults = const [];
  bool _initializeStarted = false;
  bool _autoRoutePending = false;

  @override
  IndoorMapState build() {
    _repository = ref.read(indoorMapRepositoryProvider);
    _routeController = ref.read(routeControllerProvider);
    _bridge = ref.read(mappedinBridgeProvider);

    _routeController.attachBridge(_bridge);
    _bridge.onEvent = _handleBridgeEvent;
    _routeController.onLegChanged = onRouteLegChanged;

    return const IndoorMapState();
  }

  Future<void> initializeMap() async {
    if (_initializeStarted) {
      MapDiagnosticLogger.warn('Riverpod', 'initializeMap() already started — skipping');
      return;
    }
    _initializeStarted = true;

    MapDiagnosticLogger.step('Riverpod', 'initializeMap() — waiting for JS bridge…');
    _setStatus(IndoorMapStatus.engineLoading, reason: 'user opened map screen');

    try {
      await _bridge.waitUntilReady();
      MapDiagnosticLogger.ok('Riverpod', 'Bridge ready — calling repository.initializeMap()');
      await _repository.initializeMap(_bridge);
      _setStatus(IndoorMapStatus.engineReady, reason: 'init() dispatched to JavaScript');
    } on TimeoutException catch (error, stackTrace) {
      MapDiagnosticLogger.error(
        'Riverpod',
        'Timed out waiting for JavaScript bridge',
        detail: '$error\n$stackTrace',
      );
      _setStatus(
        IndoorMapStatus.engineFailure,
        reason: 'bridge timeout',
        errorMessage: 'Map bridge timed out. Check network/CDN access.',
      );
    } catch (error, stackTrace) {
      MapDiagnosticLogger.error(
        'Riverpod',
        'initializeMap() failed',
        detail: '$error\n$stackTrace',
      );
      _setStatus(
        IndoorMapStatus.engineFailure,
        reason: 'initializeMap exception',
        errorMessage: error.toString(),
      );
    }
  }

  void _setStatus(
    IndoorMapStatus status, {
    required String reason,
    String? errorMessage,
  }) {
    MapDiagnosticLogger.stateTransition(state.status.name, status.name, reason: reason);
    state = state.copyWith(status: status, errorMessage: errorMessage);
  }

  Future<void> _onMapReady(Map<String, dynamic> data) async {
    MapDiagnosticLogger.step('Riverpod', 'Processing ready payload from JavaScript…');
    final focus = await _repository.parseMapReady(data);
    MapDiagnosticLogger.ok(
      'Riverpod',
      'Map ready! floors=${focus.floors.length} '
      'current=${focus.currentFloor?.displayName ?? 'none'} '
      'mapName=${focus.mapName ?? data['mapName']}',
    );

    _setStatus(IndoorMapStatus.mapReady, reason: 'JavaScript posted ready event');
    state = state.copyWith(
      availableFloors: focus.floors,
      currentFloor: focus.currentFloor,
      clearErrorMessage: true,
    );

    if (_pendingSearchResults.isNotEmpty) {
      final results = List<IndoorLocation>.from(_pendingSearchResults);
      _pendingSearchResults = const [];
      await receiveSearchResults(results);
    }
  }

  void mapLoadFailed(String message) {
    MapDiagnosticLogger.error('Riverpod', 'mapLoadFailed', detail: message);
    _setStatus(
      IndoorMapStatus.engineFailure,
      reason: 'WebView or JS error',
      errorMessage: message,
    );
  }

  void _handleMapError(String message, {String? phase}) {
    final isFatalPhase = phase == 'init' || phase == 'import' || phase == null;
    if (!state.isMapReady && isFatalPhase) {
      mapLoadFailed(message);
      return;
    }

    if (phase == 'route') {
      MapDiagnosticLogger.routeFailure(message);
    } else {
      MapDiagnosticLogger.warn(
        'Riverpod',
        'Map operation failed (${phase ?? 'unknown'}): $message',
      );
    }
    state = state.copyWith(
      status: IndoorMapStatus.mapReady,
      errorMessage: message,
    );
  }

  Future<void> selectFloor(IndoorFloor floor) async {
    appLog('Riverpod', 'selectFloor — ${floor.displayName}');
    await _bridge.setFloor(floor.id);
    state = state.copyWith(currentFloor: floor);
  }

  void onFloorUpdated(IndoorFloor floor) {
    appLog('Riverpod', 'onFloorUpdated — ${floor.displayName}');
    state = state.copyWith(currentFloor: floor);
  }

  void onLocationSelected(IndoorLocation? location) {
    if (location == null) {
      state = state.copyWith(
        clearSelectedLocation: true,
        showRouteSheet: state.activeRoute != null,
      );
      return;
    }

    appLog('Riverpod', 'onLocationSelected — "${location.name}"');
    if (state.activeRoute != null) {
      unawaited(_routeController.clearRoute());
    }
    state = state.copyWith(
      selectedLocation: location,
      clearActiveRoute: true,
      showRouteSheet: false,
      routeInstructions: '',
      currentLegIndex: 0,
    );
  }

  Future<void> submitSearch(String query) async {
    appLog('Riverpod', 'submitSearch — "$query"');

    if (query.trim().isEmpty) {
      await _bridge.clearFilter();
      state = state.copyWith(
        searchResults: const [],
        isSearching: false,
      );
      return;
    }

    state = state.copyWith(isSearching: true);
    await _repository.searchLocations(_bridge, query);
  }

  Future<void> receiveSearchResults(List<IndoorLocation> results) async {
    appLog('Riverpod', 'receiveSearchResults — ${results.length} result(s)');

    if (results.isNotEmpty) {
      await _bridge.highlightResults(results);
    } else {
      await _bridge.clearFilter();
    }

    state = state.copyWith(
      searchResults: results,
      isSearching: false,
    );
  }

  Future<void> selectSearchResult(IndoorLocation location) async {
    appLog('Riverpod', 'selectSearchResult — "${location.name}"');
    await _bridge.selectLocation(
      location.id,
      name: location.name,
      floorId: location.floorId,
      latitude: location.latitude,
      longitude: location.longitude,
    );
    state = state.copyWith(
      searchResults: const [],
      clearSelectedLocation: true,
      clearErrorMessage: true,
    );
  }

  void _scheduleAutoRoute() {
    if (!state.hasRouteOrigin || !state.hasRouteDestination) return;
    if (_autoRoutePending) return;
    _autoRoutePending = true;
    Future.microtask(() async {
      _autoRoutePending = false;
      if (!state.hasRouteOrigin || !state.hasRouteDestination) return;
      await generateRouteFromMarkedPoints();
    });
  }

  Future<void> goToMyLocation() async {
    if (!state.isMapReady) {
      state = state.copyWith(errorMessage: 'Map is not ready yet.');
      return;
    }

    MapDiagnosticLogger.step('Riverpod', 'goToMyLocation — requesting GPS…');

    try {
      final locationService = ref.read(deviceLocationServiceProvider);
      final position = await locationService.getCurrentPosition();
      MapDiagnosticLogger.ok(
        'Riverpod',
        'GPS ${position.latitude.toStringAsFixed(6)}, '
        '${position.longitude.toStringAsFixed(6)} '
        '±${position.accuracyMeters?.toStringAsFixed(0) ?? "?"}m',
      );
      await _bridge.focusOnUserLocation(
        latitude: position.latitude,
        longitude: position.longitude,
        floorId: state.currentFloor?.id,
        accuracyMeters: position.accuracyMeters,
      );
    } on DeviceLocationException catch (error) {
      MapDiagnosticLogger.warn('Riverpod', 'GPS unavailable: ${error.message}');
      state = state.copyWith(errorMessage: error.message);
    } catch (error, stackTrace) {
      MapDiagnosticLogger.error(
        'Riverpod',
        'goToMyLocation failed',
        detail: '$error\n$stackTrace',
      );
      state = state.copyWith(
        errorMessage: 'Could not get your location. Try again outdoors or near a window.',
      );
    }
  }

  Future<void> generateSampleRoute() async {
    appLog('Riverpod', 'generateSampleRoute — demo map sample route');
    await _bridge.drawSampleRoute();
  }

  Future<void> generateRouteFromMarkedPoints() async {
    if (!state.hasRouteOrigin || !state.hasRouteDestination) return;

    MapDiagnosticLogger.routeStep(
      'Generating route',
      detail: 'destination=${state.routeDestinationLabel ?? "End point"}',
    );
    state = state.copyWith(isCalculatingRoute: true, clearErrorMessage: true);
    try {
      await _bridge.drawRouteBetweenMarkedPoints(
        destinationName: state.routeDestinationLabel,
        originLatitude: state.routeOriginLatitude,
        originLongitude: state.routeOriginLongitude,
        originFloorId: state.routeOriginFloorId,
        destinationLatitude: state.routeDestinationLatitude,
        destinationLongitude: state.routeDestinationLongitude,
        destinationFloorId: state.routeDestinationFloorId,
      );
    } finally {
      state = state.copyWith(isCalculatingRoute: false);
    }
  }

  Future<void> focusRouteStart() => _focusRoutePoint('start');

  Future<void> focusRouteEnd() => _focusRoutePoint('end');

  Future<void> _focusRoutePoint(String which) async {
    if (!state.isMapReady) return;
    if (which == 'start' && !state.hasRouteOrigin) return;
    if (which == 'end' && !state.hasRouteDestination) return;
    await _bridge.focusRoutePoint(which);
  }

  Future<void> clearRoutePoints() async {
    if (state.activeRoute != null) {
      await _routeController.clearRoute();
    }
    await _bridge.clearRoutePoints();
    await _bridge.setRoutePlanningPaused(false);
    state = state.copyWith(
      clearRouteOrigin: true,
      clearRouteDestination: true,
      clearRouteDestinationLabel: true,
      clearRouteOriginCoordinates: true,
      clearRouteDestinationCoordinates: true,
      isCalculatingRoute: false,
      clearActiveRoute: true,
      showRouteSheet: false,
      routeInstructions: '',
      currentLegIndex: 0,
    );
  }

  Future<void> onRouteDrawn(IndoorRoute route) async {
    MapDiagnosticLogger.routeStep(
      'routeDrawn event — applying ${route.legs.length} leg(s)',
      detail: 'destination=${route.destinationName ?? "—"}',
    );
    final applied = await _routeController.applyRoute(route);
    state = state.copyWith(
      activeRoute: applied,
      showRouteSheet: true,
      currentLegIndex: _routeController.currentLegIndex,
      routeInstructions: _routeController.currentLegInstructions,
      clearSelectedLocation: true,
    );
    await _bridge.setRoutePlanningPaused(true);
  }

  void onRouteLegChanged(int legIndex, {String? instructions}) {
    state = state.copyWith(
      currentLegIndex: legIndex,
      routeInstructions: instructions?.isNotEmpty == true
          ? instructions!
          : _routeController.currentLegInstructions,
    );
  }

  Future<void> routePreviousLeg() async {
    await _routeController.previousLeg();
    state = state.copyWith(
      currentLegIndex: _routeController.currentLegIndex,
      routeInstructions: _routeController.currentLegInstructions,
    );
  }

  Future<void> routeNextLeg() async {
    await _routeController.nextLeg();
    state = state.copyWith(
      currentLegIndex: _routeController.currentLegIndex,
      routeInstructions: _routeController.currentLegInstructions,
    );
  }

  Future<void> clearRoute() async {
    await _routeController.clearRoute();
    _syncRouteCleared();
  }

  void _syncRouteCleared() {
    _routeController.syncRouteCleared();
    state = state.copyWith(
      clearActiveRoute: true,
      showRouteSheet: false,
      routeInstructions: '',
      currentLegIndex: 0,
    );
    unawaited(_bridge.setRoutePlanningPaused(false));
  }

  Future<void> dismissLocationDetail() async {
    await _bridge.deselectLocation();
    state = state.copyWith(clearSelectedLocation: true);
  }

  void openArNavigation() {
    state = state.copyWith(
      isArNavigationActive: true,
      isArSessionReady: false,
      clearArStatusMessage: true,
    );
  }

  void closeArNavigation() {
    state = state.copyWith(
      isArNavigationActive: false,
      isArSessionReady: false,
    );
  }

  void arSessionReadyChanged(bool isReady) {
    state = state.copyWith(isArSessionReady: isReady);
  }

  void arStatusUpdated(String message) {
    state = state.copyWith(arStatusMessage: message);
  }

  void _handleBridgeEvent(String event, Map<String, dynamic> data) {
    switch (event) {
      case 'ready':
        _onMapReady(data);
        break;
      case 'error':
        _handleMapError(
          data['message']?.toString() ?? 'Map error',
          phase: data['phase']?.toString(),
        );
        break;
      case 'debug':
        break;
      case 'floorChanged':
        final floorData = data['floor'];
        if (floorData is Map) {
          onFloorUpdated(
            IndoorFloor(
              id: floorData['id']?.toString() ?? '',
              displayName: floorData['displayName']?.toString() ?? '?',
              sortOrder: (floorData['sortOrder'] as num?)?.toInt() ?? 0,
            ),
          );
        }
        break;
      case 'locationSelected':
        final locationData = data['location'];
        if (locationData is Map) {
          onLocationSelected(
            IndoorLocation.fromJson(
              Map<String, dynamic>.from(locationData),
            ),
          );
        } else {
          onLocationSelected(null);
        }
        break;
      case 'routeOriginSet':
        MapDiagnosticLogger.routeStep(
          'Start point set',
          detail:
              'lat=${data['latitude']} lng=${data['longitude']} floor=${data['floorId']}',
        );
        state = state.copyWith(
          hasRouteOrigin: true,
          routeOriginLatitude: _parseEventCoordinate(data['latitude']),
          routeOriginLongitude: _parseEventCoordinate(data['longitude']),
          routeOriginFloorId: data['floorId']?.toString(),
          clearErrorMessage: true,
        );
        _scheduleAutoRoute();
        break;
      case 'routeOriginCleared':
        state = state.copyWith(
          clearRouteOrigin: true,
          clearRouteOriginCoordinates: true,
        );
        break;
      case 'routeDestinationSet':
        MapDiagnosticLogger.routeStep(
          'End point set',
          detail:
              'label=${data['label']} lat=${data['latitude']} lng=${data['longitude']}',
        );
        state = state.copyWith(
          hasRouteDestination: true,
          routeDestinationLabel: data['label']?.toString() ?? 'End point',
          routeDestinationLatitude: _parseEventCoordinate(data['latitude']),
          routeDestinationLongitude: _parseEventCoordinate(data['longitude']),
          routeDestinationFloorId: data['floorId']?.toString(),
          clearErrorMessage: true,
        );
        _scheduleAutoRoute();
        break;
      case 'routeDestinationCleared':
        state = state.copyWith(
          clearRouteDestination: true,
          clearRouteDestinationLabel: true,
          clearRouteDestinationCoordinates: true,
        );
        break;
      case 'searchResults':
        final results = _repository.parseSearchResults(data['results']);
        if (!state.isMapReady) {
          _pendingSearchResults = results;
          return;
        }
        receiveSearchResults(results);
        break;
      case 'routeDrawn':
        final rawRoute = data['route'];
        if (rawRoute is Map) {
          final routeMap = Map<String, dynamic>.from(rawRoute);
          final diag = routeMap['diagnostics'];
          if (diag is Map) {
            final d = Map<String, dynamic>.from(diag);
            final preview = d['instructionsPreview'];
            MapDiagnosticLogger.routeSuccess(
              destinationName: routeMap['destinationName']?.toString(),
              distanceMeters: d['distance'] as num?,
              durationSeconds: d['duration'] as num?,
              instructionCount: (d['instructionCount'] as num?)?.toInt(),
              coordinateCount: (d['coordinateCount'] as num?)?.toInt(),
              legCount: (routeMap['legs'] is List)
                  ? (routeMap['legs'] as List).length
                  : null,
              instructionsPreview: preview is List
                  ? preview.map((e) => e.toString()).toList()
                  : null,
            );
            MapDiagnosticLogger.routeTargets(
              originCount: (d['originCount'] as num?)?.toInt() ?? 0,
              destinationCount: (d['destinationCount'] as num?)?.toInt() ?? 0,
              origins: (d['origins'] as List?)
                  ?.map((e) => e.toString())
                  .toList(),
              destinations: (d['destinations'] as List?)
                  ?.map((e) => e.toString())
                  .toList(),
            );
          }
        }
        final route = _repository.parseRoute(data['route']);
        if (route != null) {
          onRouteDrawn(route);
        }
        break;
      case 'routeCleared':
        _syncRouteCleared();
        break;
      case 'legSelected':
        onRouteLegChanged(
          (data['legIndex'] as num?)?.toInt() ?? 0,
          instructions: data['instructions']?.toString(),
        );
        break;
    }
  }

  double? _parseEventCoordinate(Object? value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '');
  }
}
