/**
 * Turn-by-turn progress along Mappedin pathCoordinates + maneuvers.
 * Position: GPS, or external updates via onFlutterPosition / applyPosition.
 */
(function () {
  const R = 6371000;

  function haversineMeters(a, b) {
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
    const lat1 = (a.latitude * Math.PI) / 180;
    const lat2 = (b.latitude * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function bearingDegrees(from, to) {
    const lat1 = (from.latitude * Math.PI) / 180;
    const lat2 = (to.latitude * Math.PI) / 180;
    const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
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
    const snap = window.FplacesRouteGeometry?.snapAtDistanceAlongPath?.(path, metersAlong);
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
      return maneuvers.map((m, i) => ({ ...m, pathIndex: i, alongPathMeters: 0 }));
    }

    let cumulative = 0;
    return maneuvers.map((m, i) => {
      const alongPathMeters = cumulative;
      const stepDist =
        m.distanceMeters != null && Number(m.distanceMeters) > 0
          ? Number(m.distanceMeters)
          : 0;

      let pathIndex = typeof m.pathIndex === 'number' ? m.pathIndex : null;
      let headingDegrees =
        typeof m.headingDegrees === 'number' ? m.headingDegrees : null;

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
          latitude: path[i].latitude + t * (path[i + 1].latitude - path[i].latitude),
          longitude: path[i].longitude + t * (path[i + 1].longitude - path[i].longitude),
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
      this.positionSource = 'none';
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
      this.arrived = false;
      this.offPathMessage = '';
      this._warnedShortPath = false;
    }

    setRoute(route) {
      window.FplacesArDebug?.log('Navigator', 'setRoute called', {
        hasRoute: !!route,
        summary: window.FplacesArDebug?.routeSummary(route),
      });
      window.FplacesRouteLaneHeading?.reset?.();
      this.stopGps();
      this.route = route;
      this.arrived = false;
      this.offPathMessage = '';
      this._warnedShortPath = false;
      this.lastPosition = null;
      this.positionSource = 'none';
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
      this._lastRemainingFrame = null;
      this._displayAlongPathM = null;
      this._lastAlongTickAt = null;
      this._gpsOffRouteMeters = Infinity;
      this.maneuvers = route ? enrichManeuvers(route) : [];
      this.maneuverIndex = Math.min(
        route?.currentLegIndex ?? 0,
        Math.max(0, this.maneuvers.length - 1),
      );
      window.FplacesMinimap?.setRoute?.(route?.pathCoordinates || null);

      const seedPosition =
        route?.userPosition?.latitude != null && route?.userPosition?.longitude != null
          ? route.userPosition
          : route?.origin?.latitude != null && route?.origin?.longitude != null
            ? { ...route.origin, source: 'routeOrigin', accuracy: 8 }
            : null;

      if (seedPosition) {
        window.FplacesArDebug?.log('Navigator', 'Applying seed position from route payload', seedPosition);
        this.applyPosition({
          latitude: seedPosition.latitude,
          longitude: seedPosition.longitude,
          heading: seedPosition.heading,
          accuracy: seedPosition.accuracy,
          floorId: seedPosition.floorId,
          source: seedPosition.source || 'route',
        });
      } else {
        window.FplacesArDebug?.log('Navigator', 'No seed position in route — waiting for GPS/external feed');
        this._displayAlongPathM = 0;
        this.notify();
      }
    }

    /**
     * External position feed (Flutter map, Mappedin blue dot, etc.)
     * @param {{ latitude: number, longitude: number, heading?: number, accuracy?: number, floorId?: string, source?: string }} pos
     */
    applyPosition(pos) {
      if (!pos || pos.latitude == null || pos.longitude == null) {
        window.FplacesArDebug?.warn('Navigator', 'applyPosition ignored — invalid coords', pos);
        return;
      }

      window.FplacesArDebug?.log('Navigator', `applyPosition (${pos.source || 'external'})`, {
        latitude: pos.latitude,
        longitude: pos.longitude,
        heading: pos.heading,
        accuracy: pos.accuracy,
        floorId: pos.floorId,
      });

      this.lastPosition = {
        latitude: Number(pos.latitude),
        longitude: Number(pos.longitude),
        accuracy: pos.accuracy != null ? Number(pos.accuracy) : null,
        heading: pos.heading != null ? Number(pos.heading) : null,
        floorId: pos.floorId || null,
      };
      this.positionSource = pos.source || 'external';
      this.updateMovementSpeed(this.lastPosition.latitude, this.lastPosition.longitude);

      if (this.lastPosition.heading != null && !Number.isNaN(this.lastPosition.heading)) {
        this.externalHeadingDegrees =
          ((this.lastPosition.heading % 360) + 360) % 360;
      }

      this.advanceAlongPath();
      this.notify();
    }

    currentManeuver() {
      return this.maneuvers[this.maneuverIndex] || null;
    }

    currentInstructionText() {
      const m = this.currentManeuver();
      if (this.route?.instructions) return this.route.instructions;
      if (!m) return 'Follow the route';
      let text = m.instruction || m.actionType || 'Continue';
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
          const d = haversineMeters(this._prevPositionSample, { latitude: lat, longitude: lng });
          this._moveSpeedMps = d / dt;
        }
      }
      this._prevPositionSample = { latitude: lat, longitude: lng, at: now };
    }

    offRouteThresholdMeters() {
      const accuracy = this.lastPosition?.accuracy || 15;
      return Math.max(25, accuracy * 2);
    }

    isGpsSnapTrustworthy() {
      return (this._gpsOffRouteMeters ?? Infinity) <= this.offRouteThresholdMeters();
    }

    /** When indoor GPS is off the venue polyline, infer slow walk if facing the route. */
    effectiveMoveSpeedMps() {
      if (this._moveSpeedMps > 0.03) return this._moveSpeedMps;
      if (this.isGpsSnapTrustworthy()) return this._moveSpeedMps;

      const heading =
        window.FplacesOrientationCompass?.getDeviceHeading?.() ??
        this.externalHeadingDegrees;
      const target = this.getTargetBearingDegrees();
      if (heading == null || target == null) return 0;

      const delta = Math.abs(normalizeDeltaDegrees(heading, target));
      if (delta > 40) return 0;
      return 0.55;
    }

    /** Live progress along route polyline — blends GPS snap + walking extrapolation. */
    getDisplayAlongPathMeters(gpsAlongMeters) {
      const path = this.route?.pathCoordinates || [];
      const total = path.length
        ? window.FplacesRouteGeometry.totalPathLengthMeters(path)
        : 0;
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

      if (trustGps && Math.abs(gpsAlong - this._displayAlongPathM) > 4) {
        this._displayAlongPathM = gpsAlong;
      } else if (trustGps) {
        this._displayAlongPathM += (gpsAlong - this._displayAlongPathM) * Math.min(1, dt * 8);
      }
      if (speed > 0.03 && dt > 0) {
        this._displayAlongPathM += speed * dt;
      }

      return Math.max(0, Math.min(total, this._displayAlongPathM));
    }

    /** Snap point used for display (minimap + distances). */
    getDisplaySnap() {
      this.ensureSnap();
      const path = this.route?.pathCoordinates || [];
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

      const gpsSnap = window.FplacesRouteGeometry?.snapToRoute?.(
        path,
        this.lastPosition.latitude,
        this.lastPosition.longitude,
      );
      this._gpsOffRouteMeters = gpsSnap?.offRouteMeters ?? Infinity;

      if (gpsSnap && gpsSnap.offRouteMeters <= this.offRouteThresholdMeters()) {
        this.snappedOnPath = gpsSnap;
        if (
          this._displayAlongPathM == null ||
          Math.abs(gpsSnap.distanceAlongPathMeters - this._displayAlongPathM) > 2
        ) {
          this._displayAlongPathM = gpsSnap.distanceAlongPathMeters;
        }
      } else if (this._displayAlongPathM != null) {
        this.snappedOnPath =
          window.FplacesRouteGeometry.snapAtDistanceAlongPath(path, this._displayAlongPathM) ||
          gpsSnap;
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

      if (next && typeof next.alongPathMeters === 'number') {
        return Math.max(0, next.alongPathMeters - along);
      }

      const snap = this.getDisplaySnap();
      if (!snap) return null;

      if (next && typeof next.pathIndex === 'number') {
        return window.FplacesRouteGeometry.distanceAlongPathBetween(
          path,
          snap,
          next.pathIndex,
        );
      }

      const total = window.FplacesRouteGeometry.totalPathLengthMeters(path);
      return Math.max(0, total - along);
    }

    /** Live distance to next maneuver — updates every frame with 0.1 m precision. */
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

      this._smoothDistToTarget += (raw - this._smoothDistToTarget) * Math.min(1, dt * 14);
      const speed = this.effectiveMoveSpeedMps();
      if (speed > 0.03 && dt > 0) {
        this._smoothDistToTarget = Math.max(
          0,
          this._smoothDistToTarget - speed * dt,
        );
      }
      if (this._smoothDistToTarget < raw - 1.5) this._smoothDistToTarget = raw;
      if (this._smoothDistToTarget > raw + 1.5 && raw >= 0) this._smoothDistToTarget = raw;

      return Math.max(0, this._smoothDistToTarget);
    }

    distanceToNextManeuverMeters() {
      return this.distanceToCurrentTargetMeters();
    }

    distanceRemainingToDestinationMeters() {
      this.ensureSnap();
      const path = this.route?.pathCoordinates || [];
      if (!path.length || !this.snappedOnPath) return null;
      return window.FplacesRouteGeometry.distanceAlongPathToEnd(path, this.snappedOnPath);
    }

    /**
     * Smoothed + live-interpolated distance to destination for the trip footer.
     * Counts down between GPS fixes while walking; jumps up if you move away.
     */
    getDisplayDistanceRemainingMeters() {
      const raw = this.distanceRemainingToDestinationMeters();
      if (raw == null) return this._smoothDistRemaining;

      const now = performance.now();
      const frameBucket = Math.floor(now / 32);
      if (this._lastRemainingFrame === frameBucket && this._smoothDistRemaining != null) {
        return Math.max(0, this._smoothDistRemaining);
      }
      this._lastRemainingFrame = frameBucket;

      if (this._smoothDistRemaining == null || this._lastRemainingTickAt == null) {
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
      } else if (this._moveSpeedMps > 0.2 && dt > 0) {
        this._smoothDistRemaining = Math.max(0, this._smoothDistRemaining - this._moveSpeedMps * dt);
        if (this._smoothDistRemaining < raw - 12) this._smoothDistRemaining = raw;
      }

      return Math.max(0, this._smoothDistRemaining);
    }

    /** Geographic bearing toward the next walk target on the route polyline. */
    getTargetBearingDegrees() {
      const path = this.route?.pathCoordinates || [];
      if (path.length < 2) {
        if (!this._warnedShortPath) {
          this._warnedShortPath = true;
          window.FplacesArDebug?.warn('Navigator', 'getTargetBearingDegrees — need ≥2 path points', {
            pathPoints: path.length,
          });
        }
        return null;
      }

      const index = this.activePathIndex();
      const nextManeuver = this.maneuvers[this.maneuverIndex + 1];
      let lookaheadM = 14;

      if (nextManeuver && typeof nextManeuver.pathIndex === 'number') {
        const distToTurn = distanceAlongPathMeters(path, index, nextManeuver.pathIndex);
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
      if (typeof m?.headingDegrees === 'number' && !Number.isNaN(m.headingDegrees)) {
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
      if (!m) return { label: 'Follow route', symbol: 'straight' };
      const bearing = (m.bearing || m.actionType || '').toString();
      const map = {
        Left: { label: 'Turn left', symbol: 'turn_left' },
        Right: { label: 'Turn right', symbol: 'turn_right' },
        SlightLeft: { label: 'Slight left', symbol: 'turn_slight_left' },
        SlightRight: { label: 'Slight right', symbol: 'turn_slight_right' },
        Straight: { label: 'Go straight', symbol: 'straight' },
        Turn: { label: 'Turn', symbol: 'u_turn_right' },
        Departure: { label: 'Head out', symbol: 'straight' },
        Arrival: { label: 'Arrive', symbol: 'flag' },
      };
      if (map[bearing]) return map[bearing];

      const inst = (m.instruction || '').toLowerCase();
      if (inst.includes('turn right') || inst.includes('right'))
        return { label: 'Turn right', symbol: 'turn_right' };
      if (inst.includes('slight right'))
        return { label: 'Slight right', symbol: 'turn_slight_right' };
      if (inst.includes('turn left') || inst.includes('left'))
        return { label: 'Turn left', symbol: 'turn_left' };
      if (inst.includes('slight left'))
        return { label: 'Slight left', symbol: 'turn_slight_left' };
      if (inst.includes('arriv')) return { label: 'Arrive', symbol: 'flag' };
      if (inst.includes('straight') || inst.includes('continue'))
        return { label: 'Go straight', symbol: 'straight' };

      const short = (m.instruction || 'Follow route').split('(')[0].trim();
      return { label: short.slice(0, 36), symbol: 'straight' };
    }

    distanceToManeuverMeters(m) {
      const path = this.route?.pathCoordinates || [];
      if (!path.length || !m) return null;

      const gpsAlong = this.snappedOnPath?.distanceAlongPathMeters ?? 0;
      const along = this.getDisplayAlongPathMeters(gpsAlong);

      if (typeof m.alongPathMeters === 'number') {
        return Math.max(0, m.alongPathMeters - along);
      }

      const snap = this.getDisplaySnap();
      if (!snap || typeof m.pathIndex !== 'number') return null;

      return window.FplacesRouteGeometry.distanceAlongPathBetween(
        path,
        snap,
        m.pathIndex,
      );
    }

    shortTurnWord(m) {
      const label = this.turnFromManeuver(m).label.toLowerCase();
      if (label.includes('right')) return 'right';
      if (label.includes('left')) return 'left';
      if (label.includes('straight') || label.includes('continue') || label.includes('head'))
        return 'straight';
      if (label.includes('arriv')) return 'arrive';
      return '';
    }

    /** Live instruction from position, alignment, and upcoming maneuvers. */
    getLiveGuidance(deviceHeading) {
      if (this.arrived) {
        return {
          primary: { label: `Arrived at ${this.route?.destinationName || 'destination'}`, symbol: 'flag' },
          then: null,
          distanceLabel: 'You have reached your destination',
          distanceMeters: 0,
          alignmentDelta: null,
        };
      }

      const current = this.currentManeuver();
      const next = this.maneuvers[this.maneuverIndex + 1];
      const thenManeuver = this.maneuvers[this.maneuverIndex + 2] || null;
      const distRaw = this.getDisplayDistanceMeters();
      const dist = distRaw != null ? Math.max(0, distRaw) : null;
      const delta = deviceHeading != null ? this.getAlignmentDeltaDegrees(deviceHeading) : null;
      const aligned = delta == null || Math.abs(delta) < 18;

      let primary;
      let distanceLabel = '';

      if (delta != null && !aligned) {
        if (Math.abs(delta) >= 135) {
          primary = { label: 'Turn around', symbol: 'u_turn_right' };
        } else if (delta > 0) {
          primary = { label: 'Turn right', symbol: 'turn_right' };
        } else {
          primary = { label: 'Turn left', symbol: 'turn_left' };
        }
        distanceLabel = dist != null ? `${dist.toFixed(1)} m` : 'Face the red arrow';
      } else if (next && dist != null) {
        const nextTurn = this.turnFromManeuver(next);
        const turnWord = this.shortTurnWord(next);

        if (dist <= 6) {
          primary = nextTurn;
          const upcoming = thenManeuver || this.maneuvers[this.maneuverIndex + 2];
          const upcomingDist = upcoming
            ? this.distanceToManeuverMeters(upcoming)
            : this.distanceRemainingToDestinationMeters();
          if (upcomingDist != null) {
            const afterDist = Math.max(0, upcomingDist);
            const afterWord = upcoming ? this.shortTurnWord(upcoming) : '';
            distanceLabel = afterWord
              ? `${afterDist.toFixed(1)} m ${afterWord}`
              : `${afterDist.toFixed(1)} m`;
          } else {
            distanceLabel = 'Now';
          }
        } else {
          primary = current ? this.turnFromManeuver(current) : { label: 'Go straight', symbol: 'straight' };
          if (turnWord && turnWord !== 'straight') {
            distanceLabel = `${dist.toFixed(1)} m ${turnWord}`;
          } else {
            distanceLabel = `${dist.toFixed(1)} m`;
          }
        }
      } else if (current) {
        primary = this.turnFromManeuver(current);
        const rem = this.distanceRemainingToDestinationMeters();
        distanceLabel = dist != null ? `${dist.toFixed(1)} m` : rem != null ? `${rem.toFixed(1)} m` : '';
      } else {
        primary = { label: 'Follow route', symbol: 'straight' };
        distanceLabel = dist != null ? `${dist} m` : '';
      }

      const then = thenManeuver
        ? this.turnFromManeuver(thenManeuver)
        : next && primary?.label !== this.turnFromManeuver(next).label
          ? this.turnFromManeuver(next)
          : null;

      return {
        primary,
        then,
        distanceLabel,
        distanceMeters: dist,
        alignmentDelta: delta,
        distToTurn: distRaw,
      };
    }

    navigationBearing() {
      return this.getTargetBearingDegrees();
    }

    startGps() {
      if (!navigator.geolocation || !this.route?.pathCoordinates?.length) {
        window.FplacesArDebug?.warn('Navigator', 'startGps skipped', {
          hasGeolocation: !!navigator.geolocation,
          pathPoints: this.route?.pathCoordinates?.length ?? 0,
        });
        return;
      }
      window.FplacesArDebug?.log('Navigator', 'Starting GPS watchPosition');
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
            source: 'gps',
          });
        },
        (err) => {
          window.FplacesArDebug?.warn('Navigator', 'GPS watch error', {
            code: err.code,
            message: err.message,
            positionSource: this.positionSource,
          });
          if (this.positionSource === 'none') {
            this.offPathMessage = `GPS: ${err.message}`;
            this.notify();
          }
        },
        { enableHighAccuracy: true, maximumAge: 500, timeout: 10000 },
      );
    }

    stopGps() {
      if (this.watchId != null) {
        window.FplacesArDebug?.log('Navigator', 'Stopping GPS watch');
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
    }

    advanceAlongPath() {
      const path = this.route?.pathCoordinates || [];
      if (!path.length || !this.lastPosition) return;

      this.updateSnap();

      const offRoute = this._gpsOffRouteMeters ?? Infinity;
      const accuracy = this.lastPosition.accuracy || 0;
      const offThreshold = this.offRouteThresholdMeters();
      const wasOffPath = !!this.offPathMessage;
      this.offPathMessage =
        offRoute > offThreshold
          ? `GPS off route ~${Math.round(offRoute)} m — using map progress`
          : '';
      if (this.offPathMessage && !wasOffPath) {
        window.FplacesArDebug?.warn('Navigator', 'User off route', {
          distanceMeters: Math.round(offRoute),
          accuracy: Math.round(accuracy),
          pathIndex: this.pathSegmentIndex,
        });
      }

      const advanceThresholdM = 7;
      const gpsAlong = this.snappedOnPath?.distanceAlongPathMeters ?? 0;
      const along = this.getDisplayAlongPathMeters(gpsAlong);

      while (this.maneuverIndex < this.maneuvers.length - 1) {
        const nextM = this.maneuvers[this.maneuverIndex + 1];
        if (!this.snappedOnPath) break;

        let distToNext;
        if (typeof nextM.alongPathMeters === 'number') {
          distToNext = Math.max(0, nextM.alongPathMeters - along);
        } else if (typeof nextM.pathIndex === 'number') {
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
        this._smoothDistToTarget = null;
        this._lastTargetFrame = null;
        const m = this.maneuvers[this.maneuverIndex];
        window.FplacesArDebug?.log('Navigator', 'Maneuver advanced', {
          maneuverIndex: this.maneuverIndex,
          instruction: m.instruction,
          pathIndex: m.pathIndex,
          headingDegrees: m.headingDegrees,
        });
        window.FplacesRouteBridge?.sendToFlutter?.({
          event: 'maneuverReached',
          instruction: m.instruction,
          legIndex: m.legIndex,
          stepIndex: m.stepIndex,
        });
      }

      const destDist = this.snappedOnPath
        ? window.FplacesRouteGeometry.distanceAlongPathToEnd(path, this.snappedOnPath)
        : haversineMeters(this.lastPosition, path[path.length - 1]);

      if (destDist != null && destDist < 10) {
        if (!this.arrived) {
          window.FplacesArDebug?.log('Navigator', 'Arrived at destination');
        }
        this.arrived = true;
      }
    }

    notify() {
      if (this.lastPosition) this.ensureSnap();

      if (typeof this.onUpdate === 'function') {
        this.onUpdate(this.getState());
      }
      window.FplacesOrientationCompass?.attachNavigator?.(this);
      window.FplacesMinimap?.update?.(
        this,
        window.FplacesOrientationCompass?.getDeviceHeading?.() ?? null,
      );
      window.FplacesLiveViewHud?.update?.(this.getState(), this);
      window.FplacesArDebug?.logNavStateThrottled(
        'Navigator',
        'State notify',
        this.getState(),
        1200,
      );
    }

    getState() {
      if (this.lastPosition) this.ensureSnap();

      const path = this.route?.pathCoordinates || [];
      const index = this.activePathIndex();
      const distToEnd = this.getDisplayDistanceRemainingMeters();
      const distToTarget = this.getDisplayDistanceMeters();

      return {
        instruction: this.arrived
          ? `Arrived at ${this.route?.destinationName || 'destination'}`
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
        offPathMessage: this.offPathMessage || '',
        targetBearingDegrees: this.getTargetBearingDegrees(),
        navigationBearing: this.getTargetBearingDegrees(),
        externalHeadingDegrees: this.externalHeadingDegrees,
        deviceHeadingDegrees: window.FplacesOrientationCompass?.getDeviceHeading?.() ?? null,
        alignmentDeltaDegrees: window.FplacesOrientationCompass?.getAlignmentDelta?.(
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
