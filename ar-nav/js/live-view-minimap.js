/**
 * Compact circular minimap — user-fixed center, route in flat geographic meters.
 * Heading matches 2D travel direction when the parent simulator drives position.
 */
(function () {
  const SIZE = 72;
  const CENTER = SIZE / 2;
  const VIEW_RADIUS = 28;
  const PAD = 8;

  let rootEl = null;
  let rotatorEl = null;
  let markerEl = null;
  let markerRingEl = null;
  let wedgeEl = null;

  function normalizePoint(p) {
    if (!p) return null;
    const lat = p.latitude ?? p.lat;
    const lng = p.longitude ?? p.lng;
    if (lat == null || lng == null) return null;
    return { latitude: Number(lat), longitude: Number(lng), floorId: p.floorId };
  }

  function normalizePath(path) {
    if (!Array.isArray(path)) return [];
    return path.map(normalizePoint).filter(Boolean);
  }

  function ensure() {
    if (rootEl) return rootEl;

    rootEl = document.createElement('div');
    rootEl.id = 'fplaces-minimap';
    rootEl.setAttribute('aria-hidden', 'true');
    const clipR = CENTER - 4;
    const bgR = CENTER - 2;
    rootEl.innerHTML =
      `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" ` +
      'xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      `<clipPath id="minimap-clip"><circle cx="${CENTER}" cy="${CENTER}" r="${clipR}"/></clipPath>` +
      '<radialGradient id="heading-glow" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0%" stop-color="rgba(66,133,244,0.6)"/>' +
      '<stop offset="100%" stop-color="rgba(66,133,244,0)"/>' +
      '</radialGradient>' +
      '</defs>' +
      `<circle class="minimap-bg" cx="${CENTER}" cy="${CENTER}" r="${bgR}"/>` +
      '<g clip-path="url(#minimap-clip)">' +
      '<g id="minimap-rotator"></g>' +
      '<g id="minimap-heading-wedge">' +
      '<path class="minimap-heading-glow" d="M0 0 L-10 -22 A24 24 0 0 1 10 -22 Z" ' +
      'fill="url(#heading-glow)"/>' +
      '</g>' +
      `<circle id="minimap-marker-ring" class="minimap-user-ring" cx="${CENTER}" cy="${CENTER}" r="6"/>` +
      `<circle id="minimap-marker" class="minimap-user" cx="${CENTER}" cy="${CENTER}" r="4"/>` +
      '</g>' +
      '</svg>';

    document.body.appendChild(rootEl);
    rotatorEl = rootEl.querySelector('#minimap-rotator');
    markerEl = rootEl.querySelector('#minimap-marker');
    markerRingEl = rootEl.querySelector('#minimap-marker-ring');
    wedgeEl = rootEl.querySelector('#minimap-heading-wedge');
    return rootEl;
  }

  function resolveSnap(navigator, path) {
    const geo = window.FplacesRouteGeometry;
    if (!geo || !path.length) return null;

    const display = navigator?.getDisplaySnap?.();
    if (display?.latitude != null && display?.longitude != null) {
      return display;
    }

    if (navigator?.positionSource === 'simulator' && navigator._displayAlongPathM != null) {
      return geo.snapAtDistanceAlongPath(path, navigator._displayAlongPathM);
    }

    if (navigator?.lastPosition) {
      return geo.snapToRoute?.(
        path,
        navigator.lastPosition.latitude,
        navigator.lastPosition.longitude,
        { floorId: navigator.lastPosition.floorId, preferVenue: true },
      );
    }

    return geo.snapAtDistanceAlongPath(path, 0);
  }

  function resolveAlongMeters(navigator, snap) {
    if (
      navigator?.isParentSimulatorAuthority?.() &&
      navigator.positionSource === 'simulator' &&
      typeof navigator.tickParentSimDisplayAlong === 'function'
    ) {
      return navigator.tickParentSimDisplayAlong(performance.now());
    }
    if (navigator?.positionSource === 'simulator' && navigator._displayAlongPathM != null) {
      return navigator._displayAlongPathM;
    }
    return snap?.distanceAlongPathMeters ?? 0;
  }

  /** Prefer SLAM yaw in XR, then simulator travel bearing, then compass. */
  function resolveHeading(navigator) {
    if (!navigator) return 0;

    if (window.FplacesSlamHeading?.isActive?.()) {
      const slam = window.FplacesSlamHeading.getHeadingDegrees?.();
      if (slam != null && !Number.isNaN(slam)) return slam;
    }

    const venueDriven =
      navigator.positionSource === 'simulator' ||
      navigator.lastPosition?.source === 'simulator' ||
      navigator.isVenuePositionActive?.();

    if (venueDriven) {
      const travel =
        navigator.lastPosition?.heading ?? navigator.externalHeadingDegrees;
      if (travel != null && !Number.isNaN(travel)) {
        return ((travel % 360) + 360) % 360;
      }
      const routeBearing = navigator.getTargetBearingDegrees?.();
      if (routeBearing != null) return routeBearing;
    }

    return (
      window.FplacesOrientationCompass?.getDeviceHeading?.() ??
      navigator.getTargetBearingDegrees?.() ??
      0
    );
  }

  /**
   * Equirectangular projection — same model as 3D world space (FplacesGeoMath).
   */
  function projectMinimap(path, snap, headingDeg, alongM) {
    const geo = window.FplacesRouteGeometry;
    const toLocal = geo.toLocalMeters;
    const origin = { latitude: snap.latitude, longitude: snap.longitude };
    const along = Math.max(0, alongM ?? snap.distanceAlongPathMeters ?? 0);

    const locals = path.map((p) => toLocal(origin, p));
    let maxAbs = 10;
    for (const l of locals) {
      maxAbs = Math.max(maxAbs, Math.abs(l.x), Math.abs(l.y));
    }
    const scale = (VIEW_RADIUS - PAD) / maxAbs;

    const scaled = locals.map((l) => ({
      x: CENTER + l.x * scale,
      y: CENTER + l.y * scale,
    }));

    const user = { x: CENTER, y: CENTER };

    let splitSeg = 0;
    let cum = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const segLen = geo.haversineMeters(path[i], path[i + 1]);
      if (cum + segLen >= along - 0.001) {
        splitSeg = i;
        break;
      }
      cum += segLen;
      splitSeg = i;
    }

    const traveled = scaled.slice(0, splitSeg + 1);
    traveled.push(user);

    const remaining = [user, ...scaled.slice(splitSeg + 1)];

    return {
      traveled: dedupeAdjacent(traveled),
      remaining: dedupeAdjacent(remaining),
      headingDeg: headingDeg ?? 0,
    };
  }

  function dedupeAdjacent(pts) {
    if (pts.length < 2) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const prev = out[out.length - 1];
      const cur = pts[i];
      if (Math.hypot(cur.x - prev.x, cur.y - prev.y) < 0.5) {
        out[out.length - 1] = cur;
      } else {
        out.push(cur);
      }
    }
    return out;
  }

  function polylinePoints(pts) {
    return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  function render(projected) {
    if (!rotatorEl || !projected) return;

    const heading = projected.headingDeg ?? 0;
    const rot = -heading;

    rotatorEl.innerHTML =
      (projected.traveled.length >= 2
        ? `<polyline class="minimap-route-traveled" points="${polylinePoints(projected.traveled)}" fill="none"/>`
        : '') +
      (projected.remaining.length >= 2
        ? `<polyline class="minimap-route" points="${polylinePoints(projected.remaining)}" fill="none"/>`
        : '');

    rotatorEl.setAttribute('transform', `rotate(${rot.toFixed(1)} ${CENTER} ${CENTER})`);

    if (markerEl) {
      markerEl.setAttribute('cx', String(CENTER));
      markerEl.setAttribute('cy', String(CENTER));
    }
    if (markerRingEl) {
      markerRingEl.setAttribute('cx', String(CENTER));
      markerRingEl.setAttribute('cy', String(CENTER));
    }
    if (wedgeEl) {
      // Heading-up map: route rotator already uses −heading, so phone-forward is
      // always screen-up. Keep the glow fixed at top — do not double-rotate.
      wedgeEl.setAttribute(
        'transform',
        `translate(${CENTER} ${CENTER})`,
      );
    }
  }

  window.FplacesMinimap = {
    setRoute() {},

    update(navigator, headingDeg) {
      const state = navigator?.getState?.() || {};
      if (state.arrived) {
        if (rootEl) rootEl.style.display = 'none';
        return;
      }

      const path = normalizePath(navigator?.route?.pathCoordinates);
      if (!path.length) {
        if (rootEl) rootEl.style.display = 'none';
        return;
      }

      const snap = resolveSnap(navigator, path);
      if (snap?.latitude == null || snap?.longitude == null) return;

      ensure();
      rootEl.style.display = 'block';

      const heading =
        headingDeg != null ? headingDeg : resolveHeading(navigator);
      const alongM = resolveAlongMeters(navigator, snap);
      const projected = projectMinimap(path, snap, heading, alongM);
      if (projected) render(projected);
    },
  };
})();
