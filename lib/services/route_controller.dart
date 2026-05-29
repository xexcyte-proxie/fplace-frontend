import '../models/indoor_map_models.dart';
import '../services/mappedin_bridge_service.dart';
import '../utils/app_logger.dart';

/// Manages route state and multi-floor leg navigation via Mappedin bridge.
class RouteController {
  RouteController();

  MappedinBridgeService? _bridge;
  IndoorRoute? _route;
  int _currentLegIndex = 0;
  void Function(int legIndex)? onLegChanged;

  IndoorRoute? get route => _route;

  int get currentLegIndex => _currentLegIndex;

  int get legCount => _route?.legs.length ?? 0;

  String get currentLegInstructions {
    final legs = _route?.legs;
    if (legs == null || legs.isEmpty) {
      return '';
    }
    final index = _currentLegIndex.clamp(0, legs.length - 1);
    return legs[index].instructionsText;
  }

  void attachBridge(MappedinBridgeService bridge) {
    _bridge = bridge;
  }

  Future<IndoorRoute> applyRoute(IndoorRoute route) async {
    appLog('Route', 'Route received — ${route.legs.length} leg(s)');
    _route = route;
    _currentLegIndex = 0;
    await _bridge?.selectLeg(_currentLegIndex);
    onLegChanged?.call(_currentLegIndex);
    return route;
  }

  Future<void> selectLeg(int legIndex) async {
    if (_route?.legs == null || _route!.legs.isEmpty) {
      appLog('Route', 'selectLeg($legIndex) skipped — no active route');
      return;
    }

    _currentLegIndex = legIndex.clamp(0, _route!.legs.length - 1);
    appLog(
      'Route',
      'Selecting leg ${_currentLegIndex + 1}/${_route!.legs.length}',
    );
    await _bridge?.selectLeg(_currentLegIndex);
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

  /// Clears local route state only (bridge already cleared).
  void syncRouteCleared() {
    if (_route == null && _currentLegIndex == 0) return;
    appLog('Route', 'Syncing route cleared from map');
    _route = null;
    _currentLegIndex = 0;
  }

  Future<void> clearRoute() async {
    if (_route == null) {
      await _bridge?.clearRoute();
      return;
    }
    appLog('Route', 'Clearing route from map');
    _route = null;
    _currentLegIndex = 0;
    await _bridge?.clearRoute();
  }

  void dispose() {
    appLog('Route', 'RouteController disposed');
    clearRoute();
  }
}
