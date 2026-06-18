import 'dart:convert';

import '../config/app_config.dart';
import '../models/indoor_map_models.dart';
import '../utils/ar_session_logger.dart';

/// Builds the JSON payload exchanged with the hosted 8th Wall / AR page.
class ArBridgeService {
  const ArBridgeService();

  String buildRoutePayload({
    required IndoorRoute route,
    required int currentLegIndex,
    required String instructions,
    String? destinationName,
    Map<String, dynamic>? userPosition,
  }) {
    final body = route.toArJson(
      currentLegIndex: currentLegIndex,
      instructions: instructions,
      userPosition: userPosition,
    );
    if (destinationName != null) {
      body['destinationName'] = destinationName;
    }
    body['mappedinMapId'] = route.mapId ?? AppConfig.mappedinMapId;
    body['timestampMs'] = DateTime.now().millisecondsSinceEpoch;

    final payload = jsonEncode(body);
    ArSessionLogger.log(
      'Payload',
      'Built route_update',
      detail: {
        'pathPoints': route.pathCoordinates.length,
        'maneuvers': route.maneuvers.length,
        'legs': route.legs.length,
        'currentLegIndex': currentLegIndex,
        'distanceMeters': route.distanceMeters,
        'destinationName': route.destinationName ?? destinationName,
        'origin': route.origin?.toJson(),
        'destination': route.destination?.toJson(),
        'userPosition': userPosition,
        'payloadChars': payload.length,
        'mapId': route.mapId ?? AppConfig.mappedinMapId,
        'instructionsPreview': instructions.length > 120
            ? '${instructions.substring(0, 120)}…'
            : instructions,
      },
    );
    return payload;
  }

  String buildPositionPayload({
    required double latitude,
    required double longitude,
    double? heading,
    double? accuracyMeters,
    String? floorId,
  }) {
    return jsonEncode({
      'latitude': latitude,
      'longitude': longitude,
      if (heading != null) 'heading': heading,
      if (accuracyMeters != null) 'accuracy': accuracyMeters,
      if (floorId != null) 'floorId': floorId,
      'source': 'flutter',
      'timestampMs': DateTime.now().millisecondsSinceEpoch,
    });
  }

  String buildStopPayload() {
    ArSessionLogger.log('Payload', 'Built route_stop');
    return jsonEncode({
      'type': 'route_stop',
      'timestampMs': DateTime.now().millisecondsSinceEpoch,
    });
  }
}
