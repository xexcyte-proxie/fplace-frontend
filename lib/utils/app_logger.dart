import 'package:flutter/foundation.dart';

/// Lightweight debug logger for tracing app flow during test runs.
void appLog(String tag, String message) {
  debugPrint('[Fplaces/$tag] $message');
}
