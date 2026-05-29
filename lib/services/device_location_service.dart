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

/// Reads the device GPS position after checking OS location permission.
class DeviceLocationService {
  Future<DeviceLocationResult> getCurrentPosition() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw DeviceLocationException(
        'Location services are turned off. Enable them in system settings.',
      );
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw DeviceLocationException('Location permission was denied.');
    }
    if (permission == LocationPermission.deniedForever) {
      throw DeviceLocationException(
        'Location permission is blocked. Enable it in app settings.',
      );
    }

    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 15),
      ),
    );

    return DeviceLocationResult(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracyMeters: position.accuracy,
    );
  }
}
