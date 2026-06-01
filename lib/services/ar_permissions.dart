import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

import '../utils/ar_session_logger.dart';

/// Requests OS-level camera/mic permissions before loading WebAR (native only).
Future<bool> ensureArPermissions() async {
  if (kIsWeb) {
    ArSessionLogger.log(
      'Permissions',
      'PWA — camera/mic are requested by the browser when AR opens',
    );
    return true;
  }

  ArSessionLogger.log('Permissions', 'Requesting camera + microphone…');

  final camera = await Permission.camera.request();
  final microphone = await Permission.microphone.request();

  ArSessionLogger.log(
    'Permissions',
    'camera=${camera.name}/${camera.isGranted} '
    'microphone=${microphone.name}/${microphone.isGranted}',
  );

  if (camera.isPermanentlyDenied) {
    ArSessionLogger.warn(
      'Permissions',
      'Camera permanently denied — open app settings to enable',
    );
  }

  return camera.isGranted;
}
