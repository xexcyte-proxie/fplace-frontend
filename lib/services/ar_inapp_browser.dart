import 'dart:async';
import 'dart:collection';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart' as url_launcher;

import '../config/app_config.dart';
import '../utils/ar_session_logger.dart';
import 'ar_bridge_service.dart';
import 'ar_permissions.dart';

const _bridgeShimScript = '''
  (function() {
    if (window.__fplacesBridgeShim) return;
    window.__fplacesBridgeShim = true;
    window.ArBridge = window.ArBridge || {
      postMessage: function(message) {
        if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
          window.flutter_inappwebview.callHandler('ArBridge', message);
        }
      }
    };
  })();
''';

/// Builds the AR page URL with the full Mappedin route payload.
///
/// On web, the polyline is sent in the URL fragment (base64) to avoid query length limits.
String buildArLaunchUrl({
  required String routePayload,
  required String instructions,
}) {
  final base = Uri.parse(AppConfig.eighthWallArUrl);
  final query = <String, String>{
    ...base.queryParameters,
    if (instructions.isNotEmpty) 'fplacesInstructions': instructions,
    'arDebug': '1',
    'arPanel': '1',
  };

  late final String url;
  if (kIsWeb) {
    final encoded = base64Url.encode(utf8.encode(routePayload));
    url = base.replace(queryParameters: query, fragment: 'route=$encoded').toString();
  } else {
    url = base
        .replace(
          queryParameters: {
            ...query,
            'fplacesRoute': routePayload,
          },
        )
        .toString();
  }

  ArSessionLogger.log(
    'URL',
    'Built AR launch URL',
    detail: {
      'base': AppConfig.eighthWallArUrl,
      'platform': kIsWeb ? 'web-PWA' : 'native',
      'urlChars': url.length,
      'routePayloadChars': routePayload.length,
      'transport': kIsWeb ? 'hash-base64' : 'query-fplacesRoute',
      'arDebug': true,
    },
  );
  return url;
}

class _ArChromeSafariBrowser extends ChromeSafariBrowser {
  final Completer<void> _closedCompleter = Completer<void>();

  Future<void> waitUntilClosed() => _closedCompleter.future;

  @override
  void onOpened() {
    ArSessionLogger.log('Launch', 'Chrome Custom Tab opened');
  }

  @override
  void onClosed() {
    ArSessionLogger.log('Launch', 'Chrome Custom Tab closed');
    if (!_closedCompleter.isCompleted) {
      _closedCompleter.complete();
    }
  }
}

/// Fullscreen InAppBrowser fallback when Custom Tabs are unavailable.
class ArInAppBrowser extends InAppBrowser {
  ArInAppBrowser({
    required this.routePayload,
    required this.instructions,
    required this.onBridgeEvent,
  }) : super(
          initialUserScripts: UnmodifiableListView<UserScript>([
            UserScript(
              source: _bridgeShimScript,
              injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
            ),
          ]),
        );

  final String routePayload;
  final String instructions;
  final ValueChanged<Map<String, dynamic>> onBridgeEvent;

  final ArBridgeService _bridgeService = const ArBridgeService();
  final Completer<void> _closedCompleter = Completer<void>();
  Timer? _positionTimer;

  Future<void> waitUntilClosed() => _closedCompleter.future;

  static InAppWebViewSettings get webSettings => InAppWebViewSettings(
        javaScriptEnabled: true,
        mediaPlaybackRequiresUserGesture: false,
        allowsInlineMediaPlayback: true,
        useHybridComposition: false,
        hardwareAcceleration: true,
        domStorageEnabled: true,
        transparentBackground: false,
        mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
        iframeAllow: 'camera; microphone; xr-spatial-tracking',
        iframeAllowFullscreen: true,
      );

  static InAppBrowserSettings get browserSettings => InAppBrowserSettings(
        hideUrlBar: true,
        hideToolbarTop: true,
        hideTitleBar: true,
        hideProgressBar: true,
        presentationStyle: ModalPresentationStyle.FULL_SCREEN,
      );

  Future<void> openSession(String url) async {
    ArSessionLogger.log('Launch', 'Opening InAppBrowser fallback → $url');
    await openUrlRequest(
      urlRequest: URLRequest(url: WebUri(url)),
      settings: InAppBrowserClassSettings(
        webViewSettings: webSettings,
        browserSettings: browserSettings,
      ),
    );
  }

