import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { THREE, runtime } from '../../test-support/ar-runtime';
const pt = (x: number, z: number) => ({ x, y: .04, z });
const straight = [pt(0, 0), pt(0, -40)];
function setup(config = {}) {
  const { c } = runtime(config);
  let now = 1000;
  c.performance.now = () => now;
  const load = (file: string) => vm.runInContext(readFileSync(new URL(`../../../ar-nav/js/${file}.js`, import.meta.url), 'utf8'), c);
  load('trail-diagnostics');
  c.FplacesTrailDiagnostics.setEnabled(true);
  const scene = new THREE.Group();
  const camera = THREE.PerspectiveCamera ? new THREE.PerspectiveCamera(60, 1, .01, 100) : {
    position: new THREE.Vector3(), rotation: { x: 0, y: 0, z: 0 },
    worldToLocal(p: any) { const x = p.x - this.position.x, z = p.z - this.position.z;
      p.z = Math.sin(this.rotation.y) * x + Math.cos(this.rotation.y) * z; return p; },
  };
  const nav = { _authoritativeAlongPathM: 5 };
  c.__fplacesNavigator = nav;
  const advance = (ms = 120) => { now += ms; };
  const extend = (along = 5, points = straight, floorY = .04) => {
    nav._authoritativeAlongPathM = along;
    camera.updateMatrixWorld?.();
    return c.FplacesIncrementalPath.extend(THREE, scene, points, {
      alongPathM: along, camera, cameraX: camera.position.x, cameraZ: camera.position.z, floorY,
    });
  };
  const events = (type?: string) => JSON.parse(c.FplacesTrailDiagnostics.export()).records.filter((e: any) => !type || e.type === type);
  return { c, scene, camera, nav, advance, extend, events, load };
}

