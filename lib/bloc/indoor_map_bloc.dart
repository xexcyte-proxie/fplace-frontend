import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mapsindoors_mapbox/mapsindoors.dart';

import '../config/app_config.dart';
import '../repository/indoor_map_repository.dart';
import '../services/route_controller.dart';
import '../utils/app_logger.dart';
import '../utils/ar_session_logger.dart';
import 'indoor_map_event.dart';
import 'indoor_map_state.dart';

class IndoorMapBloc extends Bloc<IndoorMapEvent, IndoorMapState> {
  IndoorMapBloc({
    required IndoorMapRepository repository,
    required RouteController routeController,
    MPPoint? sampleOrigin,
  })  : _repository = repository,
        _routeController = routeController,
        _sampleOrigin = sampleOrigin ??
            MPPoint.withCoordinates(
              // White House demo entrance — matches the loaded sandbox dataset.
              longitude: -77.03741,
              latitude: 38.897389,
              floorIndex: 0,
            ),
        super(const IndoorMapState()) {
    appLog('Bloc', 'IndoorMapBloc constructed (sample origin: $_sampleOrigin)');
    on<InitializeEngine>(_onInitializeEngine);
    on<MapControlReady>(_onMapControlReady);
    on<FloorSelected>(_onFloorSelected);
    on<FloorUpdated>(_onFloorUpdated);
    on<LocationSelected>(_onLocationSelected);
    on<SearchSubmitted>(_onSearchSubmitted);
    on<SearchResultSelected>(_onSearchResultSelected);
    on<GenerateSampleRoute>(_onGenerateSampleRoute);
    on<RouteToSelectedLocation>(_onRouteToSelectedLocation);
    on<RouteLegChanged>(_onRouteLegChanged);
    on<RoutePreviousLeg>(_onRoutePreviousLeg);
    on<RouteNextLeg>(_onRouteNextLeg);
    on<ClearRoute>(_onClearRoute);
    on<DismissLocationDetail>(_onDismissLocationDetail);
    on<OpenArNavigation>(_onOpenArNavigation);
    on<CloseArNavigation>(_onCloseArNavigation);
    on<ArSessionReadyChanged>(_onArSessionReadyChanged);
    on<ArStatusUpdated>(_onArStatusUpdated);

    _routeController.onLegChanged = (legIndex) {
      appLog('Bloc', 'RouteController leg changed callback → leg $legIndex');
      add(RouteLegChanged(legIndex));
    };
  }

  final IndoorMapRepository _repository;
  final RouteController _routeController;
  final MPPoint _sampleOrigin;

  MapsIndoorsWidget? _mapControl;

  @override
  Future<void> close() {
    appLog('Bloc', 'IndoorMapBloc closing');
    _routeController.dispose();
    return super.close();
  }

  Future<void> _onInitializeEngine(
    InitializeEngine event,
    Emitter<IndoorMapState> emit,
  ) async {
    appLog('Bloc', 'InitializeEngine — loading sandbox ${AppConfig.sandboxSolutionId}');
    emit(state.copyWith(status: IndoorMapStatus.engineLoading));

    try {
      final error = await _repository.initializeEngine(
        AppConfig.sandboxSolutionId,
      );

      if (error != null) {
        appLog('Bloc', 'Engine load returned error: $error');
        emit(
          state.copyWith(
            status: IndoorMapStatus.engineFailure,
            errorMessage: error.toString(),
          ),
        );
        return;
      }

      appLog('Bloc', 'Engine ready — waiting for MapControl');
      emit(state.copyWith(status: IndoorMapStatus.engineReady));
    } catch (error, stackTrace) {
      appLog('Bloc', 'Fatal engine init: $error');
      debugPrint(stackTrace.toString());
      emit(
        state.copyWith(
          status: IndoorMapStatus.engineFailure,
          errorMessage: error.toString(),
        ),
      );
    }
  }

  Future<void> _onMapControlReady(
    MapControlReady event,
    Emitter<IndoorMapState> emit,
  ) async {
    appLog('Bloc', 'MapControlReady — error: ${event.error}');
    if (event.error != null) {
      appLog('Bloc', 'MapControl failed: ${event.error}');
      emit(
        state.copyWith(
          status: IndoorMapStatus.engineFailure,
          errorMessage: event.error.toString(),
        ),
      );
      return;
    }

    _mapControl = event.mapControl;
    appLog('Bloc', 'Registering location + floor listeners on MapControl');

    event.mapControl
      ..setOnLocationSelectedListener(_handleLocationSelected, false)
      ..addOnFloorUpdateListener(_handleFloorUpdated);

    appLog('Bloc', 'Focusing indoor venue/building after map layout');
    final focus = await _repository.focusIndoorMap(event.mapControl);
    final building = focus.building;
    final currentFloor = focus.floor;
    final floors = building?.floors ?? const [];

    appLog(
      'Bloc',
      'Map ready — ${floors.length} floor(s), current: ${currentFloor?.displayName}, '
      'building: ${building?.name}',
    );

    emit(
      state.copyWith(
        status: IndoorMapStatus.mapReady,
        availableFloors: floors,
        currentFloor: currentFloor,
      ),
    );
  }

