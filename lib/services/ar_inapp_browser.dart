import 'dart:async';
import 'dart:collection';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
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
  };

  if (kIsWeb) {
    final encoded = base64Url.encode(utf8.encode(routePayload));
    return base.replace(queryParameters: query, fragment: 'route=$encoded').toString();
  }

  return base
      .replace(
        queryParameters: {
          ...query,
          'fplacesRoute': routePayload,
        },
      )
      .toString();
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
  Future<void> onLoadStop(WebUri? url) async {
    await _sendRouteUpdate();
    await _injectInstructionBar();
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
    await webViewController?.evaluateJavascript(source: '''
      (function() {
        if (typeof window.onFlutterRoute !== 'function') {
          return JSON.stringify({ ok: false });
        }
        window.onFlutterRoute(JSON.parse($jsEscapedPayload));
        return JSON.stringify({ ok: true });
      })();
    ''');
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
        onBridgeEvent(decoded);
      }
    } catch (_) {}
  }

  Future<void> closeSession() async {
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
    throw StateError('Camera permission denied');
  }

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
      throw StateError('Could not open AR in a new browser tab.');
    }
    ArSessionLogger.log('Launch', 'PWA AR opened in new tab');
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
