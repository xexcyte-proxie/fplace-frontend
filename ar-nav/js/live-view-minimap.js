/**
 * Compact circular minimap — Google Maps style: user fixed at center, map rotates.
 */
(function () {
  const SIZE = 120;
  const CENTER = SIZE / 2;
  const VIEW_RADIUS = 46;
  const PAD = 10;
  /** Fixed zoom — avoids scale recalc jitter as the anchor moves. */
  const VIEW_METERS = 38;
  const HEADING_SMOOTH = 0.14;

  let rootEl = null;
  let rotatorEl = null;
  let markerEl = null;
  let markerRingEl = null;
  let wedgeEl = null;
  let mapHeading = null;

  function normalizePoint(p) {
    if (!p) return null;
    const lat = p.latitude ?? p.lat;
    const lng = p.longitude ?? p.lng;
    if (lat == null || lng == null) return null;
    return { latitude: Number(lat), longitude: Number(lng), floorId: p.floorId };
  }

  function smoothMapHeading(raw) {
    if (raw == null || Number.isNaN(raw)) return mapHeading ?? 0;
    const next = ((Number(raw) % 360) + 360) % 360;
    if (mapHeading == null) {
      mapHeading = next;
      return mapHeading;
    }
    let delta = next - mapHeading;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    mapHeading = (mapHeading + delta * HEADING_SMOOTH + 360) % 360;
    return mapHeading;
  }

  function resetRouteState() {
    mapHeading = null;
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
    rootEl.innerHTML =
      `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" ` +
      'xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<clipPath id="minimap-clip"><circle cx="60" cy="60" r="52"/></clipPath>' +
      '<radialGradient id="heading-glow" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0%" stop-color="rgba(66,133,244,0.6)"/>' +
      '<stop offset="100%" stop-color="rgba(66,133,244,0)"/>' +
      '</radialGradient>' +
      '</defs>' +
      '<circle class="minimap-bg" cx="60" cy="60" r="54"/>' +
      '<g clip-path="url(#minimap-clip)">' +
      '<g id="minimap-rotator"></g>' +
      '<g id="minimap-heading-wedge">' +
      '<path class="minimap-heading-glow" d="M0 0 L-14 -32 A36 36 0 0 1 14 -32 Z" ' +
      'fill="url(#heading-glow)"/>' +
      '</g>' +
      '<circle id="minimap-marker-ring" class="minimap-user-ring" cx="60" cy="60" r="7"/>' +
      '<circle id="minimap-marker" class="minimap-user" cx="60" cy="60" r="4.5"/>' +
      '</g>' +
      '</svg>';

    document.body.appendChild(rootEl);
    rotatorEl = rootEl.querySelector('#minimap-rotator');
    markerEl = rootEl.querySelector('#minimap-marker');
    markerRingEl = rootEl.querySelector('#minimap-marker-ring');
    wedgeEl = rootEl.querySelector('#minimap-heading-wedge');
    return rootEl;
  }

  function splitPathAtDistance(path, alongM) {
    const geo = window.FplacesRouteGeometry;
    let accumulated = 0;
    const traveled = [];
    const remaining = [];

    for (let i = 0; i < path.length - 1; i++) {
      const segLen = geo.haversineMeters(path[i], path[i + 1]);
      if (accumulated + segLen < alongM) {
        traveled.push(path[i]);
        accumulated += segLen;
        continue;
      }

      const t = segLen > 0 ? Math.max(0, Math.min(1, (alongM - accumulated) / segLen)) : 0;
      const split = {
        latitude: path[i].latitude + t * (path[i + 1].latitude - path[i].latitude),
        longitude: path[i].longitude + t * (path[i + 1].longitude - path[i].longitude),
      };
      traveled.push(path[i], split);
      remaining.push(split, path[i + 1]);
      for (let j = i + 1; j < path.length; j++) {
        remaining.push(path[j]);
      }
      return { traveled, remaining };
    }

    return { traveled: path.slice(), remaining: [path[path.length - 1]] };
  }

  function projectMinimap(path, alongM, headingDeg) {
    const geo = window.FplacesRouteGeometry;
    const snap = geo.snapAtDistanceAlongPath(path, alongM);
    if (!snap) return null;

    const anchor = { latitude: snap.latitude, longitude: snap.longitude };
    const scale = (VIEW_RADIUS - PAD) / VIEW_METERS;

    const toSvg = (p) => {
      const local = geo.toLocalMeters(anchor, p);
      return {
        x: CENTER + local.x * scale,
        y: CENTER - local.y * scale,
      };
    };

    const split = splitPathAtDistance(path, alongM);
    const traveled = split.traveled.map(toSvg);
    const remaining = split.remaining.map(toSvg);

    return {
      traveled,
      remaining,
      headingDeg: smoothMapHeading(headingDeg),
    };
  }

  function polylinePoints(pts) {
    return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  function render(projected) {
    if (!rotatorEl || !projected) return;

    rotatorEl.innerHTML =
      (projected.traveled.length >= 2
        ? `<polyline class="minimap-route-traveled" points="${polylinePoints(projected.traveled)}" fill="none"/>`
        : '') +
      (projected.remaining.length >= 2
        ? `<polyline class="minimap-route" points="${polylinePoints(projected.remaining)}" fill="none"/>`
        : '');

    rotatorEl.setAttribute(
      'transform',
      `rotate(${(-projected.headingDeg).toFixed(1)} ${CENTER} ${CENTER})`,
    );

    if (markerEl) {
      markerEl.setAttribute('cx', String(CENTER));
      markerEl.setAttribute('cy', String(CENTER));
    }
    if (markerRingEl) {
      markerRingEl.setAttribute('cx', String(CENTER));
      markerRingEl.setAttribute('cy', String(CENTER));
    }
    if (wedgeEl) {
      wedgeEl.setAttribute('transform', `translate(${CENTER} ${CENTER}) rotate(${projected.headingDeg.toFixed(1)})`);
    }
  }

  window.FplacesMinimap = {
    setRoute() {
      resetRouteState();
    },

    update(navigator, headingDeg) {
      const path = normalizePath(navigator?.route?.pathCoordinates);
      if (!path.length) {
        if (rootEl) rootEl.style.display = 'none';
        return;
      }

      ensure();
      rootEl.style.display = 'block';

      const alongM = navigator?.getLiveAlongPathMeters?.() ?? 0;
      const projected = projectMinimap(path, alongM, headingDeg);
      if (projected) render(projected);
    },
  };
})();