  Future<void> _onFloorSelected(
    FloorSelected event,
    Emitter<IndoorMapState> emit,
  ) async {
    appLog(
      'Bloc',
      'FloorSelected — ${event.floor.displayName} (index ${event.floor.floorIndex})',
    );
    final mapControl = _mapControl;
    if (mapControl == null) {
      appLog('Bloc', 'FloorSelected ignored — MapControl not attached');
      return;
    }

    await mapControl.selectFloor(event.floor.floorIndex);
    appLog('Bloc', 'Floor switched to ${event.floor.displayName}');
    emit(state.copyWith(currentFloor: event.floor));
  }

  void _onFloorUpdated(
    FloorUpdated event,
    Emitter<IndoorMapState> emit,
  ) {
    appLog('Bloc', 'FloorUpdated from SDK — index ${event.floorIndex}');
    if (state.availableFloors.isEmpty) {
      appLog('Bloc', 'FloorUpdated ignored — no floors loaded yet');
      return;
    }

    final floor = state.availableFloors.firstWhere(
      (candidate) => candidate.floorIndex == event.floorIndex,
      orElse: () => state.currentFloor ?? state.availableFloors.first,
    );

    appLog('Bloc', 'Floor synced to ${floor.displayName}');
    emit(state.copyWith(currentFloor: floor));
  }

  void _onLocationSelected(
    LocationSelected event,
    Emitter<IndoorMapState> emit,
  ) {
    if (event.location == null) {
      appLog('Bloc', 'LocationSelected — deselected (null)');
      emit(
        state.copyWith(
          clearSelectedLocation: true,
          showRouteSheet: state.activeRoute != null,
        ),
      );
      return;
    }

    appLog(
      'Bloc',
      'LocationSelected — "${event.location!.name}" '
      '(${event.location!.buildingName}, ${event.location!.floorName})',
    );
    _routeController.clearRoute();
    emit(
      state.copyWith(
        selectedLocation: event.location,
        clearActiveRoute: true,
        showRouteSheet: false,
        routeInstructions: '',
        currentLegIndex: 0,
      ),
    );
  }

  Future<void> _onSearchSubmitted(
    SearchSubmitted event,
    Emitter<IndoorMapState> emit,
  ) async {
    appLog('Bloc', 'SearchSubmitted — "${event.query}"');
    final mapControl = _mapControl;
    if (mapControl == null) {
      appLog('Bloc', 'Search ignored — MapControl not attached');
      return;
    }

    if (event.query.trim().isEmpty) {
      appLog('Bloc', 'Empty search — clearing filter');
      await mapControl.clearFilter();
      emit(
        state.copyWith(
          searchResults: const [],
          isSearching: false,
        ),
      );
      return;
    }

    emit(state.copyWith(isSearching: true));

    try {
      final results = await _repository.searchLocations(event.query);
      if (results.isNotEmpty) {
        appLog('Bloc', 'Applying map filter for ${results.length} result(s)');
        await mapControl.setFilterWithLocations(
          results,
          MPFilterBehavior.DEFAULT,
        );
      } else {
        appLog('Bloc', 'No results — clearing map filter');
        await mapControl.clearFilter();
      }

      emit(
        state.copyWith(
          searchResults: results,
          isSearching: false,
        ),
      );
    } catch (error) {
      appLog('Bloc', 'Search failed: $error');
      emit(
        state.copyWith(
          isSearching: false,
          errorMessage: error.toString(),
        ),
      );
    }
  }

  Future<void> _onSearchResultSelected(
    SearchResultSelected event,
    Emitter<IndoorMapState> emit,
  ) async {
    appLog('Bloc', 'SearchResultSelected — "${event.location.name}"');
    final mapControl = _mapControl;
    if (mapControl == null) {
      appLog('Bloc', 'Search result ignored — MapControl not attached');
      return;
    }

    await mapControl.selectLocation(event.location);
    add(LocationSelected(event.location));
  }

  Future<void> _onGenerateSampleRoute(
    GenerateSampleRoute event,
    Emitter<IndoorMapState> emit,
  ) async {
    appLog('Bloc', 'GenerateSampleRoute — querying "Meeting Room" locations');
    try {
      final locations = await _repository.findLocationsByQuery('Meeting Room');
      if (locations.length < 2) {
        appLog(
          'Bloc',
          'Sample route aborted — need 2+ meeting rooms, found ${locations.length}',
        );
        return;
      }

      appLog(
        'Bloc',
        'Sample route: "${locations.first.name}" → "${locations.last.name}"',
      );
      await _displayRoute(
        emit: emit,
        origin: locations.first.point,
        destination: locations.last.point,
      );
    } catch (error) {
      appLog('Bloc', 'Sample route failed: $error');
      emit(state.copyWith(errorMessage: error.toString()));
    }
  }

