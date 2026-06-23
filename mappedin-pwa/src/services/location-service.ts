export class LocationService {
  async getCurrentPosition(): Promise<GeolocationPosition> {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported in this browser.');
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      });
    });
  }

  geolocationErrorMessage(error: GeolocationPositionError): string {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Location permission was denied. Allow location access and try again.';
      case error.POSITION_UNAVAILABLE:
        return 'Location is unavailable. Try again near a window or outdoors.';
      case error.TIMEOUT:
        return 'Location request timed out. Try again.';
      default:
        return 'Could not get your location.';
    }
  }
}
