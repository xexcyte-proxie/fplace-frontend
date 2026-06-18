/**
 * Compact circular minimap — marker tracks live progress along route polyline.
 */
(function () {
  const SIZE = 120;
  const CENTER = SIZE / 2;
  const VIEW_RADIUS = 46;
  const PAD = 10;

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

  function pathCentroid(path) {
    let lat = 0;
    let lng = 0;
    for (const p of path) {
      lat += p.latitude;
      lng += p.longitude;
    }
    return { latitude: lat / path.length, longitude: lng / path.length };
  }

  function markerOnPolyline(scaled, path, snap) {
    const geo = window.FplacesRouteGeometry;
    const alongM = snap.distanceAlongPathMeters ?? 0;
    let accumulated = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const segLen = geo.haversineMeters(path[i], path[i + 1]);
      if (accumulated + segLen >= alongM || i === path.length - 2) {
        const t =
          segLen > 0 ? Math.max(0, Math.min(1, (alongM - accumulated) / segLen)) : 0;
        const a = scaled[i];
        const b = scaled[i + 1] || a;
        return {
          x: a.x + t * (b.x - a.x),
          y: a.y + t * (b.y - a.y),
          segIndex: i,
          t,
        };
      }
      accumulated += segLen;
    }

    return { x: scaled[scaled.length - 1].x, y: scaled[scaled.length - 1].y, segIndex: path.length - 2, t: 1 };
  }

  function projectMinimap(path, snap, headingDeg) {
    const geo = window.FplacesRouteGeometry;
    const center = pathCentroid(path);
    const locals = path.map((p) => geo.toLocalMeters(center, p));

    let maxAbs = 6;
    for (const l of locals) {
      maxAbs = Math.max(maxAbs, Math.abs(l.x), Math.abs(l.y));
    }
    const scale = (VIEW_RADIUS - PAD) / maxAbs;

    const scaled = locals.map((l) => ({
      x: CENTER + l.x * scale,
      y: CENTER + l.y * scale,
    }));

    const marker = markerOnPolyline(scaled, path, snap);
    const splitIndex = marker.segIndex;

    const traveled = [];
    const remaining = [];
    for (let i = 0; i < scaled.length; i++) {
      if (i < splitIndex) traveled.push(scaled[i]);
      else if (i === splitIndex) {
        traveled.push(marker);
        remaining.push(marker);
      } else remaining.push(scaled[i]);
    }
    if (traveled.length < 2 && scaled.length >= 2) {
      traveled.unshift(scaled[0]);
    }

    return { scaled, marker, traveled, remaining, headingDeg: headingDeg ?? 0 };
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

    const { x, y } = projected.marker;
    if (markerEl) {
      markerEl.setAttribute('cx', x.toFixed(2));
      markerEl.setAttribute('cy', y.toFixed(2));
    }
    if (markerRingEl) {
      markerRingEl.setAttribute('cx', x.toFixed(2));
      markerRingEl.setAttribute('cy', y.toFixed(2));
    }
    if (wedgeEl) {
      wedgeEl.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${projected.headingDeg.toFixed(1)})`);
    }
  }

  window.FplacesMinimap = {
    setRoute() {},

    update(navigator, headingDeg) {
      const path = normalizePath(navigator?.route?.pathCoordinates);
      if (!path.length) {
        if (rootEl) rootEl.style.display = 'none';
        return;
      }

      ensure();
      rootEl.style.display = 'block';

      let heading = headingDeg;
      if (heading == null) {
        heading = window.FplacesOrientationCompass?.getDeviceHeading?.() ?? 0;
      }

      const snap =
        navigator?.getDisplaySnap?.() ||
        (navigator?.lastPosition
          ? window.FplacesRouteGeometry?.snapToRoute?.(
              path,
              navigator.lastPosition.latitude,
              navigator.lastPosition.longitude,
            )
          : window.FplacesRouteGeometry?.snapAtDistanceAlongPath?.(path, 0));

      if (!snap) return;

      const projected = projectMinimap(path, snap, heading);
      if (projected) render(projected);
    },
  };
})();
