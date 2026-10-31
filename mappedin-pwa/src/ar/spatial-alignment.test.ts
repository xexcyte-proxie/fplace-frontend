import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { THREE, runtime } from '../../test-support/ar-runtime';

const geo = (x: number, z: number, floorId = 'A', legId = 'walk') =>
  ({ latitude: -z / 111195, longitude: x / 111195, floorId, legId });
const route = (version = 1) => ({ version, pathCoordinates: [geo(0, 0), geo(0, -10), geo(0, -20), geo(0, -30), geo(0, -40)] });
function setup() {
  const { c, tick } = runtime();
  for (const file of ['geo-math', 'route-geometry', 'anchorEngine', 'visual-route-state', 'floor-transitions', 'spatial-alignment', 'pathGeometry', 'world-route-scene', 'xr-nav-scene']) {
    vm.runInContext(readFileSync(new URL(`../../../ar-nav/js/${file}.js`, import.meta.url), 'utf8'), c);
  }
  c.FplacesArDebug = { log: vi.fn(), warn: vi.fn() };
  c.FplacesLiveViewHud = { setStatus: vi.fn() };
  c.FplacesSlamHeading = { getRawYawDegrees: () => 0, calibrate: vi.fn() };
  c.FplacesOrientationCompass = { getRawCompassHeading: vi.fn(() => 0) };
  c.FplacesSlamPose = { deactivate: vi.fn(), calibrate: vi.fn() };
  const scene = new THREE.Group();
  const camera = { position: new THREE.Vector3(0, 1.5, 0), worldToLocal: (point: any) => point };
  const nav: any = { route: route(), _trackedFloorId: 'A', _authoritativeAlongPathM: 0,
    _displayAlongPathM: 0, getState: () => ({ arrived: nav.arrived }),
    getTargetBearingDegrees: () => 0,
    ensureSnap: () => ({ ...geo(0, 0), distanceAlongPathMeters: nav._authoritativeAlongPathM }) };
  c.__fplacesNavigator = nav;
  c.__fplacesXrScene = scene; c.__fplacesXrCamera = camera;
  c.FplacesCameraStart = { isStarted: () => true };
  c.FplacesWorldRoute.attach({ THREE, scene, camera });
  const calibrate = (groundY = 0) => c.FplacesAnchorEngine.calibrate(geo(0, 0), { groundY, floorId: nav._trackedFloorId });
  calibrate();
  const build = () => c.FplacesWorldRoute.setRoute(nav);
  const trail = () => scene.getObjectByName(c.FplacesIncrementalPath.TRAIL_GROUP_NAME);
  return { c, tick, scene, camera, nav, calibrate, build, trail };
}

describe('route snapshot and floor selection', () => {
  it('covers every interior coordinate and route version', () => {
    const { c } = setup(); const a = route(); const b = route(); b.pathCoordinates[1] = geo(7, -10);
    const prepare = c.FplacesVisualRouteState.prepare;
    expect(prepare(a).signature).not.toBe(prepare(b).signature);
    expect(prepare(a).signature).not.toBe(prepare(route(2)).signature);
  });
  it('selects repeated floor visits by global progress and excludes elevator edges', () => {
    const { c } = setup(); const v = c.FplacesVisualRouteState;
    const snapshot = v.prepare({ pathCoordinates: [geo(0, 0), geo(0, -10), geo(0, -10, 'B'), geo(0, -30, 'B'), geo(0, -30), geo(0, -40)] });
    expect(snapshot.sections).toHaveLength(3);
    expect(v.select(snapshot, 'A', 5).id).toBe(0);
    expect(v.select(snapshot, 'A', 35).id).toBe(2);
    expect(v.select(snapshot, 'B', 15).pathCoordinates.every((p: any) => p.floorId === 'B')).toBe(true);
    expect(v.select(snapshot, 'A', 35).startAlong).toBeCloseTo(30, 2);
  });
  it('splits same-floor legs at their shared endpoint', () => {
    const { c } = setup(); const r = route();
    const s = c.FplacesVisualRouteState.prepare({ ...r, legs: [{ legId: 'a', startIndex: 0, endIndex: 2 }, { legId: 'b', startIndex: 2, endIndex: 4 }] }).sections;
    expect(s).toHaveLength(2);
    expect(s[0].pathCoordinates.at(-1)).toEqual(s[1].pathCoordinates[0]);
    expect(s[0].isFinalSection).toBe(false);
  });
});

