import 'package:flutter/foundation.dart';

import 'app_logger.dart';

/// Numbered timeline logger for AR launch → WebView → bridge → session ready.
class ArSessionLogger {
  ArSessionLogger._();

  static int _step = 0;
  static final Stopwatch _stopwatch = Stopwatch();

  static void reset() {
    _step = 0;
    _stopwatch
      ..reset()
      ..start();
    appLog('AR', '══════ AR SESSION START (Flutter) ══════');
  }

  static void log(String phase, String message, {Object? detail}) {
    _step++;
    appLog(
      'AR',
      'STEP $_step (${_elapsedMs}ms) [$phase] $message',
      detail: detail,
    );
  }

  static void warn(String phase, String message, {Object? detail}) {
    _step++;
    appLog(
      'AR',
      'STEP $_step WARN (${_elapsedMs}ms) [$phase] $message',
      detail: detail,
    );
  }

  static void error(
    String phase,
    String message, {
    Object? error,
    StackTrace? stackTrace,
    Object? detail,
  }) {
    _step++;
    appLog(
      'AR',
      'STEP $_step ERROR (${_elapsedMs}ms) [$phase] $message',
      detail: detail ?? error,
    );
    if (stackTrace != null) {
      debugPrint(stackTrace.toString());
    }
  }

  static void complete(String outcome) {
    _step++;
    appLog(
      'AR',
      'STEP $_step (${_elapsedMs}ms) [Done] $outcome',
    );
    appLog('AR', '══════ AR SESSION END (Flutter) ══════');
  }

  static int get _elapsedMs => _stopwatch.elapsedMilliseconds;
}
