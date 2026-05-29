import 'package:mapsindoors_mapbox/mapsindoors.dart';

import '../utils/app_logger.dart';

/// Manages route rendering and multi-floor leg navigation.
class RouteController {
  RouteController() {
    appLog('Route', 'RouteController created');
  }

  final MPDirectionsService _directionsService = MPDirectionsService();
  final MPDirectionsRenderer _directionsRenderer = MPDirectionsRenderer();

  MPRoute? _route;
  int _currentLegIndex = 0;
  void Function(int legIndex)? onLegChanged;

  MPRoute? get route => _route;

  int get currentLegIndex => _currentLegIndex;

  int get legCount => _route?.legs?.length ?? 0;

  String get currentLegInstructions {
    final legs = _route?.legs;
    if (legs == null || legs.isEmpty) {
      return '';
    }

    final index = _currentLegIndex.clamp(0, legs.length - 1);
    final steps = legs[index].steps;
    if (steps == null || steps.isEmpty) {
      return 'Continue on current floor';
    }

    return steps.map((step) => step.maneuver ?? 'Continue').join(', ');
  }

  Future<MPRoute> generateRoute({
    required MPPoint origin,
    required MPPoint destination,
  }) async {
    appLog(
      'Route',
      'Generating route from floor ${origin.floorIndex} to floor ${destination.floorIndex}',
    );
    await _directionsService.setTravelMode(MPDirectionsService.travelModeWalking);
    final route = await _directionsService.getRoute(
      origin: origin,
      destination: destination,
    );

    _route = route;
    _currentLegIndex = 0;
    appLog('Route', 'Route received — ${route.legs?.length ?? 0} leg(s), rendering on map');
    await _directionsRenderer.setRoute(route);
    _directionsRenderer.setOnLegSelectedListener(_handleLegSelected);
    await _directionsRenderer.selectLegIndex(_currentLegIndex);
    appLog('Route', 'Displaying leg 1/${route.legs?.length ?? 0}: $currentLegInstructions');
    onLegChanged?.call(_currentLegIndex);
    return route;
  }

  Future<void> selectLeg(int legIndex) async {
    if (_route?.legs == null || _route!.legs!.isEmpty) {
      appLog('Route', 'selectLeg($legIndex) skipped — no active route');
      return;
    }

    _currentLegIndex = legIndex.clamp(0, _route!.legs!.length - 1);
    appLog(
      'Route',
      'Selecting leg ${_currentLegIndex + 1}/${_route!.legs!.length} — focusing viewport',
    );
    await _directionsRenderer.selectLegIndex(_currentLegIndex);
    appLog('Route', 'Leg instructions: $currentLegInstructions');
    onLegChanged?.call(_currentLegIndex);
  }

  Future<void> previousLeg() {
    appLog('Route', 'Previous leg requested (current: $_currentLegIndex)');
    return selectLeg(_currentLegIndex - 1);
  }

  Future<void> nextLeg() {
    appLog('Route', 'Next leg requested (current: $_currentLegIndex)');
    return selectLeg(_currentLegIndex + 1);
  }

  void clearRoute() {
    appLog('Route', 'Clearing route from map');
    _directionsRenderer.clear();
    _route = null;
    _currentLegIndex = 0;
  }

  void dispose() {
    appLog('Route', 'RouteController disposed');
    clearRoute();
  }

  void _handleLegSelected(int legIndex) {
    if (_route?.legs == null || _route!.legs!.isEmpty) {
      return;
    }

    appLog('Route', 'Leg selected via map tap: $legIndex');
    _currentLegIndex = legIndex.clamp(0, _route!.legs!.length - 1);
    onLegChanged?.call(_currentLegIndex);
  }
}
