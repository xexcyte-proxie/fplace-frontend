import 'package:flutter/foundation.dart';

/// Detailed emoji-rich logging for the Mappedin map load pipeline.
class MapDiagnosticLogger {
  MapDiagnosticLogger._();

  static void step(String tag, String message) {
    _print(tag, '▶️', message);
  }

  static void ok(String tag, String message) {
    _print(tag, '✅', message);
  }

  static void warn(String tag, String message) {
    _print(tag, '⚠️', message);
  }

  static void error(String tag, String message, {Object? detail}) {
    _print(tag, '❌', message);
    if (detail != null) {
      debugPrint('[Fplaces/🗺️ $tag]    ↳ $detail');
    }
  }

  static void js(String step, String message, {String? detail}) {
    _print('JS/$step', '🌐', message);
    if (detail != null && detail.isNotEmpty) {
      debugPrint('[Fplaces/🗺️ JS/$step]    ↳ $detail');
    }
  }

  static void bridgeEvent(String event, Map<String, dynamic> data) {
    final emoji = switch (event) {
      'bridgeReady' => '🔗',
      'ready' => '🎉',
      'error' => '💥',
      'debug' => '🔍',
      'floorChanged' => '🏢',
      'locationSelected' => '📍',
      'searchResults' => '🔎',
      'routeDrawn' => '🛤️',
      'routeOriginSet' => '📍',
      'routeOriginCleared' => '📍',
      'routeCleared' => '🧹',
      'legSelected' => '👣',
      _ => '📨',
    };
    _print('Bridge', emoji, 'event=$event data=$data');
  }

  static void stateTransition(String from, String to, {String? reason}) {
    final extra = reason == null ? '' : ' — $reason';
    _print('State', '🔄', '$from → $to$extra');
  }

  static void routeStep(String message, {String? detail}) {
    _print('Route', '🛤️', message);
    if (detail != null && detail.isNotEmpty) {
      debugPrint('[Fplaces/🗺️ Route]    ↳ $detail');
    }
  }

  static void routeTargets({
    required int originCount,
    required int destinationCount,
    List<String>? origins,
    List<String>? destinations,
  }) {
    routeStep(
      'Endpoints resolved — origins=$originCount destinations=$destinationCount',
    );
    if (origins != null && origins.isNotEmpty) {
      for (var i = 0; i < origins.length; i++) {
        debugPrint('[Fplaces/🗺️ Route]    origin[$i] ${origins[i]}');
      }
    }
    if (destinations != null && destinations.isNotEmpty) {
      for (var i = 0; i < destinations.length; i++) {
        debugPrint('[Fplaces/🗺️ Route]    destination[$i] ${destinations[i]}');
      }
    }
  }

  static void routeSuccess({
    String? destinationName,
    num? distanceMeters,
    num? durationSeconds,
    int? instructionCount,
    int? coordinateCount,
    int? legCount,
    List<String>? instructionsPreview,
  }) {
    ok('Route', 'Directions received — drawing on map');
    if (destinationName != null) {
      debugPrint('[Fplaces/🗺️ Route]    destination: $destinationName');
    }
    if (distanceMeters != null) {
      debugPrint(
        '[Fplaces/🗺️ Route]    distance: ${distanceMeters.toStringAsFixed(1)} m',
      );
    }
    if (durationSeconds != null) {
      debugPrint(
        '[Fplaces/🗺️ Route]    duration: ${durationSeconds.toStringAsFixed(0)} s',
      );
    }
    if (instructionCount != null) {
      debugPrint('[Fplaces/🗺️ Route]    instructions: $instructionCount');
    }
    if (coordinateCount != null) {
      debugPrint('[Fplaces/🗺️ Route]    path coordinates: $coordinateCount');
    }
    if (legCount != null) {
      debugPrint('[Fplaces/🗺️ Route]    legs: $legCount');
    }
    if (instructionsPreview != null) {
      for (var i = 0; i < instructionsPreview.length; i++) {
        debugPrint(
          '[Fplaces/🗺️ Route]    step[$i] ${instructionsPreview[i]}',
        );
      }
    }
  }

  static void routeFailure(String message, {Object? detail}) {
    error('Route', message, detail: detail);
  }

  static void _print(String tag, String emoji, String message) {
    debugPrint('[Fplaces/🗺️ $tag] $emoji $message');
  }
}
