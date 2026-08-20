/**
 * Google AR–style directional alignment: EUS direction vectors, LookRotation, Slerp.
 * Bridges geospatial deltas to Three.js world-space quaternions (no Euler gimbal lock).
 */
(function () {
  const UP = { x: 0, y: 1, z: 0 };
  const DEFAULT_FORWARD = { x: 0, y: 0, z: -1 };

  function headingOffsetRad() {
    const cfg = window.FPLACES_AR_CONFIG || {};
    if (cfg.arrowHeadingOffsetRad != null) return cfg.arrowHeadingOffsetRad;
    return Math.PI;
  }

  /**
   * Yaw (rotation.y) so chevron visual apex points along path tangent (dx, dz).
   * θ = atan2(Δx, Δz) + π - corrects ExtrudeGeometry floor mesh (−Z vs +D).
   */
  function pathHeadingYawRad(dx, dz) {
    return Math.atan2(dx, dz) + headingOffsetRad();
  }

  let scratchDir = null;
  let scratchUp = null;
  let scratchMat = null;
  let scratchFrom = null;
  let scratchTo = null;
  let scratchQuat = null;

  function ensureScratch(THREE) {
    if (!scratchDir) scratchDir = new THREE.Vector3();
    if (!scratchUp) scratchUp = new THREE.Vector3();
    if (!scratchMat) scratchMat = new THREE.Matrix4();
    if (!scratchFrom) scratchFrom = new THREE.Vector3();
    if (!scratchTo) scratchTo = new THREE.Vector3();
    if (!scratchQuat) scratchQuat = new THREE.Quaternion();
  }

  /**
   * Apply arrowHeadingOffsetRad about +Y (Euler trail meshes only).
   * Do not use on LookRotation output - lookAt already encodes −Z-forward.
   */
  function applyHeadingOffset(THREE, quaternion, out) {
    ensureScratch(THREE);
    const offset = headingOffsetRad();
    const result = out || quaternion;
    if (!offset) {
      result.copy(quaternion);
      return result;
    }
    scratchQuat.setFromAxisAngle(scratchUp.set(0, 1, 0), offset);
    result.copy(quaternion).multiply(scratchQuat);
    return result;
  }

  /**
   * Direction vector v = P_target - P_user in world space (horizontal navigation).
   */
  function directionVector3(THREE, userPos, targetPos, out) {
    ensureScratch(THREE);
    const v = out || scratchDir;
    v.set(
      targetPos.x - userPos.x,
      (targetPos.y ?? 0) - (userPos.y ?? 0),
      targetPos.z - userPos.z,
    );
    const lenSq = v.lengthSq();
    if (lenSq < 1e-8) return null;
    return v.normalize();
  }

  /**
   * Geospatial direction in EUS meters (East, Up, South) relative to anchor ref.
   */
  function geoDirectionEUS(ref, userPose, targetPose) {
    const geo = window.FplacesGeoMath;
    if (!geo?.geoDeltaToEUSMeters) return null;
    return geo.geoDeltaToEUSMeters(ref, userPose, targetPose);
  }

  /**
   * EUS delta → Three.js world Vector3 (X=east, Y=up, Z=south).
   */
  function eusToWorldVector3(THREE, eus, out) {
    ensureScratch(THREE);
    const v = out || scratchDir;
    if (!eus) return null;
    v.set(eus.x || 0, eus.y || 0, eus.z || 0);
    const lenSq = v.lengthSq();
    if (lenSq < 1e-8) return null;
    return v.normalize();
  }

  /**
   * LookRotation: rotate default forward (−Z / chevron tip) to face `direction`, with `up` as gravity.
   * Equivalent to Unity/ARCore Quaternion.LookRotation(v, u).
   *
   * Uses Matrix4.lookAt(eye, target, up) - camera convention where local −Z faces the target.
   * Do NOT use Object3D.lookAt here: for non-camera meshes it aims +Z at the target, which
   * would invert the chevron tip and tempt a compensating π offset (double-correction hazard).
   *
   * Does NOT apply arrowHeadingOffsetRad - that π is Euler-only (pathHeadingYawRad).
   */
  function lookRotation(THREE, direction, up, outQuaternion, fromPosition) {
    ensureScratch(THREE);
    scratchDir.copy(direction);
    if (scratchDir.lengthSq() < 1e-8) return outQuaternion;
    scratchDir.normalize();

    if (up && (up.x != null || up.y != null || up.z != null)) {
      scratchUp.set(up.x ?? 0, up.y ?? 1, up.z ?? 0);
    } else {
      scratchUp.set(UP.x, UP.y, UP.z);
    }
    scratchUp.normalize();

    if (fromPosition) {
      scratchFrom.set(
        fromPosition.x ?? 0,
        fromPosition.y ?? 0,
        fromPosition.z ?? 0,
      );
    } else {
      scratchFrom.set(0, 0, 0);
    }
    scratchTo.set(
      scratchFrom.x + scratchDir.x,
      scratchFrom.y + scratchDir.y,
      scratchFrom.z + scratchDir.z,
    );

    // Camera-style basis: object local −Z aligns with (target − eye) === direction.
    scratchMat.lookAt(scratchFrom, scratchTo, scratchUp);
    outQuaternion.setFromRotationMatrix(scratchMat);
    return outQuaternion;
  }

  /**
   * Spherical linear interpolation between two quaternions.
   */
  function slerp(THREE, current, target, t, out) {
    const result = out || current;
    result.copy(current);
    result.slerp(target, Math.max(0, Math.min(1, t)));
    return result;
  }

  /**
   * Point on polyline at distance `alongM` from path start.
   */
  function pointAtAlongM(points, alongM) {
    if (!points?.length) return null;
    if (points.length === 1) return points[0];

    let accum = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 0.001) continue;

      if (accum + segLen >= alongM) {
        const t = (alongM - accum) / segLen;
        return {
          x: a.x + dx * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + dz * t,
        };
      }
      accum += segLen;
    }

    const last = points[points.length - 1];
    return { x: last.x, y: last.y, z: last.z };
  }

  /**
   * Advance waypoint index when user is within threshold of current node.
   */
  function advanceWaypointIndex(points, userX, userZ, currentIndex, thresholdM) {
    if (!points?.length) return 0;

    let idx = Math.max(0, Math.min(currentIndex, points.length - 1));
    const threshold = thresholdM ?? 3;
    const advanced = [];

    while (idx < points.length - 1) {
      const wp = points[idx];
      const dist = Math.hypot(userX - wp.x, userZ - wp.z);
      if (dist < threshold) {
        advanced.push({ index: idx, distM: Math.round(dist * 100) / 100 });
        idx++;
      } else {
        break;
      }
    }

    const result = Math.min(idx, points.length - 1);
    if (advanced.length > 0) {
      window.FplacesArDebug?.logThrottled?.(
        'Align',
        'Waypoint threshold crossings',
        {
          from: currentIndex,
          to: result,
          thresholdM: threshold,
          crossings: advanced,
          user: { x: Math.round(userX * 100) / 100, z: Math.round(userZ * 100) / 100 },
        },
        0,
        `align:waypoint:${result}`,
      );
    }

    return result;
  }

  window.FplacesQuaternionAlignment = {
    UP,
    DEFAULT_FORWARD,
    headingOffsetRad,
    pathHeadingYawRad,
    directionVector3,
    geoDirectionEUS,
    eusToWorldVector3,
    lookRotation,
    applyHeadingOffset,
    slerp,
    pointAtAlongM,
    advanceWaypointIndex,
  };
})();
