/**
 * Geodetic-to-metric anchor engine for AR floor calibration.
 * Calibration sets the world origin AND the yaw alignment between the geographic
 * EUS frame (X=east, Y=up, Z=south) and the SLAM world frame.
 *
 * WebXR/8th Wall world −Z is the camera's facing at session start - NOT north.
 * `yawOffsetDeg` is the SLAM yaw of true north (rawSlamYaw − deviceCompassHeading
 * at calibration): geographic bearing β maps to SLAM yaw β + yawOffsetDeg.
 * Without this rotation the route renders assuming the phone faced north at start,
 * which reversed/rotated the AR path relative to the 2D map.
 */
(function () {
  class AnchorEngine {
    constructor() {
      this.revision = (this.revision || 0) + 1;
      this.ground = null;
      this.origin = null;
      this.isCalibrated = false;
      this.yawOffsetRad = 0;
      this.yawOffsetDeg = 0;
      this.slamOriginX = 0;
      this.slamOriginZ = 0;
    }

    reset() {
      window.FplacesNavigationDiagnostics?.record('anchor-reset', 'AnchorEngine.reset', { revisionBefore: this.revision, revisionAfter: (this.revision || 0)+1, wasCalibrated: this.isCalibrated });
      this.revision = (this.revision || 0) + 1;
      this.ground = null;
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
     *   yawOffsetDeg - SLAM yaw of true north; slamX/slamZ - SLAM camera position
     *   at calibration (anchor geo point maps there instead of the SLAM origin).
     */
    calibrate(baseCoordinates, alignment) {
      if (!baseCoordinates || !Number.isFinite(baseCoordinates.latitude) || !Number.isFinite(baseCoordinates.longitude) ||
          Math.abs(baseCoordinates.latitude) > 90 || Math.abs(baseCoordinates.longitude) > 180 ||
          (['groundY', 'yawOffsetDeg', 'slamX', 'slamZ'].some(key => alignment?.[key] != null && !Number.isFinite(alignment[key])))) {
        this.reset();
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
      this.ground = Object.freeze({
        y: alignment?.groundY ?? 0,
        kind: alignment?.groundKind === 'estimated-origin-height' || alignment?.groundY == null
          ? 'estimated-origin-height' : 'user-height-estimate',
        normal: Object.freeze({ x: 0, y: 1, z: 0 }),
        floorId: alignment?.floorId ?? null,
        physicallyVerified: false,
      });
      this.revision += 1;
      this.isCalibrated = true;
      window.FplacesNavigationDiagnostics?.update('calibration', 'AnchorEngine.calibrate', { revision: this.revision, origin: this.origin, yawOffsetDeg: this.yawOffsetDeg, slamOriginX: this.slamOriginX, slamOriginZ: this.slamOriginZ, ground: this.ground, alignmentSource: 'explicit-calibrate-call' });
      return true;
    }

    getGroundY() {
      const offset = window.FPLACES_AR_CONFIG?.groundOffsetM;
      return (this.ground?.y ?? 0) + (Number.isFinite(offset) ? offset : 0.04);
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
    reset() {
      window.FplacesNavigationDiagnostics?.record('anchor-reset', 'AnchorEngine.reset', { revisionBefore: this.revision, revisionAfter: (this.revision || 0)+1, wasCalibrated: this.isCalibrated });
      return shared.reset();
    },
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
