/**
 * Turn-by-turn progress along Mappedin pathCoordinates + maneuvers.
 * Position: GPS, or external updates via onFlutterPosition / applyPosition.
 */
(function () {
  const geo = () => window.FplacesGeoMath;
  /** Matches HighFrequencyMockProvider - parent simulator walk speed. */
  const PARENT_SIM_WALK_MPS = 1.3;
  const PARENT_SIM_EXTRAP_CAP_S = 0.12;
  /** Enter "You've arrived" at this remaining distance. */
  const ARRIVE_ENTER_M = 5;
  /** Leave arrival only after walking this far away (stops HUD flicker). */
  const ARRIVE_EXIT_M = 22;

  function haversineMeters(a, b) {
    return geo().haversineMeters(a, b);
  }

  function bearingDegrees(from, to) {
    return geo().bearingDegrees(from, to);
  }

  function pathSegmentLengthMeters(path, fromIndex, toIndex) {
    let total = 0;
    for (let i = fromIndex; i < toIndex && i < path.length - 1; i++) {
      total += haversineMeters(path[i], path[i + 1]);
    }
    return total;
  }

  function segmentBearingAt(path, index, lookahead) {
    if (!path.length) return null;
    const fromIdx = Math.min(Math.max(0, index), path.length - 1);
    let toIdx = Math.min(fromIdx + lookahead, path.length - 1);
    if (toIdx <= fromIdx && fromIdx > 0) {
      return bearingDegrees(path[fromIdx - 1], path[fromIdx]);
    }
    if (toIdx <= fromIdx) {
      toIdx = Math.min(fromIdx + 1, path.length - 1);
    }
    return bearingDegrees(path[fromIdx], path[toIdx]);
  }

  function pathIndexForAlongMeters(path, metersAlong) {
    const snap = window.FplacesRouteGeometry?.snapAtDistanceAlongPath?.(
      path,
      metersAlong,
    );
    return snap?.segmentIndex ?? 0;
  }

  function normalizeDeltaDegrees(a, b) {
    let delta = a - b;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  /** Map each maneuver to its along-path position using Mappedin step distances. */
  function enrichManeuvers(route) {
    const path = route.pathCoordinates || [];
    const maneuvers = route.maneuvers || [];
    if (!maneuvers.length) return [];
    if (!path.length) {
      return maneuvers.map((m, i) => ({
        ...m,
        pathIndex: i,
        alongPathMeters: 0,
      }));
    }

    let cumulative = 0;
    return maneuvers.map((m, i) => {
      const alongPathMeters = cumulative;
      const stepDist =
        m.distanceMeters != null && Number(m.distanceMeters) > 0
          ? Number(m.distanceMeters)
          : 0;

      let pathIndex = typeof m.pathIndex === "number" ? m.pathIndex : null;
      let headingDegrees =
        typeof m.headingDegrees === "number" ? m.headingDegrees : null;

      if (pathIndex == null) {
        pathIndex = pathIndexForAlongMeters(path, alongPathMeters);
      }
      if (headingDegrees == null) {
        headingDegrees = segmentBearingAt(path, pathIndex, 2);
      }

      if (stepDist > 0) cumulative += stepDist;

      return {
        ...m,
        alongPathMeters,
        pathIndex,
        headingDegrees,
      };
    });
  }

  function findClosestPathIndex(path, lat, lng) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = haversineMeters({ latitude: lat, longitude: lng }, path[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { index: best, distanceMeters: bestD };
  }

  function pointAlongPath(path, startIndex, metersAhead) {
    if (!path.length) return null;
    let accumulated = 0;
    const fromIdx = Math.min(Math.max(0, startIndex), path.length - 1);

    for (let i = fromIdx; i < path.length - 1; i++) {
      const segLen = haversineMeters(path[i], path[i + 1]);
      if (accumulated + segLen >= metersAhead) {
        const t = (metersAhead - accumulated) / Math.max(segLen, 0.001);
        return {
          latitude:
            path[i].latitude + t * (path[i + 1].latitude - path[i].latitude),
          longitude:
            path[i].longitude + t * (path[i + 1].longitude - path[i].longitude),
          pathIndex: i,
        };
      }
      accumulated += segLen;
    }

    return path[path.length - 1];
  }

  function distanceAlongPathMeters(path, fromIndex, toIndex) {
    if (!path.length) return 0;
    const start = Math.min(Math.max(0, fromIndex), path.length - 1);
    const end = Math.min(Math.max(0, toIndex), path.length - 1);
    if (end <= start) return 0;
    return pathSegmentLengthMeters(path, start, end);
  }

  class RouteNavigator {
    constructor() {
      this.route = null;
      this.maneuvers = [];
      this.maneuverIndex = 0;
      this.watchId = null;
      this.onUpdate = null;
      this.lastPosition = null;
      this.positionSource = "none";
      this.externalHeadingDegrees = null;
      this.pathSegmentIndex = 0;
      this.snappedOnPath = null;
      this._smoothDistToTarget = null;
      this._lastTargetTickAt = null;
      this._lastTargetRaw = null;
      this._lastTargetFrame = null;
      this._smoothDistRemaining = null;
      this._lastRemainingTickAt = null;
      this._lastRemainingRaw = null;
      this._prevPositionSample = null;
      this._moveSpeedMps = 0;
      this._displayAlongPathM = null;
      this._lastAlongTickAt = null;
      this._gpsOffRouteMeters = Infinity;
      this._parentSimulatorAuthority = false;
      this._authoritativeAlongPathM = null;
      this._authoritativeAlongAt = 0;
      this._authoritativeSimSpeedMps = PARENT_SIM_WALK_MPS;
      this._prevAuthoritativeAlong = null;
      this._prevAuthoritativeAt = null;
      this._simDisplayAlongPathM = null;
      this._lastSimDisplayTickAt = null;
      this.arrived = false;
      this.offPathMessage = "";
      this._warnedShortPath = false;
      this._lastExternalAt = null;
      this._trackedFloorId = null;
      this.floorChangeMessage = "";
      this._floorChangeUntil = 0;
      this._floorNames = {};
      this._snapPosition = null;
      this._snapPath = null;
    }

    /**
     * Latch arrival so GPS / parent remaining jitter cannot flip the HUD
     * between turn-by-turn and "You've arrived" every frame.
     */
    applyArrivalLatch(remainingMeters, options) {
      if (options?.forceClear) {
        this.arrived = false;
        return;
      }
      if (options?.forceComplete) {
        this.arrived = true;
        return;
      }
      if (remainingMeters == null || !Number.isFinite(remainingMeters)) return;
      if (this.arrived) {
        if (remainingMeters > ARRIVE_EXIT_M) this.arrived = false;
        return;
      }
      if (remainingMeters <= ARRIVE_ENTER_M) this.arrived = true;
    }

    setRoute(route) {
      window.FplacesArDebug?.log("Navigator", "setRoute called", {
        hasRoute: !!route,
        summary: window.FplacesArDebug?.routeSummary(route),
      });
      window.FplacesRouteLaneHeading?.reset?.();
      this.stopGps();
      this.route = route;
      if (route?.pathCoordinates?.length) {
        route.pathCoordinates =
          window.FplacesFloorTransitions?.ensurePathFloors?.(
            route.pathCoordinates,
          ) || route.pathCoordinates;
      }
      this.arrived = false;
      this.offPathMessage = "";
      this._warnedShortPath = false;
      this.lastPosition = null;
      this.positionSource = "none";
      this.externalHeadingDegrees = null;
      this.pathSegmentIndex = 0;
      this.snappedOnPath = null;
      this._snapPosition = null;
      this._snapPath = null;
      this._smoothDistToTarget = null;
      this._lastTargetTickAt = null;
      this._lastTargetRaw = null;
      this._lastTargetFrame = null;
      this._smoothDistRemaining = null;
      this._lastRemainingTickAt = null;
      this._lastRemainingRaw = null;
      this._prevPositionSample = null;
      this._moveSpeedMps = 0;
      this._lastRemainingFrame = null;
      this._displayAlongPathM = null;
      this._lastAlongTickAt = null;
      this._gpsOffRouteMeters = Infinity;
      this._parentSimulatorAuthority = false;
      this._authoritativeAlongPathM = null;
      this._authoritativeAlongAt = 0;
      this._authoritativeSimSpeedMps = PARENT_SIM_WALK_MPS;
      this._prevAuthoritativeAlong = null;
      this._prevAuthoritativeAt = null;
      this._simDisplayAlongPathM = null;
      this._lastSimDisplayTickAt = null;
      this._lastExternalAt = null;
      this._trackedFloorId = null;
      this.floorChangeMessage = "";
      this._floorChangeUntil = 0;
      this._floorNames = {};
      if (route?.floors) {
        for (const floor of route.floors) {
          if (floor?.id) this._floorNames[floor.id] = floor.name || floor.id;
        }
      }
      this.maneuvers = route ? enrichManeuvers(route) : [];
      this.maneuverIndex = 0;
      window.FplacesMinimap?.setRoute?.(route?.pathCoordinates || null);

      const seedPosition =
        route?.userPosition?.latitude != null &&
        route?.userPosition?.longitude != null
          ? route.userPosition
          : route?.origin?.latitude != null && route?.origin?.longitude != null
            ? { ...route.origin, source: "routeOrigin", accuracy: 8 }
            : null;

      if (seedPosition) {
        window.FplacesArDebug?.log(
          "Navigator",
          "Applying seed position from route payload",
          seedPosition,
        );
        this.applyPosition(
          {
            latitude: seedPosition.latitude,
            longitude: seedPosition.longitude,
            heading: seedPosition.heading,
            accuracy: seedPosition.accuracy,
            floorId: seedPosition.floorId,
            source: seedPosition.source || "route",
          },
          { skipAdvance: true, silent: true },
        );
        this.syncManeuverIndexFromAlong(this._displayAlongPathM ?? 0);
        this.notify();
      } else {
        window.FplacesArDebug?.log(
          "Navigator",
          "No seed position in route - waiting for GPS/external feed",
        );
        this._displayAlongPathM = 0;
        this.notify();
      }

      const navProgress = route?.navigationProgress;
      if (navProgress && typeof navProgress.alongPathMeters === "number") {
        if (
          navProgress.navigationAuthority === "parent-simulator" ||
          (window.FPLACES_AR_CONFIG?.useGpsProgress === false &&
            navProgress.source === "simulator")
        ) {
          this.enableParentSimulatorAuthority();
        }
        this.applyNavigationSync(navProgress);
      } else if (window.__fplacesPendingNavigationSync) {
        this.applyNavigationSync(window.__fplacesPendingNavigationSync);
        window.__fplacesPendingNavigationSync = null;
      }
    }

    isParentEmbeddedNav() {
      const cfg = window.FPLACES_AR_CONFIG || {};
      return cfg.useGpsProgress === false;
    }

    isParentSimulatorAuthority() {
      if (!this.isParentEmbeddedNav()) return false;
      return (
        this._parentSimulatorAuthority ||
        window.__fplacesParentSimulatorAuthority === true
      );
    }

    enableParentSimulatorAuthority() {
      if (!this.isParentEmbeddedNav()) return;
      this._parentSimulatorAuthority = true;
      window.__fplacesParentSimulatorAuthority = true;
    }

    recordParentSimulatorClock(along) {
      const now = performance.now();
      if (
        this._prevAuthoritativeAlong != null &&
        this._prevAuthoritativeAt != null
      ) {
        const dt = (now - this._prevAuthoritativeAt) / 1000;
        const delta = along - this._prevAuthoritativeAlong;
        if (dt > 0.02 && dt < 0.5 && delta >= -0.05) {
          this._authoritativeSimSpeedMps = Math.max(
            0.05,
            Math.min(2.5, delta / dt),
          );
        }
      }
      this._prevAuthoritativeAlong = along;
      this._prevAuthoritativeAt = now;
      this._authoritativeAlongPathM = along;
      this._authoritativeAlongAt = now;

      if (
        this._simDisplayAlongPathM != null &&
        along < this._simDisplayAlongPathM - 0.4
      ) {
        this._simDisplayAlongPathM = along;
      }
    }

    /** 60fps dead-reckoning between parent 10Hz simulator ticks. */
    tickParentSimDisplayAlong(now) {
      const path = this.route?.pathCoordinates || [];
      const total = path.length
        ? window.FplacesRouteGeometry.totalPathLengthMeters(path)
        : 0;
      const auth = this._authoritativeAlongPathM ?? 0;
      const authAt = this._authoritativeAlongAt ?? now;
      const speed = this._authoritativeSimSpeedMps ?? PARENT_SIM_WALK_MPS;
      const progress = window.__fplacesNavigationProgress || {};
      const moving =
        progress.routeSimulating &&
        !progress.routeSimulationComplete &&
        !this.arrived;

      let target = auth;
      if (moving) {
        const dt = Math.max(
          0,
          Math.min(PARENT_SIM_EXTRAP_CAP_S, (now - authAt) / 1000),
        );
        target = Math.min(total, auth + speed * dt);
      }

      if (this._simDisplayAlongPathM == null) {
        this._simDisplayAlongPathM = target;
        this._lastSimDisplayTickAt = now;
        return Math.max(0, Math.min(total, target));
      }

      const dtFrame = Math.min(
        0.05,
        (now - (this._lastSimDisplayTickAt ?? now)) / 1000,
      );
      this._lastSimDisplayTickAt = now;
      this._simDisplayAlongPathM +=
        (target - this._simDisplayAlongPathM) * Math.min(1, dtFrame * 24);

      return Math.max(0, Math.min(total, this._simDisplayAlongPathM));
    }

    syncSimulatorProgressFromAuthority(progress) {
      const path = this.route?.pathCoordinates || [];
      if (!path.length) return;

      const along = Math.max(0, this._authoritativeAlongPathM ?? 0);
      this.syncManeuverIndexFromAlong(along);
      this._displayAlongPathM = along;

      if (progress?.routeSimulationComplete) {
        if (!this.arrived) {
          window.FplacesArDebug?.log(
            "Navigator",
            "Arrived at destination (parent simulator)",
            { alongMeters: along },
          );
        }
        this.applyArrivalLatch(0, { forceComplete: true });
        const total = window.FplacesRouteGeometry.totalPathLengthMeters(path);
        this._authoritativeAlongPathM = total;
        this._simDisplayAlongPathM = total;
        this._smoothDistRemaining = 0;
        this._smoothDistToTarget = 0;
        return;
      }

      const total = window.FplacesRouteGeometry.totalPathLengthMeters(path);
      this.applyArrivalLatch(Math.max(0, total - along));
    }

    /**
     * Apply shared 2D ↔ AR navigation progress (position, distances, maneuver index).
     * @param {{ alongPathMeters: number, routeSimulating?: boolean, routeSimulationComplete?: boolean, latitude?: number, longitude?: number, heading?: number, floorId?: string, source?: string }} progress
     */
    applyNavigationSync(progress) {
      if (!progress || typeof progress.alongPathMeters !== "number") return;

      const path = this.route?.pathCoordinates || [];
      if (!path.length) {
        window.__fplacesPendingNavigationSync = progress;
        return;
      }

      const geo = window.FplacesRouteGeometry;
      const total = geo.totalPathLengthMeters(path);
      const along = Math.max(0, Math.min(total, progress.alongPathMeters));

      let latitude = progress.latitude;
      let longitude = progress.longitude;
      let floorId = progress.floorId;

      if (latitude == null || longitude == null) {
        const snap = geo.snapAtDistanceAlongPath(path, along);
        if (snap) {
          latitude = snap.latitude;
          longitude = snap.longitude;
          floorId = snap.floorId ?? floorId;
        }
      }

      if (latitude == null || longitude == null) return;

      window.__fplacesNavigationProgress = {
        ...progress,
        alongPathMeters: along,
      };

      const useParentSimulator =
        progress.navigationAuthority === "parent-simulator" ||
        (this.isParentEmbeddedNav() &&
          (progress.source === "simulator" || progress.routeSimulating));

      if (useParentSimulator) {
        this.enableParentSimulatorAuthority();
      }

      const useSimulator =
        useParentSimulator ||
        progress.routeSimulating ||
        progress.source === "simulator" ||
        this.positionSource === "simulator";

      if (useParentSimulator) {
        this.recordParentSimulatorClock(along);
        this.syncSimulatorProgressFromAuthority(progress);
        this.applySimulatorPosition(
          {
            latitude,
            longitude,
            heading: progress.heading,
            accuracy: 4,
            floorId,
            alongPathMeters: along,
            source: "simulator",
          },
          { silent: true, parentClock: true },
        );
        this.notify();
        return;
      }

      const arrivalThresholdM = ARRIVE_ENTER_M;
      const remainingAlong = Math.max(0, total - along);
      const parentRemaining = progress.routeRemainingMeters;
      const remaining =
        parentRemaining != null && Number.isFinite(parentRemaining)
          ? parentRemaining
          : remainingAlong;
      const genuinelyComplete =
        (progress.routeSimulationComplete &&
          remainingAlong <= arrivalThresholdM) ||
        (parentRemaining != null &&
          parentRemaining <= arrivalThresholdM &&
          along > 1);

      if (genuinelyComplete) {
        this.applyArrivalLatch(remaining, { forceComplete: true });
        this.syncManeuverIndexFromAlong(along);
        this.notify();
        return;
      }

      this.applyArrivalLatch(remaining);

      if (useSimulator) {
        this.applySimulatorPosition(
          {
            latitude,
            longitude,
            heading: progress.heading,
            accuracy: 4,
            floorId,
            alongPathMeters: along,
            source: "simulator",
          },
          { silent: true },
        );
      } else {
        this._displayAlongPathM = along;
        this._lastAlongTickAt = performance.now();
        this.syncManeuverIndexFromAlong(along);
        this.applyPosition(
          {
            latitude,
            longitude,
            heading: progress.heading,
            accuracy: 4,
            floorId,
            alongPathMeters: along,
            source: progress.source || "external",
          },
          { skipAdvance: true, silent: true },
        );
      }

      this.notify();
    }

    resetProgressAtSnap(snap) {
      if (!snap || snap.latitude == null || snap.longitude == null) return;

      const path = this.route?.pathCoordinates || [];
      let alongM = snap.distanceAlongPathMeters;
      if (alongM == null && path.length) {
        const routeSnap = window.FplacesRouteGeometry?.snapToRoute?.(
          path,
          snap.latitude,
          snap.longitude,
          {
            floorId: snap.floorId || null,
            legs: this.route?.legs || null,
            currentLegIndex: this.route?.currentLegIndex ?? 0,
          },
        );
        alongM = routeSnap?.distanceAlongPathMeters ?? 0;
      }

      this.arrived = false;
      this._displayAlongPathM = alongM ?? 0;
      this._lastAlongTickAt = performance.now();
      this._smoothDistRemaining = null;
      this._smoothDistToTarget = null;
      this._lastRemainingFrame = null;
      this._lastTargetFrame = null;
      this._lastTargetTickAt = null;
      this._lastRemainingTickAt = null;
      this._prevPositionSample = null;
      this._moveSpeedMps = 0;
      this.syncManeuverIndexFromAlong(alongM ?? 0);

      this.applyPosition(
        {
          latitude: snap.latitude,
          longitude: snap.longitude,
          accuracy: 4,
          floorId: snap.floorId,
          source: "calibrate",
        },
        { skipAdvance: true, silent: true },
      );
      this.notify();
    }

    /** Set maneuver index from along-path progress without threshold skipping. */
    syncManeuverIndexFromAlong(alongMeters) {
      if (!this.maneuvers.length) {
        this.maneuverIndex = 0;
        return;
      }
      const along = Math.max(0, alongMeters ?? 0);
      if (along <= 0.05) {
        this.maneuverIndex = 0;
        return;
      }
      let idx = 0;
      for (let i = 0; i < this.maneuvers.length; i++) {
        const mAlong = this.maneuvers[i].alongPathMeters;
        if (typeof mAlong === "number" && mAlong <= along) {
          idx = i;
        } else {
          break;
        }
      }
      this.maneuverIndex = idx;
    }

    /**
     * External position feed (Flutter map, Mappedin blue dot, etc.)
     * @param {{ latitude: number, longitude: number, heading?: number, accuracy?: number, floorId?: string, source?: string }} pos
     */
    applyPosition(pos, options = {}) {
      if (!pos || pos.latitude == null || pos.longitude == null) {
        window.FplacesArDebug?.warn(
          "Navigator",
          "applyPosition ignored - invalid coords",
          pos,
        );
        return;
      }

      window.FplacesArDebug?.log(
        "Navigator",
        `applyPosition (${pos.source || "external"})`,
        {
          latitude: pos.latitude,
          longitude: pos.longitude,
          heading: pos.heading,
          accuracy: pos.accuracy,
          floorId: pos.floorId,
          alongPathMeters: pos.alongPathMeters,
        },
      );

      this.lastPosition = {
        latitude: Number(pos.latitude),
        longitude: Number(pos.longitude),
        accuracy: pos.accuracy != null ? Number(pos.accuracy) : null,
        heading: pos.heading != null ? Number(pos.heading) : null,
        floorId: pos.floorId || null,
      };
      this.positionSource = pos.source || "external";

      if (window.FplacesIndoorPosition?.isVenueSource?.(this.positionSource)) {
        this._lastExternalAt = performance.now();
      }

      this.updateFloorTracking(this.lastPosition.floorId);

      if (
        this.lastPosition.heading != null &&
        !Number.isNaN(this.lastPosition.heading)
      ) {
        this.externalHeadingDegrees =
          ((this.lastPosition.heading % 360) + 360) % 360;
      }

      if (this.positionSource === "simulator") {
        this.stopGps();
        this.updateMovementSpeed(
          this.lastPosition.latitude,
          this.lastPosition.longitude,
        );
        this.applySimulatorPosition(pos, options);
        return;
      }

      this.updateMovementSpeed(
        this.lastPosition.latitude,
        this.lastPosition.longitude,
      );

      if (options.skipAdvance) {
        this.ensureSnap();
        const gpsAlong = this.snappedOnPath?.distanceAlongPathMeters ?? 0;
        this._displayAlongPathM = gpsAlong;
        this._lastAlongTickAt = performance.now();
      } else {
        this.advanceAlongPath();
      }
      this.managePositionSources();
      if (
        window.FplacesSlamPose?.shouldUseFusion?.(this) &&
        window.FplacesIndoorPosition?.isVenueSource?.(this.positionSource)
      ) {
        window.FplacesSlamPose.ingestVenue(this, this.lastPosition);
      }
      if (!options.silent) {
        this.notify();
      }
    }

    /** Parent PWA simulator - lock to polyline progress (same as 2D blue dot). */
    applySimulatorPosition(pos, options = {}) {
      const path = this.route?.pathCoordinates || [];
      const total = path.length
        ? window.FplacesRouteGeometry.totalPathLengthMeters(path)
        : 0;

      const parentClock =
        options.parentClock === true || this.isParentSimulatorAuthority();

      let along = this._displayAlongPathM ?? 0;
      if (
        typeof pos.alongPathMeters === "number" &&
        Number.isFinite(pos.alongPathMeters)
      ) {
        along = Math.max(0, Math.min(total, pos.alongPathMeters));
        if (parentClock) {
          this.recordParentSimulatorClock(along);
        }
      } else if (!parentClock) {
        this.ensureSnap();
        const snapAlong = this.snappedOnPath?.distanceAlongPathMeters ?? 0;
        along = Math.max(along, snapAlong);
      }

      if (!parentClock) {
        this._displayAlongPathM = along;
        this._lastAlongTickAt = performance.now();
      }

      this.positionSource = "simulator";
      this.lastPosition = {
        latitude: Number(pos.latitude),
        longitude: Number(pos.longitude),
        accuracy: pos.accuracy != null ? Number(pos.accuracy) : 4,
        heading: pos.heading != null ? Number(pos.heading) : null,
        floorId: pos.floorId || null,
      };
      if (
        this.lastPosition.heading != null &&
        !Number.isNaN(this.lastPosition.heading)
      ) {
        this.externalHeadingDegrees =
          ((this.lastPosition.heading % 360) + 360) % 360;
      }

      this._gpsOffRouteMeters = 0;
      this.offPathMessage = "";

      const snapAlongForMesh = parentClock
        ? this.tickParentSimDisplayAlong(performance.now())
        : along;
      this.snappedOnPath = window.FplacesRouteGeometry.snapAtDistanceAlongPath(
        path,
        snapAlongForMesh,
      );
      if (this.snappedOnPath) {
        this.pathSegmentIndex = this.snappedOnPath.segmentIndex;
      }

      if (parentClock) {
        this.syncSimulatorProgressFromAuthority(
          window.__fplacesNavigationProgress || {},
        );
      } else {
        this.syncSimulatorProgress();
      }

      this.stopGps();
      this.managePositionSources();
      if (!options.silent) {
        this.notify();
      }
    }

    syncSimulatorProgress() {
      if (this.isParentSimulatorAuthority()) {
        return this.syncSimulatorProgressFromAuthority(
          window.__fplacesNavigationProgress || {},
        );
      }

      const path = this.route?.pathCoordinates || [];
      if (!path.length) return;

      const total = window.FplacesRouteGeometry.totalPathLengthMeters(path);
      const along = Math.max(0, Math.min(total, this._displayAlongPathM ?? 0));
      this.syncManeuverIndexFromAlong(along);

      const remainingAlong = Math.max(0, total - along);
      const parentRemaining =
        window.__fplacesNavigationProgress?.routeRemainingMeters;
      const remaining =
        parentRemaining != null && Number.isFinite(parentRemaining)
          ? parentRemaining
          : remainingAlong;
      const onFinalManeuver =
        this.maneuvers.length === 0 ||
        this.maneuverIndex >= this.maneuvers.length - 1;
      const atEnd =
        onFinalManeuver &&
        along > 1 &&
        remainingAlong <= ARRIVE_ENTER_M &&
        (parentRemaining == null || parentRemaining <= ARRIVE_ENTER_M);

      if (atEnd) {
        if (!this.arrived) {
          window.FplacesArDebug?.log(
            "Navigator",
            "Arrived at destination (simulator)",
            {
              alongMeters: along,
              totalMeters: total,
            },
          );
        }
        this.applyArrivalLatch(remaining, { forceComplete: true });
        this._displayAlongPathM = total;
        this._smoothDistRemaining = 0;
      } else {
        this.applyArrivalLatch(remaining);
      }
    }

    currentManeuver() {
      return this.maneuvers[this.maneuverIndex] || null;
    }

    currentInstructionText() {
      const m = this.currentManeuver();
      if (this.isParentSimulatorAuthority() && m) {
        let text = m.instruction || m.actionType || "Continue";
        if (m.distanceMeters > 0) {
          text += ` (${Math.round(m.distanceMeters)} m)`;
        }
        return text;
      }
      if (this.route?.instructions) return this.route.instructions;
      if (!m) return "Follow the route";
      let text = m.instruction || m.actionType || "Continue";
      if (m.distanceMeters > 0) {
        text += ` (${Math.round(m.distanceMeters)} m)`;
      }
      return text;
    }

    updateMovementSpeed(lat, lng) {
      const now = performance.now();
      if (this._prevPositionSample) {
        const dt = (now - this._prevPositionSample.at) / 1000;
        if (dt > 0.15 && dt < 45) {
          const d = haversineMeters(this._prevPositionSample, {
            latitude: lat,
            longitude: lng,
          });
          // Indoor GPS wanders while standing; don't treat jitter as walking.
          if (d < 0.9) {
            this._moveSpeedMps = 0;
          } else {
            const speed = d / dt;
            this._moveSpeedMps = speed > 3.5 ? 0 : speed;
          }
        }
      }
      this._prevPositionSample = { latitude: lat, longitude: lng, at: now };
    }

    isVenuePositionActive() {
      const cfg = window.FPLACES_AR_CONFIG || {};
      return window.FplacesIndoorPosition?.isVenueFeed?.(
        cfg,
        this.positionSource,
        this._lastExternalAt,
      );
    }

    isVenueSnapTrustworthy() {
      return (
        this.isVenuePositionActive() &&
        window.FplacesIndoorPosition?.isTrustworthy?.(
          this.lastPosition,
          this.positionSource,
        )
      );
    }

    offRouteThresholdMeters() {
      return (
        window.FplacesIndoorPosition?.offRouteThresholdMeters?.(
          this.lastPosition,
          this.positionSource,
        ) ??
        (() => {
          const accuracy = this.lastPosition?.accuracy || 15;
          return Math.max(25, accuracy * 2);
        })()
      );
    }

    isGpsSnapTrustworthy() {
      if (this.isVenueSnapTrustworthy()) return true;
      return (
        (this._gpsOffRouteMeters ?? Infinity) <= this.offRouteThresholdMeters()
      );
    }

    managePositionSources() {
      const cfg = window.FPLACES_AR_CONFIG || {};
      if (this.isVenuePositionActive()) {
        this.stopGps();
        return;
      }
      if (
        cfg.useGpsProgress !== false &&
        this.watchId == null &&
        this.route?.pathCoordinates?.length
      ) {
        this.startGps();
      }
    }

    floorLabel(floorId) {
      if (!floorId) return "";
      return this._floorNames[floorId] || `Floor ${floorId}`;
    }

    updateFloorTracking(floorId) {
      if (!floorId) return;
      const prev = this._trackedFloorId;
      if (prev && prev !== floorId) {
        const transitions =
          window.FplacesFloorTransitions?.detectTransitions?.(this.route) || [];
        const tr = transitions.find((t) => t.toFloorId === floorId);
        const kind = tr?.kind;
        const kindLabel =
          kind === "elevator"
            ? "Take the elevator"
            : kind === "stairs"
              ? "Take the stairs"
              : kind === "escalator"
                ? "Take the escalator"
                : "Floor change";
        this.floorChangeMessage = `${kindLabel} - now on ${this.floorLabel(floorId)}`;
        this._floorChangeUntil = performance.now() + 4500;
        window.FplacesArDebug?.log("Navigator", "Floor changed", {
          from: prev,
          to: floorId,
          kind,
        });

        try {
          const cfg = window.FPLACES_AR_CONFIG || {};
          const target = cfg.pwaOrigin || window.location.origin;
          window.parent?.postMessage?.(
            { type: "fplaces_floor_change", floorId },
            target,
          );
        } catch {
          /* cross-origin */
        }

        if (window.FplacesWorldRoute?.isAttached?.()) {
          window.FplacesWorldRoute.setRoute(this);
        }
      }
      this._trackedFloorId = floorId;
    }

    /** When indoor GPS is off the venue polyline, infer slow walk if facing the route. */
    effectiveMoveSpeedMps() {
      if (this._moveSpeedMps > 0.03) return this._moveSpeedMps;
      if (
        this.positionSource === "route" ||
        this.positionSource === "none" ||
        this.positionSource === "calibrate"
      ) {
        return this._moveSpeedMps;
      }
      if (this.isGpsSnapTrustworthy()) return this._moveSpeedMps;

      const heading = window.FplacesSlamHeading?.isActive?.()
        ? window.FplacesSlamHeading.getHeadingDegrees?.()
        : (window.FplacesOrientationCompass?.getDeviceHeading?.() ??
          this.externalHeadingDegrees);
      const target = this.getTargetBearingDegrees();
      if (heading == null || target == null) return 0;

      const delta = Math.abs(normalizeDeltaDegrees(heading, target));
      if (delta > 40) return 0;
      return 0.55;
    }

    /** Live progress along route polyline - blends GPS snap + walking extrapolation. */
    getDisplayAlongPathMeters(gpsAlongMeters) {
      const path = this.route?.pathCoordinates || [];
      const total = path.length
        ? window.FplacesRouteGeometry.totalPathLengthMeters(path)
        : 0;

      if (
        this.isParentSimulatorAuthority() &&
        this.positionSource === "simulator"
      ) {
        return this.tickParentSimDisplayAlong(performance.now());
      }

      if (this.positionSource === "simulator") {
        return Math.max(
          0,
          Math.min(total, this._displayAlongPathM ?? gpsAlongMeters ?? 0),
        );
      }

      const fusedAlong = window.FplacesSlamPose?.getFusedAlongPathMeters?.(
        this,
        gpsAlongMeters,
      );
      if (
        fusedAlong != null &&
        window.FplacesSlamPose?.shouldUseFusion?.(this)
      ) {
        this._displayAlongPathM = fusedAlong;
        this._lastAlongTickAt = performance.now();
        return fusedAlong;
      }

      const gpsAlong = gpsAlongMeters ?? 0;
      const now = performance.now();

      if (this._displayAlongPathM == null || this._lastAlongTickAt == null) {
        this._displayAlongPathM = gpsAlong;
        this._lastAlongTickAt = now;
        return this._displayAlongPathM;
      }

      const dt = Math.min(1, (now - this._lastAlongTickAt) / 1000);
      this._lastAlongTickAt = now;

      const speed = this.effectiveMoveSpeedMps();
      const trustGps = this.isGpsSnapTrustworthy();

      if (
        trustGps &&
        Math.abs(gpsAlong - this._displayAlongPathM) >
          (this.isVenueSnapTrustworthy() ? 2 : 4)
      ) {
        this._displayAlongPathM = gpsAlong;
      } else if (trustGps) {
        const blend = this.isVenueSnapTrustworthy() ? 14 : 8;
        this._displayAlongPathM +=
          (gpsAlong - this._displayAlongPathM) * Math.min(1, dt * blend);
      }
      if (speed > 0.03 && dt > 0 && !this.isVenueSnapTrustworthy()) {
        this._displayAlongPathM += speed * dt;
      }

      return Math.max(0, Math.min(total, this._displayAlongPathM));
    }

    /** Snap point used for display (minimap + distances). */
    getDisplaySnap() {
      const path = this.route?.pathCoordinates || [];
      if (!path.length) return this.snappedOnPath;

      if (
        this.isParentSimulatorAuthority() &&
        this.positionSource === "simulator"
      ) {
        const along = this.tickParentSimDisplayAlong(performance.now());
        return (
          window.FplacesRouteGeometry.snapAtDistanceAlongPath(path, along) ||
          this.snappedOnPath
        );
      }

      if (
        this.positionSource === "simulator" &&
        this._displayAlongPathM != null
      ) {
        return (
          window.FplacesRouteGeometry.snapAtDistanceAlongPath(
            path,
            this._displayAlongPathM,
          ) || this.snappedOnPath
        );
      }

      this.ensureSnap();
      if (!path.length) return this.snappedOnPath;

      const gpsAlong = this.snappedOnPath?.distanceAlongPathMeters ?? 0;
      const along = this.getDisplayAlongPathMeters(gpsAlong);
      return (
        window.FplacesRouteGeometry.snapAtDistanceAlongPath(path, along) ||
        this.snappedOnPath
      );
    }

    ensureSnap() {
      const path = this.route?.pathCoordinates || [];
      if (!path.length || !this.lastPosition) return;

      if (
        this.isParentSimulatorAuthority() &&
        this.positionSource === "simulator"
      ) {
        const along = this.tickParentSimDisplayAlong(performance.now());
        this.snappedOnPath =
          window.FplacesRouteGeometry.snapAtDistanceAlongPath(path, along);
        if (this.snappedOnPath) {
          this.pathSegmentIndex = this.snappedOnPath.segmentIndex;
        }
        return;
      }

      if (
        this._snapPosition === this.lastPosition &&
        this._snapPath === path
      ) {
        return;
      }
      this._snapPosition = this.lastPosition;
      this._snapPath = path;

      const snapOpts = {
        ...(window.FplacesIndoorPosition?.snapOptions?.(
          this.lastPosition,
          this.positionSource,
        ) || { floorId: this.lastPosition.floorId }),
        floorId: this.lastPosition.floorId,
        legs: this.route?.legs || null,
        currentLegIndex: this.route?.currentLegIndex ?? 0,
        legId:
          this.route?.legs?.[this.route?.currentLegIndex ?? 0]?.legId || null,
      };

      const gpsSnap = window.FplacesRouteGeometry?.snapToRoute?.(
        path,
        this.lastPosition.latitude,
        this.lastPosition.longitude,
        snapOpts,
      );
      this._gpsOffRouteMeters = gpsSnap?.offRouteMeters ?? Infinity;

      if (gpsSnap && gpsSnap.offRouteMeters <= this.offRouteThresholdMeters()) {
        this.snappedOnPath = gpsSnap;
        if (
          this._displayAlongPathM == null ||
          Math.abs(gpsSnap.distanceAlongPathMeters - this._displayAlongPathM) >
            2
        ) {
          this._displayAlongPathM = gpsSnap.distanceAlongPathMeters;
        }
      } else if (this._displayAlongPathM != null) {
        this.snappedOnPath =
          window.FplacesRouteGeometry.snapAtDistanceAlongPath(
            path,
            this._displayAlongPathM,
          ) || gpsSnap;
      } else {
        this.snappedOnPath = gpsSnap;
        if (gpsSnap) this._displayAlongPathM = gpsSnap.distanceAlongPathMeters;
      }

      if (this.snappedOnPath) {
        this.pathSegmentIndex = this.snappedOnPath.segmentIndex;
      }
    }

    updateSnap() {
      this.ensureSnap();
    }

    activePathIndex() {
      if (this.snappedOnPath != null) return this.snappedOnPath.segmentIndex;
      const path = this.route?.pathCoordinates || [];
      if (!path.length) return 0;
      if (this.lastPosition) {
        return findClosestPathIndex(
          path,
          this.lastPosition.latitude,
          this.lastPosition.longitude,
        ).index;
      }
      return this.pathSegmentIndex;
    }

    /** Raw along-path distance to the next maneuver (or destination). */
    distanceToCurrentTargetMeters() {
      this.ensureSnap();
      const path = this.route?.pathCoordinates || [];
      if (!path.length) return null;

      const gpsAlong = this.snappedOnPath?.distanceAlongPathMeters ?? 0;
      const along = this.getDisplayAlongPathMeters(gpsAlong);
      const next = this.maneuvers[this.maneuverIndex + 1];

      if (next && typeof next.alongPathMeters === "number") {
        return Math.max(0, next.alongPathMeters - along);
      }

      const snap = this.getDisplaySnap();
      if (!snap) return null;

      if (next && typeof next.pathIndex === "number") {
        return window.FplacesRouteGeometry.distanceAlongPathBetween(
          path,
          snap,
          next.pathIndex,
        );
      }

      const total = window.FplacesRouteGeometry.totalPathLengthMeters(path);
      return Math.max(0, total - along);
    }

    /** Live distance to next maneuver - updates every frame with 0.1 m precision. */
    getDisplayDistanceMeters() {
      const raw = this.distanceToCurrentTargetMeters();
      if (raw == null) return this._smoothDistToTarget;

      const now = performance.now();
      if (this._smoothDistToTarget == null || this._lastTargetTickAt == null) {
        this._smoothDistToTarget = raw;
        this._lastTargetTickAt = now;
        return Math.max(0, this._smoothDistToTarget);
      }

      const dt = Math.min(1, (now - this._lastTargetTickAt) / 1000);
      this._lastTargetTickAt = now;

      const parentSim =
        this.isParentSimulatorAuthority() &&
        this.positionSource === "simulator";
      const speed = parentSim
        ? (this._authoritativeSimSpeedMps ?? PARENT_SIM_WALK_MPS)
        : this.effectiveMoveSpeedMps();

      this._smoothDistToTarget +=
        (raw - this._smoothDistToTarget) *
        Math.min(1, dt * (parentSim ? 18 : 14));
      if (speed > 0.03 && dt > 0) {
        this._smoothDistToTarget = Math.max(
          0,
          this._smoothDistToTarget - speed * dt,
        );
      }
      if (this._smoothDistToTarget < raw - 1.5) this._smoothDistToTarget = raw;
      if (this._smoothDistToTarget > raw + 1.5 && raw >= 0)
        this._smoothDistToTarget = raw;

      return Math.max(0, this._smoothDistToTarget);
    }

    distanceToNextManeuverMeters() {
      return this.distanceToCurrentTargetMeters();
    }

    distanceRemainingToDestinationMeters() {
      const progress = window.__fplacesNavigationProgress;
      if (progress?.routeRemainingMeters != null) {
        return Math.max(0, progress.routeRemainingMeters);
      }

      if (
        this.isParentSimulatorAuthority() &&
        this.positionSource === "simulator"
      ) {
        const path = this.route?.pathCoordinates || [];
        if (!path.length) return null;
        const total = window.FplacesRouteGeometry.totalPathLengthMeters(path);
        const along = this._authoritativeAlongPathM ?? 0;
        return Math.max(0, total - along);
      }

      this.ensureSnap();
      const path = this.route?.pathCoordinates || [];
      if (!path.length || !this.snappedOnPath) return null;
      return window.FplacesRouteGeometry.distanceAlongPathToEnd(
        path,
        this.snappedOnPath,
      );
    }

    /**
     * Remaining distance for the trip footer.
     * Parent remaining (PWA) is authoritative when present so stop/walk
     * matches the map sheet; otherwise interpolate local GPS remaining.
     */
    getDisplayDistanceRemainingMeters() {
      if (this.arrived) return 0;
      const raw = this.distanceRemainingToDestinationMeters();
      if (raw == null) return this._smoothDistRemaining;

      const now = performance.now();
      const parentRemaining =
        window.__fplacesNavigationProgress?.routeRemainingMeters != null;
      if (parentRemaining) {
        this._smoothDistRemaining = raw;
        this._lastRemainingRaw = raw;
        this._lastRemainingTickAt = now;
        return Math.max(0, raw);
      }

      const parentSim =
        this.isParentSimulatorAuthority() &&
        this.positionSource === "simulator";
      const frameBucket = parentSim
        ? Math.floor(now / 16)
        : Math.floor(now / 32);
      if (
        this._lastRemainingFrame === frameBucket &&
        this._smoothDistRemaining != null
      ) {
        return Math.max(0, this._smoothDistRemaining);
      }
      this._lastRemainingFrame = frameBucket;

      if (
        this._smoothDistRemaining == null ||
        this._lastRemainingTickAt == null
      ) {
        this._smoothDistRemaining = raw;
        this._lastRemainingRaw = raw;
        this._lastRemainingTickAt = now;
        return Math.max(0, this._smoothDistRemaining);
      }

      const dt = Math.min(2, (now - this._lastRemainingTickAt) / 1000);
      this._lastRemainingTickAt = now;

      if (Math.abs(raw - this._lastRemainingRaw) > 0.8) {
        if (raw > this._smoothDistRemaining + 2) {
          this._smoothDistRemaining = raw;
        } else {
          this._smoothDistRemaining += (raw - this._smoothDistRemaining) * 0.55;
        }
        this._lastRemainingRaw = raw;
      } else if (
        this._moveSpeedMps > 0.35 &&
        dt > 0 &&
        this._lastRemainingRaw != null &&
        raw < this._lastRemainingRaw - 0.15
      ) {
        const speed = parentSim
          ? (this._authoritativeSimSpeedMps ?? PARENT_SIM_WALK_MPS)
          : this._moveSpeedMps;
        this._smoothDistRemaining = Math.max(
          0,
          this._smoothDistRemaining - speed * dt,
        );
        if (this._smoothDistRemaining < raw - 12)
          this._smoothDistRemaining = raw;
      }

      return Math.max(0, this._smoothDistRemaining);
    }

    /** Geographic bearing toward the next walk target on the route polyline. */
    getTargetBearingDegrees() {
      const path = this.route?.pathCoordinates || [];
      if (path.length < 2) {
        if (!this._warnedShortPath) {
          this._warnedShortPath = true;
          window.FplacesArDebug?.warn(
            "Navigator",
            "getTargetBearingDegrees - need ≥2 path points",
            {
              pathPoints: path.length,
            },
          );
        }
        return null;
      }

      const index = this.activePathIndex();
      const nextManeuver = this.maneuvers[this.maneuverIndex + 1];
      let lookaheadM = 14;

      if (nextManeuver && typeof nextManeuver.pathIndex === "number") {
        const distToTurn = distanceAlongPathMeters(
          path,
          index,
          nextManeuver.pathIndex,
        );
        if (distToTurn > 0 && distToTurn < 18) {
          lookaheadM = Math.max(4, distToTurn * 0.75);
        }
      }

      if (this.lastPosition) {
        const target = window.FplacesRouteGeometry?.pointAtDistanceAlongPath?.(
          path,
          this.snappedOnPath || {
            segmentIndex: index,
            t: 0,
            latitude: this.lastPosition.latitude,
            longitude: this.lastPosition.longitude,
          },
          lookaheadM,
        );
        if (target) {
          const from = this.snappedOnPath || this.lastPosition;
          return bearingDegrees(from, target);
        }
      }

      const bearing = segmentBearingAt(path, index, 4);
      if (bearing != null) return bearing;

      const m = this.currentManeuver();
      if (
        typeof m?.headingDegrees === "number" &&
        !Number.isNaN(m.headingDegrees)
      ) {
        return ((m.headingDegrees % 360) + 360) % 360;
      }

      return null;
    }

    getAlignmentDeltaDegrees(deviceHeading) {
      const target = this.getTargetBearingDegrees();
      if (target == null || deviceHeading == null) return null;
      let delta = target - deviceHeading;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      return delta;
    }

    turnFromManeuver(m) {
      if (!m) return { label: "Follow route", symbol: "straight" };
      const bearing = (m.bearing || m.actionType || "").toString();
      const map = {
        Left: { label: "Turn left", symbol: "turn_left" },
        Right: { label: "Turn right", symbol: "turn_right" },
        SlightLeft: { label: "Slight left", symbol: "turn_slight_left" },
        SlightRight: { label: "Slight right", symbol: "turn_slight_right" },
        Straight: { label: "Go straight", symbol: "straight" },
        Turn: { label: "Turn", symbol: "u_turn_right" },
        Departure: { label: "Head out", symbol: "straight" },
        Arrival: { label: "Arrive", symbol: "flag" },
      };
      if (map[bearing]) return map[bearing];

      const inst = (m.instruction || "").toLowerCase();
      if (inst.includes("turn right") || inst.includes("right"))
        return { label: "Turn right", symbol: "turn_right" };
      if (inst.includes("slight right"))
        return { label: "Slight right", symbol: "turn_slight_right" };
      if (inst.includes("turn left") || inst.includes("left"))
        return { label: "Turn left", symbol: "turn_left" };
      if (inst.includes("slight left"))
        return { label: "Slight left", symbol: "turn_slight_left" };
      if (inst.includes("arriv")) return { label: "Arrive", symbol: "flag" };
      if (inst.includes("straight") || inst.includes("continue"))
        return { label: "Go straight", symbol: "straight" };

      const short = (m.instruction || "Follow route").split("(")[0].trim();
      return { label: short.slice(0, 36), symbol: "straight" };
    }

    distanceToManeuverMeters(m) {
      const path = this.route?.pathCoordinates || [];
      if (!path.length || !m) return null;

      const gpsAlong = this.snappedOnPath?.distanceAlongPathMeters ?? 0;
      const along = this.getDisplayAlongPathMeters(gpsAlong);

      if (typeof m.alongPathMeters === "number") {
        return Math.max(0, m.alongPathMeters - along);
      }

      const snap = this.getDisplaySnap();
      if (!snap || typeof m.pathIndex !== "number") return null;

      return window.FplacesRouteGeometry.distanceAlongPathBetween(
        path,
        snap,
        m.pathIndex,
      );
    }

    shortTurnWord(m) {
      const label = this.turnFromManeuver(m).label.toLowerCase();
      if (label.includes("right")) return "right";
      if (label.includes("left")) return "left";
      if (
        label.includes("straight") ||
        label.includes("continue") ||
        label.includes("head")
      )
        return "straight";
      if (label.includes("arriv")) return "arrive";
      return "";
    }

    /**
     * Live instruction from heading alignment + progress.
     * Aligned → head straight (no advance turn callouts). Misaligned →
     * turn left/right/around until facing the path again.
     */
    getLiveGuidance(deviceHeading) {
      const distRaw = this.getDisplayDistanceMeters();
      const delta =
        deviceHeading != null
          ? this.getAlignmentDeltaDegrees(deviceHeading)
          : null;
      const resolve = window.FplacesLiveGuidance?.resolveLiveGuidance;
      if (typeof resolve === "function") {
        return resolve({
          arrived: this.arrived,
          destinationName: this.route?.destinationName,
          alignmentDeltaDeg: delta,
          distanceToTargetMeters: distRaw,
          remainingMeters: this.distanceRemainingToDestinationMeters(),
        });
      }

      // Fallback if live-guidance.js failed to load.
      if (this.arrived) {
        return {
          primary: {
            label: `Arrived at ${this.route?.destinationName || "destination"}`,
            symbol: "flag",
          },
          then: null,
          distanceLabel: "You have reached your destination",
          distanceMeters: 0,
          alignmentDelta: null,
        };
      }
      if (delta != null && Math.abs(delta) >= 18) {
        const primary =
          Math.abs(delta) >= 135
            ? { label: "Turn around", symbol: "u_turn_right" }
            : delta > 0
              ? { label: "Turn right", symbol: "turn_right" }
              : { label: "Turn left", symbol: "turn_left" };
        return {
          primary,
          then: null,
          distanceLabel: "Face the path",
          distanceMeters: distRaw,
          alignmentDelta: delta,
          distToTurn: distRaw,
        };
      }
      return {
        primary: { label: "Head straight", symbol: "straight" },
        then: null,
        distanceLabel: "",
        distanceMeters: distRaw,
        alignmentDelta: delta,
        distToTurn: distRaw,
      };
    }

    navigationBearing() {
      return this.getTargetBearingDegrees();
    }

    startGps() {
      if (!navigator.geolocation || !this.route?.pathCoordinates?.length) {
        window.FplacesArDebug?.warn("Navigator", "startGps skipped", {
          hasGeolocation: !!navigator.geolocation,
          pathPoints: this.route?.pathCoordinates?.length ?? 0,
        });
        return;
      }
      window.FplacesArDebug?.log("Navigator", "Starting GPS watchPosition");
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.applyPosition({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading:
              pos.coords.heading != null && !Number.isNaN(pos.coords.heading)
                ? pos.coords.heading
                : undefined,
            source: "gps",
          });
        },
        (err) => {
          window.FplacesArDebug?.warn("Navigator", "GPS watch error", {
            code: err.code,
            message: err.message,
            positionSource: this.positionSource,
          });
          if (this.positionSource === "none") {
            this.offPathMessage = `GPS: ${err.message}`;
            this.notify();
          }
        },
        { enableHighAccuracy: true, maximumAge: 500, timeout: 10000 },
      );
    }

    stopGps() {
      if (this.watchId != null) {
        window.FplacesArDebug?.log("Navigator", "Stopping GPS watch");
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
    }

    advanceAlongPath() {
      const path = this.route?.pathCoordinates || [];
      if (!path.length || !this.lastPosition) return;
      if (this.arrived) return;
      if (this.positionSource === "simulator") {
        if (this.isParentSimulatorAuthority()) {
          this.syncSimulatorProgressFromAuthority(
            window.__fplacesNavigationProgress || {},
          );
        } else {
          this.syncSimulatorProgress();
        }
        return;
      }

      this.updateSnap();

      const offRoute = this._gpsOffRouteMeters ?? Infinity;
      const accuracy = this.lastPosition.accuracy || 0;
      const offThreshold = this.offRouteThresholdMeters();
      const wasOffPath = !!this.offPathMessage;
      const cfg = window.FPLACES_AR_CONFIG || {};
      const mapProgressMode =
        cfg.useGpsProgress === false || !!cfg.preferVenuePositioning;
      // Multi-km GPS vs Mappedin path is a dead fix, not a walkable detour.
      const IMPLAUSIBLE_OFF_M = 500;
      const plausibleOff =
        Number.isFinite(offRoute) && offRoute <= IMPLAUSIBLE_OFF_M;

      this.offPathMessage = "";
      if (offRoute > offThreshold && plausibleOff) {
        if (this.isVenuePositionActive()) {
          this.offPathMessage = `Off the mapped path (~${Math.round(offRoute)} m)`;
        } else if (!mapProgressMode) {
          this.offPathMessage = `GPS off route ~${Math.round(offRoute)} m. Using map progress.`;
        }
      }
      if (this.offPathMessage && !wasOffPath) {
        window.FplacesArDebug?.warn("Navigator", "User off route", {
          distanceMeters: Math.round(offRoute),
          accuracy: Math.round(accuracy),
          pathIndex: this.pathSegmentIndex,
        });
      }

      const advanceThresholdM = this.isVenuePositionActive() ? 3 : 7;
      const gpsAlong = this.snappedOnPath?.distanceAlongPathMeters ?? 0;
      const along = this.getDisplayAlongPathMeters(gpsAlong);
      let advancedThisTick = 0;

      while (this.maneuverIndex < this.maneuvers.length - 1) {
        if (this.isVenuePositionActive() && advancedThisTick >= 1) break;

        const nextM = this.maneuvers[this.maneuverIndex + 1];
        if (!this.snappedOnPath) break;

        let distToNext;
        if (typeof nextM.alongPathMeters === "number") {
          distToNext = Math.max(0, nextM.alongPathMeters - along);
        } else if (typeof nextM.pathIndex === "number") {
          distToNext = window.FplacesRouteGeometry.distanceAlongPathBetween(
            path,
            this.getDisplaySnap(),
            nextM.pathIndex,
          );
        } else {
          break;
        }

        if (distToNext > advanceThresholdM) break;

        this.maneuverIndex++;
        advancedThisTick++;
        this._smoothDistToTarget = null;
        this._lastTargetFrame = null;
        const m = this.maneuvers[this.maneuverIndex];
        window.FplacesArDebug?.log("Navigator", "Maneuver advanced", {
          maneuverIndex: this.maneuverIndex,
          instruction: m.instruction,
          pathIndex: m.pathIndex,
          headingDegrees: m.headingDegrees,
        });
        window.FplacesRouteBridge?.sendToFlutter?.({
          event: "maneuverReached",
          instruction: m.instruction,
          legIndex: m.legIndex,
          stepIndex: m.stepIndex,
        });
      }

      const total = window.FplacesRouteGeometry.totalPathLengthMeters(path);
      const remainingAlong = Math.max(0, total - along);
      const onFinalManeuver = this.maneuverIndex >= this.maneuvers.length - 1;
      if (onFinalManeuver) {
        this.applyArrivalLatch(remainingAlong);
        if (this.arrived && remainingAlong <= ARRIVE_ENTER_M) {
          this._smoothDistRemaining = Math.max(0, remainingAlong);
        }
      }
    }

    notify() {
      const state = this.getState();

      if (typeof this.onUpdate === "function") {
        this.onUpdate(state);
      }
      window.FplacesOrientationCompass?.attachNavigator?.(this);
      const minimapHeading = window.FplacesSlamHeading?.isActive?.()
        ? window.FplacesSlamHeading.getHeadingDegrees?.()
        : this.positionSource === "simulator" ||
            this.lastPosition?.source === "simulator"
          ? (this.lastPosition?.heading ??
            this.externalHeadingDegrees ??
            this.getTargetBearingDegrees?.())
          : (window.FplacesOrientationCompass?.getDeviceHeading?.() ?? null);
      const now = performance.now();
      if (!this._lastMinimapAt || now - this._lastMinimapAt > 300) {
        this._lastMinimapAt = now;
        window.FplacesMinimap?.update?.(this, minimapHeading ?? null);
      }
      if (!window.__fplacesXrSessionActive) {
        window.FplacesLiveViewHud?.update?.(state, this);
      }
      window.FplacesArDebug?.logNavStateThrottled(
        "Navigator",
        "State notify",
        state,
        2500,
      );
    }

    getState() {
      if (this.lastPosition) this.ensureSnap();

      if (
        this.isParentSimulatorAuthority() &&
        this.positionSource === "simulator"
      ) {
        this.syncManeuverIndexFromAlong(this._authoritativeAlongPathM ?? 0);
      }

      const path = this.route?.pathCoordinates || [];
      const index = this.activePathIndex();
      const distToEnd = this.getDisplayDistanceRemainingMeters();
      const distToTarget = this.getDisplayDistanceMeters();

      return {
        instruction: this.arrived
          ? `Arrived at ${this.route?.destinationName || "destination"}`
          : this.currentInstructionText(),
        maneuverIndex: this.maneuverIndex,
        maneuverCount: this.maneuvers.length,
        destinationName: this.route?.destinationName,
        distanceMeters: this.route?.distanceMeters,
        distanceRemainingMeters: distToEnd,
        distanceRemainingRawMeters: this.distanceRemainingToDestinationMeters(),
        distanceToTargetMeters: distToTarget,
        distanceToNextManeuverMeters: this.distanceToCurrentTargetMeters(),
        pathPointCount: path.length,
        pathSegmentIndex: index,
        snappedOnPath: this.snappedOnPath,
        offPathMessage: this.offPathMessage || "",
        floorId: this.lastPosition?.floorId || null,
        floorLabel: this.floorLabel(this.lastPosition?.floorId),
        floorChangeMessage:
          this._floorChangeUntil && performance.now() < this._floorChangeUntil
            ? this.floorChangeMessage
            : "",
        venuePositionActive: this.isVenuePositionActive(),
        targetBearingDegrees: this.getTargetBearingDegrees(),
        navigationBearing: this.getTargetBearingDegrees(),
        externalHeadingDegrees: this.externalHeadingDegrees,
        deviceHeadingDegrees:
          window.FplacesOrientationCompass?.getDeviceHeading?.() ?? null,
        alignmentDeltaDegrees:
          window.FplacesOrientationCompass?.getAlignmentDelta?.(
            {
              externalHeadingDegrees: this.externalHeadingDegrees,
              lastPosition: this.lastPosition,
            },
            this.getTargetBearingDegrees(),
          ),
        lastPosition: this.lastPosition,
        positionSource: this.positionSource,
        arrived: !!this.arrived,
        hasPosition: !!this.lastPosition,
      };
    }
  }

  window.FplacesRouteNavigator = RouteNavigator;
})();
