import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

class DeviceLocationResult {
  const DeviceLocationResult({
    required this.latitude,
    required this.longitude,
    this.accuracyMeters,
  });

  final double latitude;
  final double longitude;
  final double? accuracyMeters;
}

class DeviceLocationException implements Exception {
  DeviceLocationException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Browser Geolocation (PWA) or OS GPS (native shells).
class DeviceLocationService {
  Future<DeviceLocationResult> getCurrentPosition() async {
    if (!kIsWeb) {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        throw DeviceLocationException(
          'Location services are turned off. Enable them in system settings.',
        );
      }
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw DeviceLocationException(
        kIsWeb
            ? 'Location permission was denied. Tap the location button and choose Allow.'
            : 'Location permission was denied. Tap the location button to try again.',
      );
    }
    if (permission == LocationPermission.deniedForever) {
      throw DeviceLocationException(
        kIsWeb
            ? 'Location is blocked for this site. Enable it in your browser site settings.'
            : 'Location permission is blocked. Enable it in app settings.',
      );
    }

    final position = await Geolocator.getCurrentPosition(
      locationSettings: LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 15),
      ),
    );

    return DeviceLocationResult(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracyMeters: position.accuracy,
    );
  }
}
