import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

/// Explains why location is needed, then triggers the OS / browser permission prompt.
class LocationPermissionPrompt {
  static var _mapReadyPromptShown = false;

  static bool _isGranted(LocationPermission permission) =>
      permission == LocationPermission.always ||
      permission == LocationPermission.whileInUse;

  /// Shows a rationale dialog (if needed), then [Geolocator.requestPermission].
  static Future<bool> ensureGranted(
    BuildContext context, {
    bool showRationale = true,
  }) async {
    var permission = await Geolocator.checkPermission();
    if (_isGranted(permission)) return true;

    if (permission == LocationPermission.deniedForever) {
      if (context.mounted) await _showBlockedDialog(context);
      return false;
    }

    if (showRationale && context.mounted) {
      final allow = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Allow location access?'),
          content: Text(
            kIsWeb
                ? 'We use your location to place you on the map and set your route start point.\n\n'
                    'Tap Allow when your browser asks. If you are testing on a phone over HTTP, '
                    'location may only work over HTTPS.'
                : 'We use your location to show where you are in the building and improve directions.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Not now'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Allow'),
            ),
          ],
        ),
      );
      if (allow != true) return false;
    }

    permission = await Geolocator.requestPermission();
    if (_isGranted(permission)) return true;

    if (!context.mounted) return false;

    if (permission == LocationPermission.deniedForever) {
      await _showBlockedDialog(context);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Location was denied. You can enable it later via the location button.',
          ),
        ),
      );
    }
    return false;
  }

  /// One-time prompt after the map loads so users know to enable location.
  static Future<void> maybePromptAfterMapReady(BuildContext context) async {
    if (_mapReadyPromptShown) return;
    _mapReadyPromptShown = true;

    final permission = await Geolocator.checkPermission();
    if (_isGranted(permission)) return;
    if (!context.mounted) return;

    final continueFlow = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Enable your location?'),
        content: const Text(
          'Turn on location to see yourself on the map and start routes from where you are standing.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Later'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Continue'),
          ),
        ],
      ),
    );

    if (continueFlow == true && context.mounted) {
      await ensureGranted(context, showRationale: false);
    }
  }

  static Future<void> _showBlockedDialog(BuildContext context) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Location is blocked'),
        content: Text(
          kIsWeb
              ? 'Allow location for this site in your browser settings (tap the lock or site icon in the address bar), then reload the page.'
              : 'Enable location for this app in your device Settings.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('OK'),
          ),
          if (!kIsWeb)
            FilledButton(
              onPressed: () {
                Geolocator.openAppSettings();
                Navigator.of(dialogContext).pop();
              },
              child: const Text('Open settings'),
            ),
        ],
      ),
    );
  }
}
