import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../config/app_config.dart';
import '../models/indoor_map_models.dart';
import '../utils/map_diagnostic_logger.dart';
import 'mappedin_bridge_web_stub.dart'
    if (dart.library.js_interop) 'mappedin_bridge_web.dart';

typedef MappedinBridgeCallback = void Function(String event, Map<String, dynamic> data);

/// Controls the Mappedin Web SDK (iframe on PWA, InAppWebView on native shells).
class MappedinBridgeService {
  MappedinBridgeService() {
    MapDiagnosticLogger.step(
      'Bridge',
      'MappedinBridgeService created (${kIsWeb ? 'PWA/web' : 'native WebView'})',
    );
  }

  InAppWebViewController? _controller;
  MappedinBridgeWebHost? _webHost;
  final _readyCompleter = Completer<void>();
  bool _bridgeReady = false;
  bool _mapReady = false;
  DateTime? _attachStartedAt;

  MappedinBridgeCallback? onEvent;

  bool get isMapReady => _mapReady;
  bool get isBridgeReady => _bridgeReady;
  bool get isWebHost => kIsWeb;

  /// PWA: register iframe view factory before building [HtmlElementView].
  void prepareWebHost({
    required void Function(String rawMessage) onRawMessage,
    VoidCallback? onIframeLoaded,
  }) {
    if (!kIsWeb) return;
    _webHost = MappedinBridgeWebHost(
      onMessage: onRawMessage,
      onIframeLoaded: onIframeLoaded,
    );
    _webHost!.registerViewFactory();
  }

  String? get webViewType => kIsWeb ? MappedinBridgeWebHost.viewType : null;

  Future<void> attach(InAppWebViewController controller) async {
    if (kIsWeb) {
      throw StateError('attach(InAppWebViewController) is not used on web/PWA');
    }
    _attachStartedAt = DateTime.now();
    _controller = controller;
    MapDiagnosticLogger.step(
      'Bridge',
      'Attaching WebView controller + registering MappedinBridge handler',
    );

    controller.addJavaScriptHandler(
      handlerName: 'MappedinBridge',
      callback: (args) {
        if (args.isEmpty) {
          MapDiagnosticLogger.warn('Bridge', 'Empty message from JavaScript');
          return;
        }
        _handleMessage(args.first.toString());
      },
    );

    await _loadMapHtmlIntoWebView(controller);
  }

  Future<void> attachWeb() async {
    if (!kIsWeb || _webHost == null) {
      throw StateError('Web host not prepared — call prepareWebHost() first');
    }
    _attachStartedAt = DateTime.now();
    MapDiagnosticLogger.step('Bridge', 'Attaching PWA iframe map host');
    await _webHost!.attach();
  }

  Future<void> _loadMapHtmlIntoWebView(InAppWebViewController controller) async {
    MapDiagnosticLogger.step(
      'Bridge',
      'Loading mappedin_map.html from assets '
      '(baseUrl: cdn.jsdelivr.net/@mappedin/mappedin-js@6.19.0/)',
    );

    final html = await rootBundle.loadString('assets/mappedin/mappedin_map.html');
    MapDiagnosticLogger.ok('Bridge', 'HTML asset loaded (${html.length} chars)');

    await controller.loadData(
      data: html,
      baseUrl: WebUri(
        'https://cdn.jsdelivr.net/npm/@mappedin/mappedin-js@6.19.0/',
      ),
      mimeType: 'text/html',
      encoding: 'utf-8',
    );

    final elapsed = DateTime.now().difference(_attachStartedAt!).inMilliseconds;
    MapDiagnosticLogger.ok('Bridge', 'loadData() submitted to WebView (${elapsed}ms)');
  }

  Future<void> waitUntilReady({Duration timeout = const Duration(seconds: 90)}) async {
    if (_bridgeReady) {
      MapDiagnosticLogger.ok('Bridge', 'Already bridge-ready — skipping wait');
      return;
    }

    MapDiagnosticLogger.step(
      'Bridge',
      'Waiting for bridgeReady from JavaScript (timeout ${timeout.inSeconds}s)…',
    );

    try {
      await _readyCompleter.future.timeout(timeout);
      MapDiagnosticLogger.ok('Bridge', 'bridgeReady received 🎯');
    } on TimeoutException {
      MapDiagnosticLogger.error(
        'Bridge',
        'Timed out waiting for bridgeReady',
        detail: 'Check network, CDN access, or JavaScript import map / zod errors',
      );
      rethrow;
    }
  }