describe('deterministic visibility sequences', () => {
  it('reproduces pre-fix slot oscillation with stabilization disabled', () => {
    const { advance, extend, events } = setup({ trailMembershipStableMs: 0 });
    for (const along of [5, 5.4, 5, 5.4, 5]) { advance(); extend(along); }
    expect(events('remove').filter((e: any) => e.slot === 'seg:6')).toHaveLength(2);
    expect(events('create').filter((e: any) => e.slot === 'seg:6')).toHaveLength(3);
  });
  it('retains exact identities across threshold jitter, then commits sustained progress', () => {
    const { advance, extend, events } = setup(); const group = extend();
    const initial = [...group.children];
    for (let i = 0; i < 20; i++) { advance(); extend(i % 2 ? 5 : 5.4); }
    expect(group.children).toEqual(initial); expect(events('remove')).toHaveLength(0);
    advance(); extend(5.4); advance(240); extend(5.4);
    expect(group.children).not.toContain(initial[0]); expect(group.children[0]).toBe(initial[1]);
    expect(events('remove')).toMatchObject([{ slot: 'seg:6', reason: 'slot-window-change' }]);
  });
  it('replenishes the six-arrow grid along the entire route without rebuilding stable geometry', () => {
    const { c, scene, advance } = setup(); const identity = {}; const seen = new Set<number>();
    let group: any;
    for (let along = 0; along < 39; along += .5) {
      const refresh = () => c.FplacesIncrementalPath.extend(THREE, scene, straight.map(p => ({ ...p })), {
        geometryIdentity: identity, alongPathM: along, cameraX: 0, cameraZ: -along,
      });
      const next = refresh(); if (group) expect(next).toBe(group); group = next;
      advance(240); refresh(); expect(group.children.length).toBeLessThanOrEqual(6);
      for (const child of group.children) {
        const mark = child.userData.alongM; expect(mark % 2).toBe(0); expect(mark).toBeLessThan(40); seen.add(mark);
      }
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 19 }, (_, i) => (i + 1) * 2));
  });
  it('permits deliberate backward travel without permanently increasing progress', () => {
    const { advance, extend, events } = setup(); const group = extend(7); const retained = group.children[0];
    advance(); extend(5); advance(240); extend(5);
    expect(group.children).toContain(retained);
    expect(events('create').filter((e: any) => e.slot === 'seg:6')).toHaveLength(1);
  });
  it('keeps world transforms and identities through yaw, pitch, roll, shake, and return', () => {
    const { advance, extend, camera, events, nav } = setup(); const group = extend();
    const initial = [...group.children]; const positions = initial.map(a => ({ ...a.position }));
    for (const [yaw, pitch, roll] of [[0, 0, 0], [.2, 0, 0], [-.2, 0, 0], [Math.PI, 0, 0], [0, 1, 0], [0, -1, 0], [2, .8, 1], [-2, -.8, -1], [0, 0, 0]]) {
      Object.assign(camera.rotation, { x: pitch, y: yaw, z: roll }); advance(240); extend();
    }
    expect(group.children).toEqual(initial);
    expect(group.children.map((a: any) => ({ ...a.position }))).toEqual(positions);
    expect(events('remove')).toHaveLength(0); expect(nav._authoritativeAlongPathM).toBe(5);
    expect(group.children.every((a: any) => a.visible)).toBe(true);
  });
  it.each([
    ['parallel', [pt(0, 0), pt(0, -30), pt(1, -30), pt(1, 0)]],
    ['hairpin', [pt(0, 0), pt(0, -20), pt(.5, -20), pt(.5, 0)]],
  ])('does not activate a different %s segment when camera projection jumps', (_name, points) => {
    const { camera, advance, extend, events } = setup(); const group = extend(5, points as any);
    const initial = [...group.children];
    for (const x of [0, 1, 0, 1, -4, 4, 0]) { camera.position.set(x, 0, -5); advance(240); extend(5, points as any); }
    expect(group.children).toEqual(initial); expect(events('remove')).toHaveLength(0);
    const samples = events('sample');
    expect(new Set(samples.map((e: any) => Math.round(e.progress.cameraAlongM))).size).toBeGreaterThan(1);
    expect(samples.every((e: any) => e.progress.selectedAlongM === 5)).toBe(true);
  });
  it('bypasses pending membership immediately on route replacement and recalibration', () => {
    const { c, scene, advance, extend, events } = setup(); const old = extend();
    advance(); extend(5.4);
    const replacement = [pt(2, 0), pt(2, -40)]; const next = extend(5.4, replacement);
    expect(next).not.toBe(old); expect(next.children.length).toBeGreaterThan(0);
    c.FplacesIncrementalPath.dispose(scene, 'recalibration');
    const restored = extend(5.4, replacement, -1);
    expect(restored.children.every((a: any) => a.position.y === -1)).toBe(true);
    const ids = restored.children.map((a: any) => a.userData.trailInstanceId);
    advance(240); extend(5.4, replacement, -1);
    expect(restored.children.map((a: any) => a.userData.trailInstanceId)).toEqual(ids);
    expect(events('remove').some((e: any) => e.reason === 'recalibration')).toBe(true);
  });
  it('keeps arrival clearing immediate even while a membership change is pending', () => {
    const { advance, extend, events } = setup(); const group = extend();
    advance(); extend(5.4); extend(39);
    expect(group.children).toHaveLength(0);
    expect(events('remove').every((e: any) => e.reason === 'arrival-window')).toBe(true);
  });
  it('clears on tracking loss and requires explicit valid recovery', () => {
    const { c, load, scene, extend, events } = setup();
    load('anchorEngine'); load('spatial-alignment');
    c.__fplacesNavigator.route = { pathCoordinates: [{}, {}] }; c.__fplacesNavigator.getTargetBearingDegrees = () => 0;
    c.__fplacesXrScene = scene; c.__fplacesXrCamera = {}; c.FplacesCameraStart = { isStarted: () => true };
    c.FplacesOrientationCompass = { getRawCompassHeading: () => 0 };
    c.FplacesAnchorEngine.calibrate({ latitude: 0, longitude: 0 });
    c.FplacesWorldRoute = { invalidate: (reason: string) => c.FplacesIncrementalPath.dispose(scene, reason) };
    extend(); c.FplacesSpatialAlignment.observe('NORMAL'); c.FplacesSpatialAlignment.observe('LIMITED');
    expect(scene.children).toHaveLength(0);
    c.FplacesSpatialAlignment.observe('NORMAL'); expect(c.FplacesSpatialAlignment.canCalibrate(false)).toBe(false);
    expect(c.FplacesSpatialAlignment.canCalibrate(true)).toBe(true);
    c.FplacesAnchorEngine.calibrate({ latitude: 0, longitude: 0 }); c.FplacesSpatialAlignment.calibrated();
    expect(extend().children.length).toBeGreaterThan(0);
    expect(events('remove').every((e: any) => e.reason === 'Tracking interrupted.')).toBe(true);
  });
});

