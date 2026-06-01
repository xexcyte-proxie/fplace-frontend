/**
 * Turn-by-turn progress along Mappedin pathCoordinates + maneuvers.
 * Uses GPS when available (outdoor / near windows). Indoor VPS comes later.
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

  function enrichManeuvers(route) {
    const path = route.pathCoordinates || [];
    const maneuvers = route.maneuvers || [];
    if (!maneuvers.length) return [];
    if (!path.length) {
      return maneuvers.map((m, i) => ({ ...m, pathIndex: i }));
    }
    return maneuvers.map((m, i) => ({
      ...m,
      pathIndex: Math.min(
        path.length - 1,
        Math.max(
          0,
          Math.floor(((i + 1) * path.length) / maneuvers.length) - 1,
        ),
      ),
    }));
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

  class RouteNavigator {
    constructor() {
      this.route = null;
      this.maneuvers = [];
      this.maneuverIndex = 0;
      this.watchId = null;
      this.onUpdate = null;
      this.lastGps = null;
      this.pathSegmentIndex = 0;
    }

    setRoute(route) {
      this.stopGps();
      this.route = route;
      this.arrived = false;
      this.offPathMessage = '';
      this.lastGps = null;
      this.pathSegmentIndex = 0;
      this.maneuvers = route ? enrichManeuvers(route) : [];
      this.maneuverIndex = Math.min(
        route?.currentLegIndex ?? 0,
        Math.max(0, this.maneuvers.length - 1),
      );
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

    /** Active path segment index for bearing (GPS-aware or start of route). */
    activePathIndex() {
      const path = this.route?.pathCoordinates || [];
      if (!path.length) return 0;
      if (this.lastGps) {
        return findClosestPathIndex(
          path,
          this.lastGps.latitude,
          this.lastGps.longitude,
        ).index;
      }
      return this.pathSegmentIndex;
    }

    /** Geographic bearing (0=north) for the direction to walk next. */
    getTargetBearingDegrees() {
      const path = this.route?.pathCoordinates || [];
      if (path.length < 2) return null;

      const m = this.currentManeuver();
      if (typeof m?.bearing === 'number' && !Number.isNaN(m.bearing)) {
        return ((m.bearing % 360) + 360) % 360;
      }

      const index = this.activePathIndex();
      const nextIndex = Math.min(index + 1, path.length - 1);
      if (nextIndex === index && index > 0) {
        return bearingDegrees(path[index - 1], path[index]);
      }
      return bearingDegrees(path[index], path[nextIndex]);
    }

    /** @deprecated Use getTargetBearingDegrees — kept for compatibility */
    navigationBearing() {
      return this.getTargetBearingDegrees();
    }

    startGps() {
      if (!navigator.geolocation || !this.route?.pathCoordinates?.length) {
        return;
      }
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.lastGps = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading,
          };
          this.advanceByGps();
          this.notify();
        },
        (err) => {
          this.offPathMessage = `GPS: ${err.message}`;
          this.notify();
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
      );
    }

    stopGps() {
      if (this.watchId != null) {
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
    }

    advanceByGps() {
      const path = this.route?.pathCoordinates || [];
      if (!path.length || !this.lastGps) return;

      const { index, distanceMeters } = findClosestPathIndex(
        path,
        this.lastGps.latitude,
        this.lastGps.longitude,
      );
      this.pathSegmentIndex = index;

      this.offPathMessage =
        distanceMeters > 30
          ? `Off route ~${Math.round(distanceMeters)} m (±${Math.round(this.lastGps.accuracy || 0)} m GPS)`
          : '';

      while (
        this.maneuverIndex < this.maneuvers.length - 1 &&
        index >= this.maneuvers[this.maneuverIndex + 1].pathIndex
      ) {
        this.maneuverIndex++;
        window.FplacesRouteBridge?.sendToFlutter?.({
          event: 'maneuverReached',
          instruction: this.maneuvers[this.maneuverIndex].instruction,
          legIndex: this.maneuvers[this.maneuverIndex].legIndex,
          stepIndex: this.maneuvers[this.maneuverIndex].stepIndex,
        });
      }

      const dest = path[path.length - 1];
      if (dest && haversineMeters(this.lastGps, dest) < 12) {
        this.arrived = true;
      }
    }

    notify() {
      if (typeof this.onUpdate === 'function') {
        this.onUpdate(this.getState());
      }
    }

    getState() {
      return {
        instruction: this.arrived
          ? `Arrived at ${this.route?.destinationName || 'destination'}`
          : this.currentInstructionText(),
        maneuverIndex: this.maneuverIndex,
        maneuverCount: this.maneuvers.length,
        destinationName: this.route?.destinationName,
        distanceMeters: this.route?.distanceMeters,
        pathPointCount: this.route?.pathCoordinates?.length ?? 0,
        offPathMessage: this.offPathMessage || '',
        targetBearingDegrees: this.getTargetBearingDegrees(),
        navigationBearing: this.getTargetBearingDegrees(),
        arrived: !!this.arrived,
        hasGps: !!this.lastGps,
      };
    }
  }

  window.FplacesRouteNavigator = RouteNavigator;
})();