  Future<void> _invoke(String method, [List<dynamic> args = const []]) async {
    MapDiagnosticLogger.step('Bridge', 'JS → MappedinMap.$method(${args.length} arg(s))');

    try {
      if (kIsWeb) {
        await _webHost?.invoke(method, args);
      } else {
        final controller = _controller;
        if (controller == null) {
          throw StateError('Mappedin WebView not attached');
        }
        final argsJson = args.map(jsonEncode).join(', ');
        await controller.evaluateJavascript(
          source: 'window.MappedinMap.$method($argsJson);',
        );
      }
      MapDiagnosticLogger.ok('Bridge', 'JS call dispatched: $method()');
    } catch (error) {
      MapDiagnosticLogger.error(
        'Bridge',
        'Failed to dispatch $method()',
        detail: error,
      );
      rethrow;
    }
  }

  Future<void> initializeMap() async {
    await _waitForBridge();

    MapDiagnosticLogger.step(
      'Bridge',
      'Initializing map — venue=${AppConfig.isUsingMappedinDemo ? AppConfig.mappedinDemoVenueName : 'custom'} '
      'mapId=${AppConfig.mappedinMapId} demo=${AppConfig.isUsingMappedinDemo} '
      'key=${AppConfig.mappedinKey.substring(0, 12)}…',
    );

    await _invoke('init', [
      {
        'key': AppConfig.mappedinKey,
        'secret': AppConfig.mappedinSecret,
        'mapId': AppConfig.mappedinMapId,
      },
    ]);
  }

  Future<void> setFloor(String floorId) => _invoke('setFloor', [floorId]);

  Future<void> search(String query, {int limit = 30}) =>
      _invoke('search', [query, limit]);

  Future<void> clearFilter() => _invoke('clearFilter');

  Future<void> highlightResults(List<IndoorLocation> locations) =>
      _invoke('highlightResults', [locations.map((l) => l.toJson()).toList()]);

  Future<void> focusLocation(String locationId) =>
      _invoke('focusLocation', [locationId]);

  Future<void> selectLocation(
    String locationId, {
    required String name,
    String? floorId,
    double? latitude,
    double? longitude,
  }) {
    final options = <String, dynamic>{
      'name': name,
      'destinationName': name,
    };
    if (floorId != null) options['floorId'] = floorId;
    if (latitude != null) options['latitude'] = latitude;
    if (longitude != null) options['longitude'] = longitude;
    return _invoke('selectLocation', [locationId, options]);
  }

  Future<void> clearRouteOrigin() => _invoke('clearRouteOrigin');

  Future<void> clearRouteDestination() => _invoke('clearRouteDestination');

  Future<void> clearRoutePoints() => _invoke('clearRoutePoints');

  Future<void> setRouteMarkerMode(String target) =>
      _invoke('setRouteMarkerMode', [target]);

  Future<void> focusRoutePoint(String which) =>
      _invoke('focusRoutePoint', [which]);

  Future<void> setRoutePlanningPaused(bool paused) =>
      _invoke('setRoutePlanningPaused', [paused]);

  Future<void> drawRouteBetweenMarkedPoints({
    String? destinationName,
    double? originLatitude,
    double? originLongitude,
    String? originFloorId,
    double? destinationLatitude,
    double? destinationLongitude,
    String? destinationFloorId,
  }) {
    final options = <String, dynamic>{};
    if (destinationName != null) {
      options['destinationName'] = destinationName;
    }
    if (originLatitude != null) options['originLatitude'] = originLatitude;
    if (originLongitude != null) options['originLongitude'] = originLongitude;
    if (originFloorId != null) options['originFloorId'] = originFloorId;
    if (destinationLatitude != null) {
      options['destinationLatitude'] = destinationLatitude;
    }
    if (destinationLongitude != null) {
      options['destinationLongitude'] = destinationLongitude;
    }
    if (destinationFloorId != null) {
      options['destinationFloorId'] = destinationFloorId;
    }
    return _invoke('drawRouteBetweenMarkedPoints', [options]);
  }

  Future<void> focusOnUserLocation({
    required double latitude,
    required double longitude,
    String? floorId,
    double? accuracyMeters,
    bool setRouteOrigin = true,
  }) {
    final options = <String, dynamic>{
      'latitude': latitude,
      'longitude': longitude,
      'setRouteOrigin': setRouteOrigin,
    };
    if (floorId != null) options['floorId'] = floorId;
    if (accuracyMeters != null) options['accuracyMeters'] = accuracyMeters;
    return _invoke('focusOnUserLocation', [options]);
  }

