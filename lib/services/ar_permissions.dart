import 'package:permission_handler/permission_handler.dart';

import '../utils/ar_session_logger.dart';

/// Requests OS-level camera/mic permissions before loading WebAR in a WebView.
Future<bool> ensureArPermissions() async {
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