describe('world route lifecycle', () => {
  it.each(['interior', 'version', 'replacement'])('rebuilds a same-floor %s change without resetting calibration', kind => {
    const { c, nav, build, trail, scene } = setup(); build(); const before = trail(); const revision = c.FplacesAnchorEngine.instance.revision;
    if (kind === 'interior') nav.route.pathCoordinates[1] = geo(6, -10);
    else nav.route = route(2);
    build(); expect(trail()).not.toBe(before);
    expect(c.FplacesAnchorEngine.instance.revision).toBe(revision);
    expect(scene.children).not.toContain(before);
  });
  it('reprojects after recalibration and applies height offset', () => {
    const { c, build, trail } = setup(); build(); const old = trail();
    c.FplacesAnchorEngine.calibrate(geo(0, 0), { slamX: 5, slamZ: 3, yawOffsetDeg: 90, groundY: -1 });
    c.FplacesWorldRoute.ensureRibbon();
    expect(trail()).not.toBe(old);
    expect(trail().children[0].position.y).toBeCloseTo(-.96);
    expect(trail().children[0].position.x).toBeGreaterThan(5);
  });
  it('does not rebuild or hash during normal updates and preserves the world anchor', () => {
    const { c, nav, build, camera, trail, tick } = setup(); build();
    const initial = trail(); const revision = c.FplacesAnchorEngine.instance.revision;
    const prepare = vi.spyOn(c.FplacesVisualRouteState, 'prepare');
    const generate = vi.spyOn(c.FplacesPathGeometry, 'generateWorldMeshPath');
    for (let i = 0; i < 50; i++) { camera.position.x = i / 10; tick(); c.FplacesWorldRoute.update({ navigator: nav }); }
    expect(prepare).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
    expect(trail()).toBe(initial); expect(c.FplacesAnchorEngine.instance.revision).toBe(revision);
    expect(trail().children.length).toBeLessThanOrEqual(8);
  });
  it('clears on a floor change and rebuilds only after calibration on the new floor', () => {
    const { c, nav, build, trail, calibrate } = setup(); build();
    nav.route = { pathCoordinates: [geo(0, 0, 'B'), geo(0, -40, 'B')] }; nav._trackedFloorId = 'B';
    build(); expect(trail()).toBeUndefined(); expect(c.FplacesAnchorEngine.isCalibrated).toBe(false);
    calibrate(-2); c.FplacesWorldRoute.ensureRibbon(); expect(trail()).toBeTruthy();
  });
  it('clears removed routes and releases resources across repeated replacement/open/close', () => {
    const { c, nav, build, trail, scene, camera } = setup();
    for (let i = 0; i < 20; i++) {
      nav.route = route(i); build(); const material = trail().children[0].children[0].material;
      const dispose = vi.spyOn(material, 'dispose');
      c.FplacesWorldRoute.detach(); expect(dispose).toHaveBeenCalledOnce(); expect(scene.children).toHaveLength(0);
      c.FplacesWorldRoute.attach({ THREE, scene, camera });
    }
    build(); nav.route = null; build(); expect(scene.children).toHaveLength(0);
  });
  it('uses section-local progress and does not show a goal at a floor connector', () => {
    const { c, nav, build, trail, scene } = setup();
    nav.route = { pathCoordinates: [geo(0, 0), geo(0, -20), geo(0, -20, 'B'), geo(0, -60, 'B')] };
    nav._authoritativeAlongPathM = 15; build();
    expect(scene.getObjectByName(c.FplacesIncrementalPath.DESTINATION_GROUP_NAME)).toBeUndefined();
    nav._trackedFloorId = 'B'; c.FplacesWorldRoute.ensureRibbon();
    c.FplacesAnchorEngine.calibrate(geo(0, 0), { groundY: 0 }); nav._authoritativeAlongPathM = 25;
    c.FplacesWorldRoute.ensureRibbon();
    expect(trail().children[0].userData.alongM).toBe(6);
  });
});