  @override
  void onBrowserCreated() {
    ArSessionLogger.log('WebView', 'InAppBrowser created — registering ArBridge handler');
    webViewController?.addJavaScriptHandler(
      handlerName: 'ArBridge',
      callback: (args) {
        if (args.isEmpty) {
          return;
        }
        _handleJsMessage(args.first.toString());
      },
    );
  }

  @override
  void onLoadStart(WebUri? url) {
    ArSessionLogger.log('WebView', 'onLoadStart', detail: {'url': url?.toString()});
    super.onLoadStart(url);
  }

  @override
  Future<void> onLoadStop(WebUri? url) async {
    ArSessionLogger.log('WebView', 'onLoadStop — injecting route + starting position stream', detail: {
      'url': url?.toString(),
    });
    await _sendRouteUpdate();
    await _injectInstructionBar();
    _startPositionStreaming();
  }

  @override
  void onLoadError(Uri? url, int code, String message) {
    ArSessionLogger.error(
      'WebView',
      'onLoadError',
      detail: {'url': url?.toString(), 'code': code, 'message': message},
    );
    super.onLoadError(url, code, message);
  }

  @override
  void onConsoleMessage(ConsoleMessage consoleMessage) {
    final text = consoleMessage.message;
    if (text.contains('[fplaces AR]') || text.contains('[fplaces]')) {
      ArSessionLogger.log(
        'WebView.console',
        text,
        detail: {'level': consoleMessage.messageLevel.toString()},
      );
    }
    super.onConsoleMessage(consoleMessage);
  }

  @override
  Future<PermissionResponse?>? onPermissionRequest(
    PermissionRequest permissionRequest,
  ) async {
    await Permission.camera.request();
    await Permission.microphone.request();
    return PermissionResponse(
      resources: permissionRequest.resources,
      action: PermissionResponseAction.GRANT,
    );
  }

  @override
  void onExit() {
    _stopPositionStreaming();
    if (!_closedCompleter.isCompleted) {
      _closedCompleter.complete();
    }
  }

  Future<void> _injectInstructionBar() async {
    final escaped = jsonEncode(
      instructions.isEmpty ? 'Follow route guidance' : instructions,
    );
    await webViewController?.evaluateJavascript(source: '''
      (function() {
        if (document.getElementById('fplaces-instruction-bar')) return;
        var bar = document.createElement('div');
        bar.id = 'fplaces-instruction-bar';
        bar.textContent = JSON.parse($escaped);
        bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:22px;padding:12px 14px;background:rgba(0,0,0,0.72);color:#fff;font:700 18px system-ui,sans-serif;border-radius:14px;z-index:999999;pointer-events:none';
        document.body.appendChild(bar);
      })();
    ''');
  }

  Future<void> _sendRouteUpdate() async {
    final jsEscapedPayload = jsonEncode(routePayload);
    ArSessionLogger.log('WebView', 'Calling onFlutterRoute in WebView', detail: {
      'payloadChars': routePayload.length,
    });
    final result = await webViewController?.evaluateJavascript(source: '''
      (function() {
        if (typeof window.onFlutterRoute !== 'function') {
          return JSON.stringify({ ok: false, reason: 'onFlutterRoute missing' });
        }
        window.onFlutterRoute(JSON.parse($jsEscapedPayload));
        return JSON.stringify({ ok: true });
      })();
    ''');
    ArSessionLogger.log('WebView', 'onFlutterRoute result', detail: {'result': result});
  }

