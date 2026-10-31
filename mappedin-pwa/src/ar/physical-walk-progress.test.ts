import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { THREE, runtime } from '../../test-support/ar-runtime';
import { RouteGuidedWalk } from '../position/physical-walk/route-guided';
import { offset } from '../position/physical-walk/transform';

const origin = { latitude: 0, longitude: 0, floorId: 'A' };
const point = (east: number, north: number) => ({ ...offset(origin, { east, north }), floorId: 'A' });
function setup() {
  const { c, tick } = runtime();
  c.FPLACES_AR_CONFIG.useGpsProgress = false;
  c.FPLACES_AR_CONFIG.preferVenuePositioning = true;
  c.FplacesArDebug = new Proxy({}, { get: () => () => {} });
  c.location = { hash: '', search: '', origin: 'https://fplaces.test' };
  c.addEventListener = vi.fn(); c.parent = { postMessage: vi.fn() };
  c.navigator = { geolocation: { watchPosition: vi.fn(() => 8), clearWatch: vi.fn() } };
  c.sessionStorage = { getItem: () => null };
  for (const file of ['geo-math', 'route-geometry', 'anchorEngine', 'visual-route-state', 'floor-transitions', 'spatial-alignment', 'pathGeometry', 'world-route-scene', 'indoor-position', 'slam-pose-bridge', 'route-navigator', 'route-bridge']) {
    vm.runInContext(readFileSync(new URL(`../../../ar-nav/js/${file}.js`, import.meta.url), 'utf8'), c);
  }
  const path = [origin, point(0, 10), point(40, 10)];
  const engine = new RouteGuidedWalk(path);
  const nav = new c.FplacesRouteNavigator(); c.__fplacesNavigator = nav;
  nav.setRoute({ routeId: 'r', routeVersion: 1, pathCoordinates: path, origin, maneuvers: [] });
  let seq = 0;
  const snapshot = (session = 'walk-1') => ({
    alongPathMeters: engine.progress, routeTraveledMeters: engine.progress, routeRemainingMeters: engine.remaining,
    routeSimulating: false, routeSimulationComplete: engine.arrived, ...engine.at(),
    source: 'physical-gps-transformed', navigationAuthority: 'parent-physical-walk',
    simulationSessionId: session, simulationSequence: seq, routeId: 'r', routeVersion: 1,
  });
  const deliver = (progress = snapshot()) => c.FplacesRouteBridge.applyNavigationSync(progress, 'test-parent');
  const walk = (meters: number) => { engine.commit({ sequence: ++seq, meters, timestamp: seq }); deliver(); };
  deliver();
  const camera = { position: new THREE.Vector3(0, 1.5, 0), worldToLocal: (p: any) => p };
  const scene = new THREE.Group();
  c.__fplacesXrScene = scene; c.__fplacesXrCamera = camera;
  c.FplacesAnchorEngine.calibrate(origin, { floorId: 'A', groundY: 0 });
  c.FplacesWorldRoute.attach({ THREE, scene, camera }); c.FplacesWorldRoute.setRoute(nav);
  const update = () => { tick(); c.FplacesWorldRoute.update({ navigator: nav }); tick(); c.FplacesWorldRoute.update({ navigator: nav }); };
  const trail = () => scene.getObjectByName(c.FplacesIncrementalPath.TRAIL_GROUP_NAME);
  return { c, nav, engine, walk, deliver, snapshot, camera, scene, update, trail };
}
describe('AR consumes committed physical-walk progress', () => {
  it('follows the exact same L-route progress and remaining distance as the parent', () => {
    const h = setup(); h.walk(12);
    expect(h.nav.getDisplayAlongPathMeters()).toBe(12);
    expect(h.nav.getDisplaySnap().latitude).toBeCloseTo(h.engine.at().latitude, 10);
    expect(h.nav.getDisplaySnap().longitude).toBeCloseTo(h.engine.at().longitude, 10);
    expect(h.nav.getState().distanceRemainingMeters).toBeCloseTo(h.engine.remaining, 8);
    expect(h.nav.getTargetBearingDegrees()).toBeCloseTo(90, 1);
  });
  it('updates the existing six-arrow trail from committed metres, preserving fixed spacing and retained meshes', () => {
    const h = setup(); h.update();
    const initial = [...h.trail().children]; expect(initial).toHaveLength(6);
    h.walk(4); h.update();
    const next = h.trail().children; expect(next).toHaveLength(6);
    expect(next).not.toContain(initial[0]); expect(next.some((m: any) => initial.includes(m))).toBe(true);
    for (let i = 1; i < next.length; i++) {
      const a = next[i - 1].position, b = next[i].position;
      // Consecutive points straddling the right angle have chord <= the 2m arc spacing.
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThanOrEqual(2.001);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
    }
  });
  it('never advances from time, camera translation, heading, raw GPS or position packets', () => {
    const h = setup(); h.walk(12); const before = h.nav.getDisplaySnap();
    h.c.FplacesSlamPose.calibrate(h.camera, h.nav, before, 12);
    for (let i = 0; i < 20; i++) {
      h.camera.position.z -= 2; h.c.FplacesSlamPose.update(h.camera); h.update();
      h.nav.advanceAlongPath(); h.nav.getDisplayDistanceMeters();
    }
    h.c.FplacesRouteBridge.applyPosition({ latitude: 6.5, longitude: 3.4, source: 'gps', alongPathMeters: 49 }, 'competing-gps');
    h.nav.applyPosition({ ...point(39, 10), source: 'pwa', alongPathMeters: 49 });
    h.deliver({ ...h.snapshot(), heading: 170 }); h.nav.startGps();
    expect(h.nav.getDisplayAlongPathMeters()).toBe(12); expect(h.nav.getDisplaySnap()).toEqual(before);
    expect(h.c.FplacesSlamPose.shouldUseFusion(h.nav)).toBe(false);
    expect(h.c.navigator.geolocation.watchPosition).not.toHaveBeenCalled();
  });
  it('does not arrive through endpoint proximity and holds the exact remaining distance until committed completion', () => {
    const h = setup(); h.walk(48);
    h.nav.applyArrivalLatch(2); h.nav.advanceAlongPath();
    expect(h.nav.getState().arrived).toBe(false); expect(h.nav.getState().distanceRemainingMeters).toBeCloseTo(2, 5);
    h.walk(5); expect(h.nav.getState().arrived).toBe(true); expect(h.nav.getState().distanceRemainingMeters).toBe(0);
  });
  it('rejects old route, older sequence, retired session, and competing progress writers', () => {
    const h = setup(); h.walk(12); const current = h.snapshot();
    for (const stale of [{ ...current, routeId: 'old', alongPathMeters: 40 }, { ...current, simulationSequence: 0, alongPathMeters: 40 },
      { ...current, navigationAuthority: 'parent-simulator', source: 'simulator', alongPathMeters: 40 }]) h.deliver(stale);
    expect(h.nav.getDisplayAlongPathMeters()).toBe(12);
    h.deliver({ ...current, simulationSessionId: 'walk-2', simulationSequence: 0, alongPathMeters: 0, routeRemainingMeters: h.engine.length });
    expect(h.nav.getDisplayAlongPathMeters()).toBe(0);
    h.deliver(current); expect(h.nav.getDisplayAlongPathMeters()).toBe(0);
    h.deliver({ ...current, navigationAuthority: 'local', simulationSessionId: 'walk-1' });
    expect(h.nav.isParentPhysicalWalkAuthority()).toBe(true);
    h.deliver({ ...current, navigationAuthority: 'local', simulationSessionId: 'walk-2', alongPathMeters: 0 });
    expect(h.nav.isParentPhysicalWalkAuthority()).toBe(false);
  });
  it('restores the latest committed snapshot after AR scene restart without changing the parent engine', () => {
    const h = setup(); h.walk(12); const progress = h.snapshot(); const route = h.nav.route;
    h.c.FplacesWorldRoute.detach(); h.nav.setRoute({ ...route, navigationProgress: progress });
    h.c.FplacesWorldRoute.attach({ THREE, scene: h.scene, camera: h.camera }); h.c.FplacesWorldRoute.setRoute(h.nav);
    expect(h.nav.getDisplayAlongPathMeters()).toBe(12); expect(h.engine.progress).toBe(12);
    h.walk(3); expect(h.nav.getDisplayAlongPathMeters()).toBe(15);
  });
});