describe('ground reference and tracking gate', () => {
  it('labels missing ground as a fallback and validates finite inputs with retry', () => {
    const { c } = setup(); const anchor = c.FplacesAnchorEngine;
    anchor.calibrate(geo(0, 0)); expect(anchor.instance.ground.kind).toBe('estimated-origin-height');
    expect(anchor.calibrate(geo(0, 0), { groundY: NaN })).toBe(false); expect(anchor.isCalibrated).toBe(false);
    expect(anchor.calibrate(geo(0, 0), { groundY: -1.2 })).toBe(true);
    expect(anchor.instance.getGroundY()).toBeCloseTo(-1.16);
    expect(anchor.instance.ground.physicallyVerified).toBe(false);
    c.FPLACES_AR_CONFIG.groundOffsetM = .02; expect(anchor.instance.getGroundY()).toBeCloseTo(-1.18);
  });
  it.each(['Tracking interrupted.', 'Camera paused.', 'Camera resumed.', 'World frame changed.'])('hides stale geometry on %s and requires manual recovery', reason => {
    const { c, nav, build, trail } = setup(); build(); nav._authoritativeAlongPathM = 12;
    c.FplacesSpatialAlignment.observe('NORMAL'); c.FplacesSpatialAlignment.invalidate(reason);
    expect(trail()).toBeUndefined(); expect(nav._authoritativeAlongPathM).toBe(12);
    c.FplacesSpatialAlignment.observe('NORMAL'); expect(c.FplacesSpatialAlignment.canCalibrate(false)).toBe(false);
    expect(c.FplacesSpatialAlignment.canCalibrate(true)).toBe(true);
  });
  it('rejects manual calibration during LIMITED tracking and restores only after NORMAL', () => {
    const { c, build, trail } = setup(); build();
    c.FplacesSpatialAlignment.observe('LIMITED'); expect(c.FplacesSpatialAlignment.canCalibrate(true)).toBe(false);
    expect(trail()).toBeUndefined(); c.FplacesSpatialAlignment.observe('NORMAL');
    expect(c.FplacesSpatialAlignment.canCalibrate(true)).toBe(true);
  });
  it('expires tracking samples rather than leaving stale arrows', () => {
    const { c, tick, build, trail } = setup(); build(); c.FplacesSpatialAlignment.observe('NORMAL');
    for (let i = 0; i < 7; i++) tick();
    c.FplacesSpatialAlignment.checkFreshness(); expect(trail()).toBeUndefined();
  });
  it('one-tap alignment preserves a valid ground estimate and parent progress', () => {
    const { c, nav, camera } = setup(); nav._authoritativeAlongPathM = 12;
    c.FplacesAnchorEngine.calibrate(geo(0, 0), { groundY: .3, floorId: 'A' });
    c.FplacesSpatialAlignment.observe('NORMAL');
    expect(c.executeDemoCalibrationFlow({ manual: true })).toBe(true);
    expect(c.FplacesAnchorEngine.instance.ground.y).toBeCloseTo(.3);
    expect(nav._authoritativeAlongPathM).toBe(12);
    camera.position.y = 2; expect(c.FplacesAnchorEngine.instance.ground.y).toBeCloseTo(.3);
  });
});

describe('visual progress and retained instances', () => {
  it('gives navigation priority, suppresses jitter, and allows reverse travel', () => {
    const { c } = setup(); const reconcile = c.FplacesVisualRouteState.reconcile;
    expect(reconcile(10, 10.2, 30)).toBe(10);
    expect(reconcile(10, 9.8, 30)).toBe(10);
    expect(reconcile(10, 8, 30)).toBe(8);
    expect(reconcile(null, null, 4)).toBe(4);
  });
  it('updates retained transforms when coordinates change with the same placement keys', () => {
    const { c, scene } = setup();
    const points = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -40 }];
    const options = { cameraX: 0, cameraZ: 0, alongPathM: 0, floorY: 0 };
    const group = c.FplacesIncrementalPath.extend(THREE, scene, points, options); const arrow = group.children[0];
    points[1].x = 40; points[1].z = 0;
    c.FplacesIncrementalPath.extend(THREE, scene, points, { ...options, floorY: -1 });
    expect(group.children[0]).toBe(arrow); expect(arrow.position.x).toBe(2);
    expect(arrow.position.y).toBe(-1); expect(arrow.position.z).toBe(0); expect(arrow.rotation.y).not.toBe(0);
  });
});

