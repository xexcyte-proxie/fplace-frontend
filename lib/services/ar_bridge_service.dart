import 'dart:convert';

import 'package:mapsindoors_mapbox/mapsindoors.dart';

import '../utils/ar_session_logger.dart';

/// Builds the JSON payload exchanged with the hosted 8th Wall page.
class ArBridgeService {
  const ArBridgeService();

  String buildRoutePayload({
    required MPRoute route,
    required int currentLegIndex,
    required String instructions,
    String? destinationName,
  }) {
    final legs = route.legs ?? const [];
    final maneuvers = <Map<String, dynamic>>[];

    for (var legIndex = 0; legIndex < legs.length; legIndex++) {
      final steps = legs[legIndex].steps ?? const [];
      for (var stepIndex = 0; stepIndex < steps.length; stepIndex++) {
        maneuvers.add({
          'legIndex': legIndex,
          'stepIndex': stepIndex,
          'instruction': steps[stepIndex].maneuver ?? 'Continue',
        });
      }
    }

    final payload = jsonEncode({
      'type': 'route_update',
      'legCount': legs.length,
      'currentLegIndex': currentLegIndex,
      'instructions': instructions,
      'destinationName': destinationName,
      'maneuvers': maneuvers,
      'timestampMs': DateTime.now().millisecondsSinceEpoch,
    });
    ArSessionLogger.log(
      'Payload',
      'Built route_update — legs=${legs.length} '
      'maneuvers=${maneuvers.length} legIndex=$currentLegIndex '
      'chars=${payload.length}',
    );
    return payload;
  }

  String buildStopPayload() {
    ArSessionLogger.log('Payload', 'Built route_stop');
    return jsonEncode({
      'type': 'route_stop',
      'timestampMs': DateTime.now().millisecondsSinceEpoch,
    });
  }
}
