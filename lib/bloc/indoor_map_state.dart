import 'package:mapsindoors_mapbox/mapsindoors.dart';

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
  });

  final IndoorMapStatus status;
  final String? errorMessage;
  final List<MPFloor> availableFloors;
  final MPFloor? currentFloor;
  final MPLocation? selectedLocation;
  final List<MPLocation> searchResults;
  final bool isSearching;
  final MPRoute? activeRoute;
  final int currentLegIndex;
  final String routeInstructions;
  final bool showRouteSheet;
  final bool isArNavigationActive;
  final bool isArSessionReady;
  final String? arStatusMessage;

  bool get isEngineLoaded =>
      status == IndoorMapStatus.engineReady ||
      status == IndoorMapStatus.mapReady;

  bool get isMapReady => status == IndoorMapStatus.mapReady;

  String get loadingMessage {
    switch (status) {
      case IndoorMapStatus.initial:
      case IndoorMapStatus.engineLoading:
        return 'Loading MapsIndoors engine...';
      case IndoorMapStatus.engineReady:
        return 'Initializing Mapbox map...';
      case IndoorMapStatus.engineFailure:
        return errorMessage ?? 'Engine failed to load';
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
    List<MPFloor>? availableFloors,
    MPFloor? currentFloor,
    MPLocation? selectedLocation,
    bool clearSelectedLocation = false,
    List<MPLocation>? searchResults,
    bool? isSearching,
    MPRoute? activeRoute,
    bool clearActiveRoute = false,
    int? currentLegIndex,
    String? routeInstructions,
    bool? showRouteSheet,
    bool? isArNavigationActive,
    bool? isArSessionReady,
    String? arStatusMessage,
    bool clearArStatusMessage = false,
  }) {
    return IndoorMapState(
      status: status ?? this.status,
      errorMessage: errorMessage,
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
    );
  }
}