describe('XR8 pipeline wiring', () => {
  function pipeline() {
    const env = setup(); const { c, nav } = env;
    c.document = { getElementById: () => ({ addEventListener: vi.fn() }) };
    c.addEventListener = vi.fn();
    const module = (name: string) => ({ pipelineModule: () => ({ name }) });
    c.XR8 = { GlTextureRenderer: module('GlTextureRenderer'), Threejs: module('Threejs'),
      XrController: module('XrController'), addCameraPipelineModules: vi.fn() };
    c.XRExtras = { FullWindowCanvas: module('FullWindowCanvas') };
    c.FplacesXrRendererPatch = { createModule: () => ({ name: 'rendererPatch' }) };
    c.FplacesXrNavScene.start({ navigator: nav, hud: { update: vi.fn() } });
    const modules = c.XR8.addCameraPipelineModules.mock.calls[0][0];
    return { ...env, modules, module: modules.at(-1) };
  }
  it('preserves pipeline order and consumes reality tracking status', () => {
    const { c, modules, module, build, trail } = pipeline(); build();
    expect(modules.map((m: any) => m.name)).toEqual(['GlTextureRenderer', 'Threejs', 'rendererPatch', 'XrController', 'FullWindowCanvas', 'fplaces-runtime-error', 'fplaces-navigation']);
    module.onUpdate({ processCpuResult: { reality: { trackingStatus: 'LIMITED' } } });
    expect(trail()).toBeUndefined(); expect(c.FplacesSpatialAlignment.status).toBe('LIMITED');
  });
  it.each(['onPaused', 'onResume'])('invalidates via the actual %s callback', callback => {
    const { c, module, build, trail } = pipeline(); build(); module[callback]();
    expect(trail()).toBeUndefined(); expect(c.FplacesSpatialAlignment.needsManual).toBe(true);
  });
  it('distinguishes initial camera configuration from an explicit recenter', () => {
    const { c, module, build, trail } = pipeline(); build();
    const event = module.listeners.find((l: any) => l.event === 'reality.cameraconfigured');
    event.process({ detail: { recenter: false } }); expect(trail()).toBeTruthy();
    event.process({ detail: { recenter: true } }); expect(trail()).toBeUndefined();
    const tracking = module.listeners.find((l: any) => l.event === 'reality.trackingstatus');
    tracking.process({ detail: { status: 'NORMAL' } });
    expect(c.FplacesSpatialAlignment.canCalibrate(false)).toBe(false);
  });
});

describe('calibration and route acceptance regression', () => {
  it('rejects missing heading and invalid camera pose, then succeeds on retry', () => {
    const { c, camera } = setup(); c.FplacesSpatialAlignment.observe('NORMAL');
    const manual = { manual: true };
    c.FplacesSlamHeading.getRawYawDegrees = () => null;
    expect(c.executeDemoCalibrationFlow(manual)).toBe(false);
    c.FplacesSlamHeading.getRawYawDegrees = () => 0;
    camera.position.y = NaN;
    expect(c.executeDemoCalibrationFlow(manual)).toBe(false);
    camera.position.y = 1.5;
    expect(c.executeDemoCalibrationFlow(manual)).toBe(true);
  });
  it('rebuilds via the actual navigator setRoute acceptance path', () => {
    const { c, trail } = setup();
    vm.runInContext(readFileSync(new URL('../../../ar-nav/js/route-navigator.js', import.meta.url), 'utf8'), c);
    c.FplacesArDebug.routeSummary = () => ({});
    const nav = new c.FplacesRouteNavigator(); c.__fplacesNavigator = nav;
    nav.notify = vi.fn(); nav.stopGps = vi.fn();
    nav.setRoute(route()); const first = trail(); expect(first).toBeTruthy();
    const next = route(2); next.pathCoordinates[1] = geo(5, -10);
    nav.setRoute(next); expect(trail()).not.toBe(first);
    expect(c.FplacesAnchorEngine.isCalibrated).toBe(true);
  });
});