  Future<void> drawRoute({
    required String originId,
    required String destinationId,
  }) =>
      _invoke('drawRoute', [originId, destinationId]);

  Future<void> drawSampleRoute() => _invoke('drawSampleRoute');

  Future<void> drawRouteToLocation(
    String destinationId, {
    required String destinationName,
    double? destinationLatitude,
    double? destinationLongitude,
    String? destinationFloorId,
    double? originLatitude,
    double? originLongitude,
    String? originFloorId,
  }) {
    final options = <String, dynamic>{
      'destinationName': destinationName,
    };
    if (destinationLatitude != null) {
      options['destinationLatitude'] = destinationLatitude;
    }
    if (destinationLongitude != null) {
      options['destinationLongitude'] = destinationLongitude;
    }
    if (destinationFloorId != null) {
      options['destinationFloorId'] = destinationFloorId;
    }
    if (originLatitude != null) {
      options['originLatitude'] = originLatitude;
    }
    if (originLongitude != null) {
      options['originLongitude'] = originLongitude;
    }
    if (originFloorId != null) {
      options['originFloorId'] = originFloorId;
    }

    return _invoke('drawRouteToLocation', [destinationId, options]);
  }

  Future<void> clearRoute() => _invoke('clearRoute');

  Future<void> selectLeg(int legIndex) => _invoke('selectLeg', [legIndex]);

  Future<void> deselectLocation() => _invoke('deselectLocation');

  void handleRawMessage(String raw) => _handleMessage(raw);

  Future<void> _waitForBridge() async {
    if (_bridgeReady) return;
    await waitUntilReady();
  }

  void logWebViewConsole(String level, String message) {
    final normalized = message.trim();
    if (normalized.isEmpty) return;

    if (level.contains('ERROR') || normalized.toLowerCase().contains('error')) {
      MapDiagnosticLogger.error('WebViewConsole', normalized);
    } else if (level.contains('WARN') || normalized.toLowerCase().contains('warning')) {
      MapDiagnosticLogger.warn('WebViewConsole', normalized);
    } else {
      MapDiagnosticLogger.js('Console', normalized);
    }
  }

  void logWebViewError(String source, String message) {
    MapDiagnosticLogger.error('WebView', '$source — $message');
  }

  void logWebViewProgress(int progress) {
    if (progress == 0 || progress == 100 || progress % 25 == 0) {
      MapDiagnosticLogger.step('WebView', 'Loading progress: $progress%');
    }
  }

  void dispose() {
    _webHost?.dispose();
  }

  void _handleMessage(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) {
        MapDiagnosticLogger.warn('Bridge', 'Non-object JSON from JS: $raw');
        return;
      }

      final event = decoded['event']?.toString() ?? '';
      MapDiagnosticLogger.bridgeEvent(event, decoded);

      switch (event) {
        case 'debug':
          MapDiagnosticLogger.js(
            decoded['step']?.toString() ?? 'debug',
            decoded['message']?.toString() ?? '',
            detail: decoded['detail']?.toString(),
          );
          return;
        case 'bridgeReady':
          _bridgeReady = true;
          if (_attachStartedAt != null) {
            final ms = DateTime.now().difference(_attachStartedAt!).inMilliseconds;
            MapDiagnosticLogger.ok('Bridge', 'JavaScript bridge ready in ${ms}ms 🔗');
          }
          if (!_readyCompleter.isCompleted) {
            _readyCompleter.complete();
          }
          return;
        case 'ready':
          _mapReady = true;
          final floors = decoded['floors'];
          final floorCount = floors is List ? floors.length : 0;
          MapDiagnosticLogger.ok(
            'Bridge',
            'Map rendered! floors=$floorCount mapName=${decoded['mapName']}',
          );
          break;
        case 'error':
          MapDiagnosticLogger.error(
            'Bridge',
            decoded['message']?.toString() ?? 'Unknown JavaScript error',
            detail: decoded['stack'] ?? decoded['phase'],
          );
          if (!_readyCompleter.isCompleted) {
            _readyCompleter.complete();
          }
          break;
      }

      onEvent?.call(event, decoded);
    } catch (error, stackTrace) {
      MapDiagnosticLogger.error(
        'Bridge',
        'Failed to parse bridge message',
        detail: '$error\n$stackTrace\nraw=$raw',
      );
    }
  }
}
