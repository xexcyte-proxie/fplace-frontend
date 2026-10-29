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
    const alignButton = { addEventListener: vi.fn(), style: {} };
    c.document = { getElementById: () => alignButton };
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
  it('accepts the engine tracking event with status on the event itself', () => {
    const { c, module } = pipeline();
    const tracking = module.listeners.find((l: any) => l.event === 'reality.trackingstatus');
    tracking.process({ status: 'NORMAL', reason: 'UNDEFINED' });
    expect(c.FplacesSpatialAlignment.status).toBe('NORMAL');
    expect(c.FplacesSpatialAlignment.canCalibrate(false)).toBe(true);
  });
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
  it('does not flash the status overlay for repeated automatic attempts before tracking is ready', () => {
    const { c } = setup();
    for (let i = 0; i < 20; i++) expect(c.executeDemoCalibrationFlow()).toBe(false);
    expect(c.FplacesLiveViewHud.setStatus).not.toHaveBeenCalled();
    expect(c.executeDemoCalibrationFlow({ manual: true })).toBe(false);
    expect(c.FplacesLiveViewHud.setStatus).toHaveBeenCalledOnce();
  });
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
  it('restores a hidden existing button after abrupt tracking loss and binds it only once', () => {
    const { c, build, trail } = setup();
    const handlers: Array<() => void> = [];
    const button = { hidden: true, style: { display: 'none', visibility: 'hidden', opacity: '0' },
      addEventListener: (_event: string, fn: () => void) => handlers.push(fn) };
    c.document = { getElementById: () => button, body: { appendChild: vi.fn() } };
    c.FplacesArCalibrationUi.inject(); c.FplacesArCalibrationUi.inject();
    expect(handlers).toHaveLength(1);
    c.FplacesSpatialAlignment.observe('NORMAL'); build();
    button.style.display = 'none'; button.hidden = true;
    c.FplacesSpatialAlignment.observe('LIMITED');
    expect(trail()).toBeUndefined();
    expect(button.hidden).toBe(false); expect(button.style.display).toBe('');
    c.FplacesSpatialAlignment.observe('NORMAL'); handlers[0]();
    expect(trail()).toBeTruthy(); expect(button.hidden).toBe(true);
  });
  it('hides at launch, shows after sustained arrow disappearance, and hides when arrows return', () => {
    const { c, build } = setup();
    const button = { hidden: false }; c.document = { getElementById: () => button };
    c.FplacesSpatialAlignment.syncButton(); expect(button.hidden).toBe(true);
    c.FplacesSpatialAlignment.observe('NORMAL'); build();
    const revision = c.FplacesAnchorEngine.instance.revision;
    c.FplacesSpatialAlignment.observeArrowVisibility(false, 1000);
    c.FplacesSpatialAlignment.observeArrowVisibility(false, 1500);
    expect(button.hidden).toBe(true);
    c.FplacesSpatialAlignment.observeArrowVisibility(false, 1800);
    expect(button.hidden).toBe(false);
    c.FplacesSpatialAlignment.observeArrowVisibility(true, 2000);
    expect(button.hidden).toBe(true);
    expect(c.FplacesAnchorEngine.instance.revision).toBe(revision);
  });
  it('remains available after tracking invalidation until successful one-tap alignment', () => {
    const { c, build, trail } = setup();
    const button = { hidden: true }; c.document = { getElementById: () => button };
    c.FplacesSpatialAlignment.observe('NORMAL'); build();
    c.FplacesSpatialAlignment.observe('LIMITED');
    expect(button.hidden).toBe(false); expect(trail()).toBeUndefined();
    expect(c.executeDemoCalibrationFlow({ manual: true })).toBe(false);
    expect(button.hidden).toBe(false);
    c.FplacesSpatialAlignment.observe('NORMAL'); expect(button.hidden).toBe(false);
    expect(c.executeDemoCalibrationFlow({ manual: true })).toBe(true);
    expect(trail()).toBeTruthy(); expect(button.hidden).toBe(true);
  });
  it('shows a late-created control when recalibration was already required', () => {
    const { c } = setup(); c.FplacesSpatialAlignment.invalidate('World frame changed.');
    let button: any = null;
    c.document = { getElementById: () => button,
      createElement: () => ({ addEventListener: vi.fn() }), body: { appendChild: (node: any) => { button = node; } } };
    c.FplacesArCalibrationUi.inject(); expect(button.hidden).toBe(false);
  });
});
