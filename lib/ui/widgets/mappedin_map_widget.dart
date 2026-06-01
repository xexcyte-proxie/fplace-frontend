import 'dart:collection';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../../services/mappedin_bridge_service.dart';
import '../../utils/map_diagnostic_logger.dart';

class MappedinMapWidget extends StatefulWidget {
  const MappedinMapWidget({
    super.key,
    required this.bridge,
    this.onWebViewCreated,
    this.onWebViewReady,
    this.onMapError,
  });

  final MappedinBridgeService bridge;
  final ValueChanged<InAppWebViewController>? onWebViewCreated;
  final VoidCallback? onWebViewReady;
  final ValueChanged<String>? onMapError;

  @override
  State<MappedinMapWidget> createState() => _MappedinMapWidgetState();
}

class _MappedinMapWidgetState extends State<MappedinMapWidget> {
  static final _nativeSettings = InAppWebViewSettings(
    javaScriptEnabled: true,
    domStorageEnabled: true,
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserGesture: false,
    transparentBackground: true,
    useHybridComposition: true,
    mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
    allowsBackForwardNavigationGestures: false,
  );

  var _loadStopCount = 0;
  var _webAttachStarted = false;

  @override
  void initState() {
    super.initState();
    if (kIsWeb) {
      widget.bridge.prepareWebHost(
        onRawMessage: widget.bridge.handleRawMessage,
        onIframeLoaded: widget.onWebViewReady,
      );
      WidgetsBinding.instance.addPostFrameCallback((_) => _attachWebHost());
    }
  }

  Future<void> _attachWebHost() async {
    if (_webAttachStarted) return;
    _webAttachStarted = true;
    MapDiagnosticLogger.step('WebView', 'PWA iframe — attaching bridge');
    try {
      await widget.bridge.attachWeb();
    } catch (error, stackTrace) {
      MapDiagnosticLogger.error(
        'WebView',
        'PWA attach() failed',
        detail: '$error\n$stackTrace',
      );
      widget.onMapError?.call('Map iframe attach failed: $error');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (kIsWeb) {
      final viewType = widget.bridge.webViewType;
      if (viewType == null) {
        return const ColoredBox(color: Color(0xFF0F172A));
      }
      return SizedBox.expand(
        child: HtmlElementView(viewType: viewType),
      );
    }

    return InAppWebView(
      initialSettings: _nativeSettings,
      initialUserScripts: UnmodifiableListView([
        UserScript(
          source: '''
            window.MappedinBridge = window.MappedinBridge || {
              postMessage: function(message) {
                if (window.flutter_inappwebview?.callHandler) {
                  window.flutter_inappwebview.callHandler('MappedinBridge', message);
                }
              }
            };
          ''',
          injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
        ),
      ]),
      onWebViewCreated: (controller) async {
        MapDiagnosticLogger.step('WebView', 'InAppWebView created — attaching bridge');
        widget.onWebViewCreated?.call(controller);
        try {
          await widget.bridge.attach(controller);
        } catch (error, stackTrace) {
          MapDiagnosticLogger.error(
            'WebView',
            'attach() failed',
            detail: '$error\n$stackTrace',
          );
          widget.onMapError?.call('WebView attach failed: $error');
        }
      },
      onLoadStart: (controller, url) {
        MapDiagnosticLogger.step('WebView', 'Load started → $url');
      },
      onLoadStop: (controller, url) {
        _loadStopCount++;
        MapDiagnosticLogger.ok(
          'WebView',
          'Load stop #$_loadStopCount → $url',
        );
        widget.onWebViewReady?.call();
      },
      onProgressChanged: (controller, progress) {
        widget.bridge.logWebViewProgress(progress);
      },
      onConsoleMessage: (controller, consoleMessage) {
        widget.bridge.logWebViewConsole(
          consoleMessage.messageLevel.toString(),
          consoleMessage.message,
        );
      },
      onReceivedError: (controller, request, error) {
        final message =
            '${error.type}: ${error.description} (url=${request.url})';
        widget.bridge.logWebViewError('onReceivedError', message);
        widget.onMapError?.call(message);
      },
      onReceivedHttpError: (controller, request, response) {
        final url = request.url.toString();
        final message =
            'HTTP ${response.statusCode} ${response.reasonPhrase} (url=$url)';
        final isWorkerAsset = url.contains('/workers/');
        if (isWorkerAsset) {
          MapDiagnosticLogger.warn('WebView', 'Worker asset HTTP error — $message');
          return;
        }
        widget.bridge.logWebViewError('onReceivedHttpError', message);
        if (response.statusCode != null && response.statusCode! >= 400) {
          widget.onMapError?.call(message);
        }
      },
    );
  }
}