describe('one-tap alignment recovery', () => {
  it('rejects LIMITED tracking, then restores the trail with no height input after recovery', () => {
    const { c, build, trail, nav } = setup(); build(); nav._authoritativeAlongPathM = 12;
    c.FplacesSpatialAlignment.observe('LIMITED');
    expect(c.executeDemoCalibrationFlow({ manual: true })).toBe(false);
    expect(trail()).toBeUndefined();
    c.FplacesSpatialAlignment.observe('NORMAL');
    expect(c.executeDemoCalibrationFlow({ manual: true })).toBe(true);
    expect(trail()).toBeTruthy(); expect(nav._authoritativeAlongPathM).toBe(12);
    expect(c.FplacesAnchorEngine.instance.ground.kind).toBe('estimated-origin-height');
    expect(c.FplacesAnchorEngine.instance.ground.physicallyVerified).toBe(false);
  });
  it('does not reuse an old-floor height reference', () => {
    const { c } = setup();
    c.FplacesAnchorEngine.calibrate(geo(0, 0), { groundY: -3, floorId: 'B' });
    c.FplacesSpatialAlignment.observe('NORMAL');
    expect(c.executeDemoCalibrationFlow({ manual: true })).toBe(true);
    expect(c.FplacesAnchorEngine.instance.ground.kind).toBe('estimated-origin-height');
    expect(c.FplacesAnchorEngine.instance.ground.floorId).toBe('A');
  });
  it('aligns directly from the button click without opening a height form', () => {
    const { c, trail } = setup(); c.FplacesSpatialAlignment.observe('NORMAL');
    let click: () => void = () => {};
    const create = vi.fn(() => ({ addEventListener: (_event: string, handler: () => void) => { click = handler; } }));
    c.document = { getElementById: () => null, createElement: create, body: { appendChild: vi.fn() } };
    c.FplacesArCalibrationUi.inject(); click();
    expect(create).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledWith('button');
    expect(trail()).toBeTruthy();
  });
});

describe('conditional alignment control', () => {
  it('stays hidden during normal navigation, including looking away and returning', () => {
    const { c, build, camera, tick } = setup();
    const button = { hidden: false }; c.document = { getElementById: () => button };
    c.FplacesSpatialAlignment.syncButton(); expect(button.hidden).toBe(true);
    c.FplacesSpatialAlignment.observe('NORMAL'); build();
    camera.worldToLocal = (p: any) => { p.z = -p.z; return p; }; tick();
    expect(button.hidden).toBe(true);
    camera.worldToLocal = (p: any) => p; tick();
    expect(button.hidden).toBe(true);
  });
  it('waits for valid tracking and facing before showing recovery, then hides after alignment', () => {
    const { c, build, trail, tick } = setup();
    const button = { hidden: true }; c.document = { getElementById: () => button };
    c.FplacesSpatialAlignment.observe('NORMAL'); build();
    c.FplacesSpatialAlignment.observe('LIMITED');
    expect(button.hidden).toBe(true); expect(trail()).toBeUndefined();
    expect(c.executeDemoCalibrationFlow({ manual: true })).toBe(false);
    expect(button.hidden).toBe(true);
    tick(); c.FplacesSpatialAlignment.observe('NORMAL'); expect(button.hidden).toBe(false);
    expect(c.executeDemoCalibrationFlow({ manual: true })).toBe(true);
    expect(trail()).toBeTruthy(); expect(button.hidden).toBe(true);
  });
  it('shows a late-created control when recalibration was already required', () => {
    const { c, tick } = setup(); c.FplacesSpatialAlignment.observe('NORMAL'); tick(); c.FplacesSpatialAlignment.invalidate('World frame changed.');
    let button: any = null;
    c.document = { getElementById: () => button,
      createElement: () => ({ addEventListener: vi.fn() }), body: { appendChild: (node: any) => { button = node; } } };
    c.FplacesArCalibrationUi.inject(); expect(button.hidden).toBe(false);
  });
});