  Future<void> _onRouteToSelectedLocation(
    RouteToSelectedLocation event,
    Emitter<IndoorMapState> emit,
  ) async {
    final destination = state.selectedLocation;
    if (destination == null) {
      appLog('Bloc', 'RouteToSelectedLocation ignored — no selected location');
      return;
    }

    appLog('Bloc', 'Routing to selected location "${destination.name}"');
    try {
      await _displayRoute(
        emit: emit,
        origin: _sampleOrigin,
        destination: destination.point,
      );
    } catch (error) {
      appLog('Bloc', 'Route to location failed: $error');
      emit(state.copyWith(errorMessage: error.toString()));
    }
  }

  Future<void> _displayRoute({
    required Emitter<IndoorMapState> emit,
    required MPPoint origin,
    required MPPoint destination,
  }) async {
    appLog('Bloc', 'Displaying route on map');
    final route = await _routeController.generateRoute(
      origin: origin,
      destination: destination,
    );

    appLog(
      'Bloc',
      'Route active — ${route.legs?.length ?? 0} leg(s), showing bottom sheet',
    );
    emit(
      state.copyWith(
        activeRoute: route,
        showRouteSheet: true,
        currentLegIndex: _routeController.currentLegIndex,
        routeInstructions: _routeController.currentLegInstructions,
        clearSelectedLocation: true,
      ),
    );
  }

  void _onRouteLegChanged(
    RouteLegChanged event,
    Emitter<IndoorMapState> emit,
  ) {
    appLog('Bloc', 'RouteLegChanged — leg ${event.legIndex + 1}');
    emit(
      state.copyWith(
        currentLegIndex: event.legIndex,
        routeInstructions: _routeController.currentLegInstructions,
      ),
    );
  }

  Future<void> _onRoutePreviousLeg(
    RoutePreviousLeg event,
    Emitter<IndoorMapState> emit,
  ) async {
    appLog('Bloc', 'RoutePreviousLeg');
    await _routeController.previousLeg();
    emit(
      state.copyWith(
        currentLegIndex: _routeController.currentLegIndex,
        routeInstructions: _routeController.currentLegInstructions,
      ),
    );
  }

  Future<void> _onRouteNextLeg(
    RouteNextLeg event,
    Emitter<IndoorMapState> emit,
  ) async {
    appLog('Bloc', 'RouteNextLeg');
    await _routeController.nextLeg();
    emit(
      state.copyWith(
        currentLegIndex: _routeController.currentLegIndex,
        routeInstructions: _routeController.currentLegInstructions,
      ),
    );
  }

  void _onClearRoute(
    ClearRoute event,
    Emitter<IndoorMapState> emit,
  ) {
    appLog('Bloc', 'ClearRoute');
    _routeController.clearRoute();
    emit(
      state.copyWith(
        clearActiveRoute: true,
        showRouteSheet: false,
        routeInstructions: '',
        currentLegIndex: 0,
      ),
    );
  }

  void _onDismissLocationDetail(
    DismissLocationDetail event,
    Emitter<IndoorMapState> emit,
  ) {
    appLog('Bloc', 'DismissLocationDetail');
    _mapControl?.selectLocation(null);
    emit(state.copyWith(clearSelectedLocation: true));
  }

  void _onOpenArNavigation(
    OpenArNavigation event,
    Emitter<IndoorMapState> emit,
  ) {
    ArSessionLogger.log('Bloc', 'OpenArNavigation — state.isArNavigationActive=true');
    emit(
      state.copyWith(
        isArNavigationActive: true,
        isArSessionReady: false,
        clearArStatusMessage: true,
      ),
    );
  }

  void _onCloseArNavigation(
    CloseArNavigation event,
    Emitter<IndoorMapState> emit,
  ) {
    ArSessionLogger.log('Bloc', 'CloseArNavigation — state.isArNavigationActive=false');
    emit(
      state.copyWith(
        isArNavigationActive: false,
        isArSessionReady: false,
      ),
    );
  }

  void _onArSessionReadyChanged(
    ArSessionReadyChanged event,
    Emitter<IndoorMapState> emit,
  ) {
    ArSessionLogger.log('Bloc', 'ArSessionReadyChanged — isReady=${event.isReady}');
    emit(state.copyWith(isArSessionReady: event.isReady));
  }

  void _onArStatusUpdated(
    ArStatusUpdated event,
    Emitter<IndoorMapState> emit,
  ) {
    ArSessionLogger.log('Bloc', 'ArStatusUpdated — ${event.message}');
    emit(state.copyWith(arStatusMessage: event.message));
  }

  void _handleLocationSelected(MPLocation? location) {
    appLog(
      'Map',
      'onLocationSelected listener fired — ${location?.name ?? 'null'}',
    );
    add(LocationSelected(location));
  }

  void _handleFloorUpdated(int floorIndex) {
    appLog('Map', 'onFloorUpdate listener fired — index $floorIndex');
    add(FloorUpdated(floorIndex));
  }
}
