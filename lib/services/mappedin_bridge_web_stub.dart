import 'package:flutter/foundation.dart';

/// No-op stub — real implementation is in [mappedin_bridge_web.dart] (web only).
class MappedinBridgeWebHost {
  MappedinBridgeWebHost({
    required this.onMessage,
    this.onIframeLoaded,
  });

  final void Function(String message) onMessage;
  final VoidCallback? onIframeLoaded;

  static const viewType = 'mappedin-map-iframe';

  void registerViewFactory() {}

  Future<void> attach() async {}

  Future<void> invoke(String method, List<dynamic> args) async {
    throw UnsupportedError('MappedinBridgeWebHost is web-only');
  }

  void dispose() {}
}