describe('Align Route acceptance: direction, visibility and stable recovery', () => {
  it('requires 800ms missing arrows; short disappearances never show recovery or change the anchor', () => {
    const { c, tick, build, trail } = setup(); build(); trail().visible = false;
    const button = { hidden: false }; c.document = { getElementById: () => button };
    const revision = c.FplacesAnchorEngine.instance.revision;
    c.FplacesSpatialAlignment.observe('NORMAL');
    c.FplacesSpatialAlignment.observeArrowVisibility(false, 1000);
    tick(); c.FplacesSpatialAlignment.observeArrowVisibility(false, 1500); expect(button.hidden).toBe(true);
    tick(); c.FplacesSpatialAlignment.observeArrowVisibility(false, 2000); expect(button.hidden).toBe(false);
    c.FplacesSpatialAlignment.observeArrowVisibility(true, 2000); expect(button.hidden).toBe(true);
    expect(c.FplacesAnchorEngine.instance.revision).toBe(revision);
  });
  it('never offers recovery when facing away; requires facing the route steadily on return', () => {
    const { c, tick } = setup(); const button = { hidden: true }; c.document = { getElementById: () => button };
    let heading = 180; c.FplacesOrientationCompass.getRawCompassHeading = () => heading;
    c.FplacesSpatialAlignment.observe('NORMAL'); c.FplacesSpatialAlignment.invalidate('World frame changed.');
    for (let i = 0; i < 3; i++) { tick(); c.FplacesSpatialAlignment.observe('NORMAL'); }
    expect(button.hidden).toBe(true); expect(c.executeDemoCalibrationFlow({ manual: true })).toBe(false);
    heading = 0; c.FplacesSpatialAlignment.syncButton(); expect(button.hidden).toBe(true);
    tick(); c.FplacesSpatialAlignment.observe('NORMAL'); expect(button.hidden).toBe(false);
    heading = 90; c.FplacesSpatialAlignment.observe('NORMAL'); expect(button.hidden).toBe(true);
  });
  it.each([null, undefined, NaN, 31, -31, 180])('rejects missing or incorrect heading %s even if a stale button click is delivered', heading => {
    const { c, tick, build } = setup(); build(); c.FplacesSpatialAlignment.observe('NORMAL');
    tick(); c.FplacesSpatialAlignment.invalidate('World frame changed.');
    c.FplacesOrientationCompass.getRawCompassHeading = () => heading;
    const revision = c.FplacesAnchorEngine.instance.revision;
    expect(c.executeDemoCalibrationFlow({ manual: true })).toBe(false);
    expect(c.FplacesAnchorEngine.instance.revision).toBe(revision);
  });
  it('uses the current route direction after a turn and handles the north bearing wraparound', () => {
    const { c, nav } = setup(); c.FplacesSpatialAlignment.observe('NORMAL');
    nav.getTargetBearingDegrees = () => 350;
    c.FplacesOrientationCompass.getRawCompassHeading = () => 10;
    expect(c.FplacesSpatialAlignment.canCalibrate(true)).toBe(true);
    nav.getTargetBearingDegrees = () => 90;
    expect(c.FplacesSpatialAlignment.canCalibrate(true)).toBe(false);
    c.FplacesOrientationCompass.getRawCompassHeading = () => 90;
    expect(c.FplacesSpatialAlignment.canCalibrate(true)).toBe(true);
  });
  it('requests heading no older than 1500ms and hides when that evidence becomes stale', () => {
    const { c, tick } = setup(); const button = { hidden: true }; c.document = { getElementById: () => button };
    c.FplacesSpatialAlignment.observe('NORMAL'); tick(); c.FplacesSpatialAlignment.invalidate('World frame changed.');
    expect(button.hidden).toBe(false);
    const raw = vi.fn((maxAge: number) => maxAge <= 1500 ? null : 0); c.FplacesOrientationCompass.getRawCompassHeading = raw;
    c.FplacesSpatialAlignment.syncButton(); expect(raw).toHaveBeenCalledWith(1500); expect(button.hidden).toBe(true);
  });
  it('binds a reused hidden button once and removes legacy inline hiding only when recovery is eligible', () => {
    const { c, tick, build, trail } = setup(); build();
    const handlers: Array<() => void> = [];
    const button = { hidden: true, style: { display: 'none', visibility: 'hidden', opacity: '0' },
      addEventListener: (_: string, fn: () => void) => handlers.push(fn) };
    c.document = { getElementById: () => button };
    c.FplacesArCalibrationUi.inject(); c.FplacesArCalibrationUi.inject(); expect(handlers).toHaveLength(1);
    c.FplacesSpatialAlignment.observe('NORMAL'); tick(); c.FplacesSpatialAlignment.invalidate('World frame changed.');
    expect(button.hidden).toBe(false); expect(button.style.display).toBe('');
    handlers[0](); expect(trail()).toBeTruthy(); expect(button.hidden).toBe(true);
  });
  it('does not offer recovery after arrival, at intentional trail clearing, or while AR is parked', () => {
    const { c, nav, tick } = setup(); const button = { hidden: true }; c.document = { getElementById: () => button };
    c.FplacesSpatialAlignment.observe('NORMAL'); tick(); c.FplacesSpatialAlignment.invalidate('World frame changed.');
    nav.arrived = true; c.FplacesSpatialAlignment.syncButton(); expect(button.hidden).toBe(true);
    nav.arrived = false; c.__fplacesLiveViewParked = true; c.FplacesSpatialAlignment.syncButton(); expect(button.hidden).toBe(true);
    c.__fplacesLiveViewParked = false; c.FplacesAnchorEngine.calibrate(geo(0, 0)); c.FplacesSpatialAlignment.calibrated();
    nav.distanceRemainingToDestinationMeters = () => 1;
    c.FplacesSpatialAlignment.observeArrowVisibility(false, 1000); tick(); tick(); c.FplacesSpatialAlignment.observeArrowVisibility(false, 2000);
    expect(button.hidden).toBe(true);
  });
  it('does not rebuild geometry, reset the anchor, or re-anchor during routine stable refreshes', () => {
    const { c, build, tick, trail, camera } = setup(); c.FplacesSpatialAlignment.observe('NORMAL'); build();
    const group = trail(), arrows = [...group.children], revision = c.FplacesAnchorEngine.instance.revision;
    const positions = arrows.map(a => ({ x: a.position.x, y: a.position.y, z: a.position.z, yaw: a.rotation.y }));
    const create = vi.spyOn(c.FplacesFloorArrows, 'createTrailSegment');
    for (let i = 0; i < 12; i++) {
      camera.position.x = Math.sin(i) * .05;
      tick(); c.FplacesSpatialAlignment.observe('NORMAL'); c.FplacesWorldRoute.update({ navigator: c.__fplacesNavigator });
    }
    expect(trail()).toBe(group); expect(group.children).toEqual(arrows); expect(create).not.toHaveBeenCalled();
    expect(arrows.map(a => ({ x: a.position.x, y: a.position.y, z: a.position.z, yaw: a.rotation.y }))).toEqual(positions);
    expect(c.FplacesAnchorEngine.instance.revision).toBe(revision);
  });
  it('invalidates a lost world once and never treats repeated loss notifications as new anchor frames', () => {
    const { c } = setup(); c.FplacesSpatialAlignment.invalidate('Camera paused.');
    const revision = c.FplacesAnchorEngine.instance.revision;
    c.FplacesSpatialAlignment.invalidate('Camera paused.'); c.FplacesSpatialAlignment.invalidate('Camera resumed.');
    expect(c.FplacesAnchorEngine.instance.revision).toBe(revision);
  });
});

