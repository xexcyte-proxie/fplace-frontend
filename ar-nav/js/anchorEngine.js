/**
 * Geodetic-to-metric anchor engine for AR floor calibration.
 * Calibration sets the world origin AND the yaw alignment between the geographic
 * EUS frame (X=east, Y=up, Z=south) and the SLAM world frame.
 *
 * WebXR/8th Wall world −Z is the camera's facing at session start — NOT north.
 * `yawOffsetDeg` is the SLAM yaw of true north (rawSlamYaw − deviceCompassHeading
 * at calibration): geographic bearing β maps to SLAM yaw β + yawOffsetDeg.
 * Without this rotation the route renders assuming the phone faced north at start,
 * which reversed/rotated the AR path relative to the 2D map.
 */
(function () {
  class AnchorEngine {
    constructor() {
      this.origin = null;
      this.isCalibrated = false;
      this.yawOffsetRad = 0;
      this.yawOffsetDeg = 0;
      this.slamOriginX = 0;
      this.slamOriginZ = 0;
    }

    /**
     * @param {{latitude:number, longitude:number}} baseCoordinates anchor geo point
     * @param {{yawOffsetDeg?:number, slamX?:number, slamZ?:number}} [alignment]
     *   yawOffsetDeg — SLAM yaw of true north; slamX/slamZ — SLAM camera position
     *   at calibration (anchor geo point maps there instead of the SLAM origin).
     */
    calibrate(baseCoordinates, alignment) {
      if (!baseCoordinates || baseCoordinates.latitude == null || baseCoordinates.longitude == null) {
        return false;
      }
      this.origin = {
        latitude: Number(baseCoordinates.latitude),
        longitude: Number(baseCoordinates.longitude),
      };
      const yawDeg = Number(alignment?.yawOffsetDeg);
      this.yawOffsetDeg = Number.isFinite(yawDeg) ? yawDeg : 0;
      this.yawOffsetRad = (this.yawOffsetDeg * Math.PI) / 180;
      this.slamOriginX = Number.isFinite(alignment?.slamX) ? Number(alignment.slamX) : 0;
      this.slamOriginZ = Number.isFinite(alignment?.slamZ) ? Number(alignment.slamZ) : 0;
      this.isCalibrated = true;
      return true;
    }

    convertToSLAMSpace(targetCoordinates) {
      if (!this.origin || !targetCoordinates) {
        return { x: 0, z: 0 };
      }
      const local = window.FplacesGeoMath.geoToLocalMeters(this.origin, targetCoordinates);
      // Rotate bearing β → β + yawOffset in the (x=sinβ, z=−cosβ) yaw convention.
      const cos = Math.cos(this.yawOffsetRad);
      const sin = Math.sin(this.yawOffsetRad);
      return {
        x: local.x * cos - local.z * sin + this.slamOriginX,
        z: local.x * sin + local.z * cos + this.slamOriginZ,
      };
    }
  }

  const shared = new AnchorEngine();

  window.FplacesAnchorEngine = {
    instance: shared,
    AnchorEngine,
    calibrate(baseCoordinates, alignment) {
      return shared.calibrate(baseCoordinates, alignment);
    },
    convertToSLAMSpace(targetCoordinates) {
      return shared.convertToSLAMSpace(targetCoordinates);
    },
    getWorldYawOffsetDeg() {
      return shared.yawOffsetDeg;
    },
    get isCalibrated() {
      return shared.isCalibrated;
    },
  };
})();
