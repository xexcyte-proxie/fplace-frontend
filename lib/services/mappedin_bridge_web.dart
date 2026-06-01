import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'dart:ui_web' as ui_web;

import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;

import '../utils/map_diagnostic_logger.dart';

/// Hosts the Mappedin map in an iframe for Flutter Web / PWA.
class MappedinBridgeWebHost {
  MappedinBridgeWebHost({
    required this.onMessage,
    this.onIframeLoaded,
  });

  final void Function(String message) onMessage;
  final VoidCallback? onIframeLoaded;

  static const viewType = 'mappedin-map-iframe';
  static var _viewFactoryRegistered = false;

  web.HTMLIFrameElement? _iframe;
  StreamSubscription<web.Event>? _loadSubscription;
  JSFunction? _messageListener;
  var _iframeLoadNotified = false;

  void registerViewFactory() {
    if (_viewFactoryRegistered) return;
    _ensureMessageListener();

    ui_web.platformViewRegistry.registerViewFactory(
      viewType,
      (int viewId) {
        final iframe = web.HTMLIFrameElement()
          ..src = 'mappedin/mappedin_map.html'
          ..style.border = 'none'
          ..style.width = '100%'
          ..style.height = '100%'
          ..style.display = 'block'
          ..allow = 'geolocation';
        _iframe = iframe;
        _wireIframeLoad(iframe);
        MapDiagnosticLogger.ok('Bridge', 'PWA map iframe element created');
        return iframe;
      },
    );
    _viewFactoryRegistered = true;
  }

  void _ensureMessageListener() {
    if (_messageListener != null) return;

    _messageListener = ((web.Event event) {
      final dartified = (event as web.MessageEvent).data.dartify();
      String? message;
      if (dartified is String) {
        message = dartified;
      } else if (dartified is Map) {
        final source = dartified['source'];
        if (source == 'fplaces') return;
        message = jsonEncode(dartified);
      }
      if (message == null ||
          !message.startsWith('{') ||
          !message.contains('"event"')) {
        return;
      }
      onMessage(message);
    }).toJS;

    web.window.addEventListener('message', _messageListener!);
    MapDiagnosticLogger.ok('Bridge', 'PWA postMessage listener registered');
  }

  void _wireIframeLoad(web.HTMLIFrameElement iframe) {
    _loadSubscription ??= iframe.onLoad.listen((_) {
      _notifyIframeLoaded('onLoad');
    });

    // Cached iframe can finish loading before onLoad is subscribed.
    scheduleMicrotask(() => _notifyIframeLoadedIfReady(iframe));
  }

  void _notifyIframeLoadedIfReady(web.HTMLIFrameElement iframe) {
    try {
      final doc = iframe.contentDocument;
      if (doc != null && doc.readyState == 'complete') {
        _notifyIframeLoaded('already complete');
      }
    } catch (_) {
      // Ignore cross-origin access errors until same-origin load completes.
    }
  }

  void _notifyIframeLoaded(String reason) {
    if (_iframeLoadNotified) return;
    _iframeLoadNotified = true;
    MapDiagnosticLogger.ok('Bridge', 'PWA map iframe loaded ($reason)');
    onIframeLoaded?.call();
  }

  Future<void> attach() async {
    registerViewFactory();
    _ensureMessageListener();

    final iframe = _iframe;
    if (iframe == null) {
      MapDiagnosticLogger.warn(
        'Bridge',
        'Iframe not created yet — will init when HtmlElementView builds',
      );
      return;
    }

    _wireIframeLoad(iframe);
  }

  Future<void> invoke(String method, List<dynamic> args) async {
    final iframe = _iframe;
    if (iframe == null) {
      throw StateError('Mappedin iframe not ready');
    }
    final contentWindow = iframe.contentWindow;
    if (contentWindow == null) {
      throw StateError('Mappedin iframe has no contentWindow');
    }
    contentWindow.postMessage(
      jsonEncode({
        'source': 'fplaces',
        'kind': 'invoke',
        'method': method,
        'args': args,
      }).toJS,
      '*'.toJS,
    );
  }

  void dispose() {
    _loadSubscription?.cancel();
    if (_messageListener != null) {
      web.window.removeEventListener('message', _messageListener!);
      _messageListener = null;
    }
  }
}
