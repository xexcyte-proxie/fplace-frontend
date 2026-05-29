import '../models/indoor_map_models.dart';

enum IndoorMapStatus {
  initial,
  engineLoading,
  engineReady,
  engineFailure,
  mapReady,
}

class IndoorMapState {
  const IndoorMapState({
    this.status = IndoorMapStatus.initial,
    this.errorMessage,
    this.availableFloors = const [],
    this.currentFloor,
    this.selectedLocation,
    this.searchResults = const [],
    this.isSearching = false,
    this.activeRoute,
    this.currentLegIndex = 0,
    this.routeInstructions = '',
    this.showRouteSheet = false,
    this.isArNavigationActive = false,
    this.isArSessionReady = false,
    this.arStatusMessage,
    this.hasRouteOrigin = false,
    this.hasRouteDestination = false,
    this.isCalculatingRoute = false,
    this.routeDestinationLabel,
  });

  final IndoorMapStatus status;
  final String? errorMessage;
  final List<IndoorFloor> availableFloors;
  final IndoorFloor? currentFloor;
  final IndoorLocation? selectedLocation;
  final List<IndoorLocation> searchResults;
  final bool isSearching;
  final IndoorRoute? activeRoute;
  final int currentLegIndex;
  final String routeInstructions;
  final bool showRouteSheet;
  final bool isArNavigationActive;
  final bool isArSessionReady;
  final String? arStatusMessage;
  /// True after the user taps the map to set a route start (green marker).
  final bool hasRouteOrigin;
  /// True after the user taps the map or picks a POI as end (red marker).
  final bool hasRouteDestination;
  /// Shown while auto-generating directions after both points are set.
  final bool isCalculatingRoute;
  /// Display label for the end point (POI name or "End point").
  final String? routeDestinationLabel;

  bool get canGenerateRoute => hasRouteOrigin && hasRouteDestination;

  String get routePlanningHint {
    if (isCalculatingRoute) return 'Finding route…';
    if (!hasRouteOrigin) return 'Tap the map — where are you?';
    if (!hasRouteDestination) return 'Tap the map — where are you going?';
    return 'Route ready';
  }

  bool get isEngineLoaded =>
      status == IndoorMapStatus.engineReady ||
      status == IndoorMapStatus.mapReady;

  bool get isMapReady => status == IndoorMapStatus.mapReady;

  String get loadingMessage {
    switch (status) {
      case IndoorMapStatus.initial:
      case IndoorMapStatus.engineLoading:
        return 'Loading Mappedin Demo Mall...';
      case IndoorMapStatus.engineReady:
        return 'Initializing 3D map view...';
      case IndoorMapStatus.engineFailure:
        return errorMessage ?? 'Map failed to load';
      case IndoorMapStatus.mapReady:
        return 'Ready';
    }
  }

  @override
  String toString() =>
      'IndoorMapState(status: $status, floors: ${availableFloors.length}, '
      'currentFloor: ${currentFloor?.displayName}, '
      'searchResults: ${searchResults.length}, '
      'selected: ${selectedLocation?.name}, '
      'route: ${activeRoute != null}, '
      'ar: $isArNavigationActive/$isArSessionReady)';

  IndoorMapState copyWith({
    IndoorMapStatus? status,
    String? errorMessage,
    List<IndoorFloor>? availableFloors,
    IndoorFloor? currentFloor,
    IndoorLocation? selectedLocation,
    bool clearSelectedLocation = false,
    List<IndoorLocation>? searchResults,
    bool? isSearching,
    IndoorRoute? activeRoute,
    bool clearActiveRoute = false,
    int? currentLegIndex,
    String? routeInstructions,
    bool? showRouteSheet,
    bool? isArNavigationActive,
    bool? isArSessionReady,
    String? arStatusMessage,
    bool clearArStatusMessage = false,
    bool clearErrorMessage = false,
    bool? hasRouteOrigin,
    bool clearRouteOrigin = false,
    bool? hasRouteDestination,
    bool clearRouteDestination = false,
    bool? isCalculatingRoute,
    String? routeDestinationLabel,
    bool clearRouteDestinationLabel = false,
  }) {
    return IndoorMapState(
      status: status ?? this.status,
      errorMessage:
          clearErrorMessage ? null : (errorMessage ?? this.errorMessage),
      availableFloors: availableFloors ?? this.availableFloors,
      currentFloor: currentFloor ?? this.currentFloor,
      selectedLocation: clearSelectedLocation
          ? null
          : selectedLocation ?? this.selectedLocation,
      searchResults: searchResults ?? this.searchResults,
      isSearching: isSearching ?? this.isSearching,
      activeRoute:
          clearActiveRoute ? null : activeRoute ?? this.activeRoute,
      currentLegIndex: currentLegIndex ?? this.currentLegIndex,
      routeInstructions: routeInstructions ?? this.routeInstructions,
      showRouteSheet: showRouteSheet ?? this.showRouteSheet,
      isArNavigationActive: isArNavigationActive ?? this.isArNavigationActive,
      isArSessionReady: isArSessionReady ?? this.isArSessionReady,
      arStatusMessage: clearArStatusMessage
          ? null
          : arStatusMessage ?? this.arStatusMessage,
      hasRouteOrigin:
          clearRouteOrigin ? false : (hasRouteOrigin ?? this.hasRouteOrigin),
      hasRouteDestination: clearRouteDestination
          ? false
          : (hasRouteDestination ?? this.hasRouteDestination),
      isCalculatingRoute: isCalculatingRoute ?? this.isCalculatingRoute,
      routeDestinationLabel: clearRouteDestinationLabel
          ? null
          : (routeDestinationLabel ?? this.routeDestinationLabel),
    );
  }
}