describe('opt-in diagnostics', () => {
  it('does no sample work while disabled and bounds retained records', () => {
    const { c, extend, events } = setup(); c.FplacesTrailDiagnostics.setEnabled(false);
    const sample = vi.spyOn(c.FplacesTrailDiagnostics, 'sample'); extend();
    expect(sample).not.toHaveBeenCalled(); expect(events()).toHaveLength(0);
    c.FplacesTrailDiagnostics.setEnabled(true);
    for (let i = 0; i < 1000; i++) c.FplacesTrailDiagnostics.record('test', { i });
    expect(events()).toHaveLength(512); expect(events()[0].i).toBe(488);
    c.FplacesTrailDiagnostics.setEnabled(false); expect(events()).toHaveLength(0);
  });
  it.skipIf(!THREE.PerspectiveCamera)('distinguishes actual frustum exit from mesh lifecycle with real Three.js', () => {
    const { camera, advance, extend, events } = setup(); const group = extend(); const ids = group.children.map((a: any) => a.userData.trailInstanceId);
    camera.rotation.y = Math.PI; advance(240); extend();
    camera.rotation.y = 0; advance(240); extend();
    const samples = events('sample');
    expect(samples[0].arrows.every((a: any) => a.insideFrustum)).toBe(true);
    expect(samples[1].arrows.every((a: any) => !a.insideFrustum)).toBe(true);
    expect(samples[2].arrows.map((a: any) => a.id)).toEqual(ids);
    expect(events('remove')).toHaveLength(0);
    expect(events('visibility').some((e: any) => e.intervalMs === 240)).toBe(true);
  });
});

describe('orientation is not walking evidence', () => {
  it('does not advance navigator progress when stationary with an untrusted GPS snap', () => {
    const { c, load, advance } = setup(); load('route-navigator');
    c.FplacesRouteGeometry = { totalPathLengthMeters: () => 40 };
    c.FplacesSlamHeading = { isActive: () => true, getHeadingDegrees: () => 0 };
    const nav = new c.FplacesRouteNavigator();
    nav.route = { pathCoordinates: [{}, {}] }; nav.positionSource = 'gps';
    nav.isGpsSnapTrustworthy = () => false; nav.isVenueSnapTrustworthy = () => false;
    nav.getTargetBearingDegrees = () => 0; nav._moveSpeedMps = 0;
    expect(nav.getDisplayAlongPathMeters(5)).toBe(5);
    for (const heading of [0, 20, 180, 0, 10, 0]) {
      c.FplacesSlamHeading.getHeadingDegrees = () => heading; advance(1000);
      expect(nav.getDisplayAlongPathMeters(5)).toBe(5);
    }
    nav._moveSpeedMps = 1; advance(1000);
    expect(nav.getDisplayAlongPathMeters(5)).toBe(6);
  });
  it('preserves the separate parent simulator clock', () => {
    const { c, load, advance } = setup(); load('route-navigator');
    c.FPLACES_AR_CONFIG.useGpsProgress = false;
    c.FplacesRouteGeometry = { totalPathLengthMeters: () => 40 };
    const nav = new c.FplacesRouteNavigator(); nav.route = { pathCoordinates: [{}, {}] };
    nav.positionSource = 'simulator'; nav.enableParentSimulatorAuthority(); nav.recordParentSimulatorClock(5);
    const before = nav.getDisplayAlongPathMeters(5); advance(100);
    expect(nav.getDisplayAlongPathMeters(5)).toBeGreaterThanOrEqual(before);
    expect(nav._authoritativeAlongPathM).toBe(5);
  });
});