  void _startPositionStreaming() {
    _positionTimer?.cancel();
    ArSessionLogger.log('WebView', 'Starting position stream (every 1s)');
    _positionTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      unawaited(_pushCurrentPosition());
    });
    unawaited(_pushCurrentPosition());
  }

  void _stopPositionStreaming() {
    if (_positionTimer != null) {
      ArSessionLogger.log('WebView', 'Stopping position stream');
    }
    _positionTimer?.cancel();
    _positionTimer = null;
  }

  Future<void> _pushCurrentPosition() async {
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 8),
        ),
      );
      final payload = _bridgeService.buildPositionPayload(
        latitude: position.latitude,
        longitude: position.longitude,
        heading: position.heading >= 0 ? position.heading : null,
        accuracyMeters: position.accuracy,
      );
      ArSessionLogger.log(
        'Position',
        'Pushing onFlutterPosition',
        detail: {
          'lat': position.latitude,
          'lng': position.longitude,
          'heading': position.heading >= 0 ? position.heading : null,
          'accuracy': position.accuracy,
        },
      );
      final jsEscapedPayload = jsonEncode(payload);
      await webViewController?.evaluateJavascript(source: '''
        (function() {
          if (typeof window.onFlutterPosition !== 'function') return;
          window.onFlutterPosition(JSON.parse($jsEscapedPayload));
        })();
      ''');
    } catch (error) {
      ArSessionLogger.warn('Position', 'GPS push failed', detail: error);
    }
  }

  Future<void> _stopSession() async {
    final stopPayload = _bridgeService.buildStopPayload();
    final jsEscapedPayload = jsonEncode(stopPayload);
    await webViewController?.evaluateJavascript(source: '''
      (function() {
        if (typeof window.onFlutterStop === 'function') {
          window.onFlutterStop(JSON.parse($jsEscapedPayload));
        }
      })();
    ''');
  }

  void _handleJsMessage(String message) {
    try {
      final decoded = jsonDecode(message);
      if (decoded is Map<String, dynamic>) {
        final eventName = decoded['event']?.toString() ?? 'unknown';
        if (eventName == 'debug') {
          final level = decoded['level']?.toString() ?? 'log';
          final phase = decoded['phase']?.toString() ?? 'AR.page';
          final msg = decoded['message']?.toString() ?? '';
          final detail = decoded['detail'];
          if (level == 'error') {
            ArSessionLogger.error(phase, msg, detail: detail);
          } else if (level == 'warn') {
            ArSessionLogger.warn(phase, msg, detail: detail);
          } else {
            ArSessionLogger.log(phase, msg, detail: detail);
          }
        } else {
          ArSessionLogger.log('Bridge', 'Event from AR page: $eventName', detail: decoded);
        }
        onBridgeEvent(decoded);
      }
    } catch (error) {
      ArSessionLogger.warn('Bridge', 'Failed to parse JS message', detail: {
        'raw': message,
        'error': error.toString(),
      });
    }
  }

  Future<void> closeSession() async {
    _stopPositionStreaming();
    await _stopSession();
    await close();
  }
}

/// Opens AR in a new browser tab (PWA) or Chrome Custom Tabs / InAppBrowser (native).
Future<void> openArInAppBrowser({
  required String routePayload,
  required String instructions,
  required ValueChanged<Map<String, dynamic>> onBridgeEvent,
}) async {
  final granted = await ensureArPermissions();
  if (!granted) {
    ArSessionLogger.error('Permissions', 'Camera permission denied — aborting AR launch');
    throw StateError('Camera permission denied');
  }

  ArSessionLogger.log('Launch', 'Permissions OK — building URL');

  final arUrl = buildArLaunchUrl(
    routePayload: routePayload,
    instructions: instructions,
  );

  if (kIsWeb) {
    final uri = Uri.parse(arUrl);
    final opened = await url_launcher.launchUrl(
      uri,
      webOnlyWindowName: '_blank',
      mode: url_launcher.LaunchMode.externalApplication,
    );
    if (!opened) {
      ArSessionLogger.error('Launch', 'launchUrl returned false');
      throw StateError('Could not open AR in a new browser tab.');
    }
    ArSessionLogger.log(
      'Launch',
      'PWA AR opened in new tab — logs appear in phone browser DevTools + on-screen panel',
      detail: {'urlChars': arUrl.length},
    );
  }

  if (kIsWeb) {
    return;
  }

  final customTabsAvailable = await ChromeSafariBrowser.isAvailable();
  ArSessionLogger.log(
    'Launch',
    'Custom Tabs available=$customTabsAvailable urlChars=${arUrl.length}',
  );

  if (customTabsAvailable) {
    final browser = _ArChromeSafariBrowser();
    await browser.open(
      url: WebUri(arUrl),
      settings: ChromeSafariBrowserSettings(
        shareState: CustomTabsShareState.SHARE_STATE_OFF,
        showTitle: false,
        enableUrlBarHiding: true,
      ),
    );
    await browser.waitUntilClosed();
    browser.dispose();
    return;
  }

  ArSessionLogger.warn('Launch', 'Custom Tabs unavailable — using InAppBrowser');
  final browser = ArInAppBrowser(
    routePayload: routePayload,
    instructions: instructions,
    onBridgeEvent: onBridgeEvent,
  );
  await browser.openSession(arUrl);
  await browser.waitUntilClosed();
  await browser.closeSession();
  browser.dispose();
}