describe('source-branch automatic calibration safeguards', () => {
  function bootstrap() {
    const h = setup(), { c, nav } = h;
    c.FplacesRouteNavigator = function () { return nav; };
    c.FPLACES_AR_CONFIG.xrMode = 'fallback'; c.FPLACES_AR_CONFIG.autoCalibrate = true;
    c.FplacesRouteBridge = { onRoute: vi.fn() };
    c.setTimeout = vi.fn(); c.setInterval = vi.fn(); c.addEventListener = vi.fn();
    c.document = { addEventListener: vi.fn(), getElementById: () => null };
    vm.runInContext(readFileSync(new URL('../../../ar-nav/js/bootstrap.js', import.meta.url), 'utf8'), c);
    c.FplacesSpatialAlignment.observe('NORMAL');
    return h;
  }
  it('does not recalibrate a valid anchor when arrows are temporarily missing or offscreen', () => {
    const { c, build } = bootstrap(); build(); const revision = c.FplacesAnchorEngine.instance.revision;
    const calibrate = vi.spyOn(c, 'executeDemoCalibrationFlow');
    c.FplacesPathGeometry.hasRibbon = () => false;
    for (let i = 0; i < 20; i++) c.__fplacesTryAutoCalibrate('retry');
    expect(calibrate).not.toHaveBeenCalled(); expect(c.FplacesAnchorEngine.instance.revision).toBe(revision);
  });
  it('reports a failed initial calibration and never auto-recovers a manually invalidated world', () => {
    const { c } = bootstrap(); c.FplacesAnchorEngine.reset();
    c.executeDemoCalibrationFlow = vi.fn(() => false);
    expect(c.__fplacesTryAutoCalibrate('initial')).toBe(false);
    expect(c.executeDemoCalibrationFlow).toHaveBeenCalledOnce();
    c.FplacesSpatialAlignment.invalidate('World frame changed.'); c.FplacesSpatialAlignment.observe('NORMAL');
    expect(c.__fplacesTryAutoCalibrate('after-reset')).toBe(false);
    expect(c.executeDemoCalibrationFlow).toHaveBeenCalledOnce();
  });
});
