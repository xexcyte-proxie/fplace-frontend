/**
 * Geodetic-to-metric anchor engine for AR floor calibration.
 */
(function () {
  const R = 6371000;

  class AnchorEngine {
    constructor() {
      this.origin = null;
      this.isCalibrated = false;
    }

    calibrate(baseCoordinates) {
      if (!baseCoordinates || baseCoordinates.latitude == null || baseCoordinates.longitude == null) {
        return false;
      }
      this.origin = {
        latitude: Number(baseCoordinates.latitude),
        longitude: Number(baseCoordinates.longitude),
      };
      this.isCalibrated = true;
      return true;
    }

    convertToSLAMSpace(targetCoordinates) {
      if (!this.origin || !targetCoordinates) {
        return { x: 0, z: 0 };
      }

      const lat0 = this.origin.latitude;
      const lng0 = this.origin.longitude;
      const lat1 = Number(targetCoordinates.latitude);
      const lng1 = Number(targetCoordinates.longitude);

      const dLatRad = ((lat1 - lat0) * Math.PI) / 180;
      const dLngRad = ((lng1 - lng0) * Math.PI) / 180;
      const lat0Rad = (lat0 * Math.PI) / 180;
      const lat1Rad = (lat1 * Math.PI) / 180;
      const cosMid = Math.cos((lat0Rad + lat1Rad) / 2);

      return {
        x: dLngRad * R * cosMid,
        z: -(dLatRad * R),
      };
    }
  }

  const shared = new AnchorEngine();

  window.FplacesAnchorEngine = {
    instance: shared,
    AnchorEngine,
    calibrate(baseCoordinates) {
      return shared.calibrate(baseCoordinates);
    },
    convertToSLAMSpace(targetCoordinates) {
      return shared.convertToSLAMSpace(targetCoordinates);
    },
    get isCalibrated() {
      return shared.isCalibrated;
    },
  };
})();
