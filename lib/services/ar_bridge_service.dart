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
  }) {
    final body = route.toArJson(
      currentLegIndex: currentLegIndex,
      instructions: instructions,
    );
    if (destinationName != null) {
      body['destinationName'] = destinationName;
    }
    body['mappedinMapId'] = route.mapId ?? AppConfig.mappedinMapId;
    body['timestampMs'] = DateTime.now().millisecondsSinceEpoch;

    final payload = jsonEncode(body);
    ArSessionLogger.log(
      'Payload',
      'Built route_update — path=${route.pathCoordinates.length} pts '
      'maneuvers=${route.maneuvers.length} legIndex=$currentLegIndex '
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
