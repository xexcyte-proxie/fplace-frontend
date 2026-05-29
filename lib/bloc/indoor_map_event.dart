import 'package:mapsindoors_mapbox/mapsindoors.dart';

sealed class IndoorMapEvent {
  const IndoorMapEvent();
}

final class InitializeEngine extends IndoorMapEvent {
  const InitializeEngine();
}

final class MapControlReady extends IndoorMapEvent {
  const MapControlReady(this.error, this.mapControl);

  final MPError? error;
  final MapsIndoorsWidget mapControl;
}

final class FloorSelected extends IndoorMapEvent {
  const FloorSelected(this.floor);

  final MPFloor floor;
}

final class FloorUpdated extends IndoorMapEvent {
  const FloorUpdated(this.floorIndex);

  final int floorIndex;
}

final class LocationSelected extends IndoorMapEvent {
  const LocationSelected(this.location);

  final MPLocation? location;
}

final class SearchSubmitted extends IndoorMapEvent {
  const SearchSubmitted(this.query);

  final String query;
}

final class SearchResultSelected extends IndoorMapEvent {
  const SearchResultSelected(this.location);

  final MPLocation location;
}

final class GenerateSampleRoute extends IndoorMapEvent {
  const GenerateSampleRoute();
}

final class RouteToSelectedLocation extends IndoorMapEvent {
  const RouteToSelectedLocation();
}

final class RouteLegChanged extends IndoorMapEvent {
  const RouteLegChanged(this.legIndex);

  final int legIndex;
}

final class RoutePreviousLeg extends IndoorMapEvent {
  const RoutePreviousLeg();
}

final class RouteNextLeg extends IndoorMapEvent {
  const RouteNextLeg();
}

final class ClearRoute extends IndoorMapEvent {
  const ClearRoute();
}

final class DismissLocationDetail extends IndoorMapEvent {
  const DismissLocationDetail();
}

final class OpenArNavigation extends IndoorMapEvent {
  const OpenArNavigation();
}

final class CloseArNavigation extends IndoorMapEvent {
  const CloseArNavigation();
}

final class ArSessionReadyChanged extends IndoorMapEvent {
  const ArSessionReadyChanged(this.isReady);

  final bool isReady;
}

final class ArStatusUpdated extends IndoorMapEvent {
  const ArStatusUpdated(this.message);

  final String message;
}