it('Align Route recalibrates at committed simulation progress and resumes the six-arrow trail without mutating the simulation', () => {
  const h = setup(); h.walk(12); const committed = h.snapshot();
  h.c.FplacesCameraStart = { isStarted: () => true };
  let heading = 90;
  h.c.FplacesOrientationCompass = { getRawCompassHeading: () => heading };
  h.c.FplacesSlamHeading = { getRawYawDegrees: () => 0, calibrate: vi.fn() };
  vm.runInContext(readFileSync(new URL('../../../ar-nav/js/xr-nav-scene.js', import.meta.url), 'utf8'), h.c);
  h.c.FplacesSpatialAlignment.observe('NORMAL'); h.c.FplacesSpatialAlignment.invalidate('World frame changed.');
  heading = 270;
  expect(h.c.executeDemoCalibrationFlow({ manual: true })).toBe(false);
  expect(h.snapshot()).toEqual(committed); expect(h.nav.getDisplayAlongPathMeters()).toBe(12);
  heading = 90; h.c.FplacesSpatialAlignment.observe('NORMAL');
  expect(h.c.executeDemoCalibrationFlow({ manual: true })).toBe(true);
  expect(h.c.FplacesAnchorEngine.instance.origin.latitude).toBeCloseTo(h.engine.at().latitude, 10);
  expect(h.c.FplacesAnchorEngine.instance.origin.longitude).toBeCloseTo(h.engine.at().longitude, 10);
  expect(h.snapshot()).toEqual(committed); expect(h.nav.isParentPhysicalWalkAuthority()).toBe(true);
  expect(h.trail().children).toHaveLength(6);
  h.walk(3); h.update(); expect(h.nav.getDisplayAlongPathMeters()).toBe(15); expect(h.engine.progress).toBe(15);
});

it('clears stale arrival/navigation UI on an explicit matching parent route reset without mutating walked metres', () => {
  const h = setup(); h.walk(60); expect(h.nav.arrived).toBe(true);
  const message = h.c.addEventListener.mock.calls.find((args: any[]) => args[0] === 'message')[1];
  message({ origin: h.c.location.origin, data: { type: 'fplaces_navigation_reset', routeId: 'old-route', routeVersion: 1 } });
  expect(h.nav.arrived).toBe(true);
  const progress = h.engine.progress;
  message({ origin: h.c.location.origin, data: { type: 'fplaces_navigation_reset', routeId: 'r', routeVersion: 1 } });
  expect(h.nav.route).toBeNull(); expect(h.nav.arrived).toBe(false); expect(h.c.fplacesActiveRoute).toBeNull();
  expect(h.engine.progress).toBe(progress);
});
