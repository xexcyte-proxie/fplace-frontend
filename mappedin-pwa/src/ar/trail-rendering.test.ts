import { describe, expect, it } from 'vitest';
import { THREE, runtime } from '../../test-support/ar-runtime';

const pt = (x: number, z: number) => ({ x, y: 0.04, z });
const straight = [pt(0, 0), pt(0, -40)];
const forward = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

 describe('trail geometry and lifecycle', () => {
  it('builds one shared shallow mesh per arrow, with a -Z tip', () => {
    const { c } = runtime();
    const a = c.FplacesFloorArrows.createTrailSegment(THREE, { ...pt(0, -2), rotationY: 0 }, .95, 1);
    const b = c.FplacesFloorArrows.createTrailSegment(THREE, pt(0, -4), .95, 1);
    expect(a.children).toHaveLength(1);
    const mesh = a.children[0];
    expect(mesh.geometry).toBe(b.children[0].geometry);
    expect(mesh.material).not.toBe(b.children[0].material);
    expect(mesh.material.opacity).toBe(.95);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.geometry.parameters.options.depth).toBe(.018);
    expect(mesh.geometry.parameters.options.bevelEnabled).toBe(false);
    if (mesh.geometry.computeBoundingBox) {
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      expect(box.max.x - box.min.x).toBeCloseTo(.75);
      expect(box.max.z - box.min.z).toBeCloseTo(.6);
      expect(box.min.z).toBeCloseTo(-.6);
      expect(box.max.y - box.min.y).toBeCloseTo(.018);
    } else {
      const points = mesh.geometry.parameters.shapes.points;
      expect(Math.max(...points.map((p: any) => p.x)) - Math.min(...points.map((p: any) => p.x))).toBe(.75);
      expect(Math.max(...points.map((p: any) => p.y))).toBe(.6);
      expect(mesh.geometry.rotation).toBe(-Math.PI / 2);
    }
  });

  it.each([6, 8])('retains slots and disposes resources with a %i-arrow cap', count => {
    const { c, tick } = runtime({ incrementalPathMaxVisible: count, nearFieldMaxArrows: count });
    const scene = new THREE.Group();
    const route = JSON.stringify(straight);
    const nav = { _displayAlongPathM: 123 };
    c.__fplacesNavigator = nav;
    const extend = (z: number) => c.FplacesIncrementalPath.extend(THREE, scene, straight, { cameraX: 0, cameraZ: z, alongPathM: -z });
    const trail = extend(0);
    expect(trail.children).toHaveLength(count);
    expect(trail.children.map((m: any) => m.scale.x)).toEqual(Array(count).fill(1.3));
    const first = trail.children[0];
    const retained = trail.children[1];
    let disposed = false;
    const mat = first.children[0].material;
    const originalDispose = mat.dispose.bind(mat);
    mat.dispose = () => { disposed = true; originalDispose(); };
    tick();
    expect(retained.children[0].material.opacity).toBeCloseTo(.95);
    extend(-2.1);
    expect(trail.children).toContain(first); // Membership waits for a stable sample.
    tick();
    extend(-2.1);
    expect(trail.children).not.toContain(first);
    expect(trail.children).toContain(retained);
    expect(disposed).toBe(true);
    expect(retained.scale.x).toBe(1.3);
    expect(JSON.stringify(straight)).toBe(route);
    expect(nav._displayAlongPathM).toBe(123);
    let cleanup = 0;
    trail.children.forEach((m: any) => { m.children[0].material.dispose = () => cleanup++; });
    c.FplacesIncrementalPath.dispose(scene);
    expect(cleanup).toBe(count);
    expect(scene.children).toHaveLength(0);
  });

  it('fades near/behind the camera without moving or destroying slots', () => {
    const { c, tick } = runtime();
    const scene = new THREE.Group();
    const camera = { worldToLocal: (v: Vector) => { v.z += 1.5; return v; } };
    const trail = c.FplacesIncrementalPath.extend(THREE, scene, straight, { cameraX: 0, cameraZ: 0, camera });
    const first = trail.children[0];
    tick();
    expect(first.visible).toBe(false);
    expect(first.position.z).toBe(-2);
    camera.worldToLocal = (v: Vector) => { v.z += .9; return v; };
    tick();
    expect(first.visible).toBe(true);
    expect(first.children[0].material.opacity).toBeCloseTo(.475);
    expect(trail.children[0]).toBe(first);
    camera.worldToLocal = (v: Vector) => { v.z = -v.z; return v; };
    tick();
    expect(trail.children.every((m: any) => !m.visible)).toBe(true);
  });

  it('clears trail and disposes destination-owned geometry at the end', () => {
    const { c } = runtime();
    const scene = new THREE.Group();
    const trail = c.FplacesIncrementalPath.extend(THREE, scene, straight, { cameraX: 0, cameraZ: -39 });
    expect(trail.children).toHaveLength(0);
    const dest = scene.getObjectByName(c.FplacesIncrementalPath.DESTINATION_GROUP_NAME);
    let disposed = 0;
    dest.children.forEach((m: any) => { m.geometry.dispose = () => disposed++; });
    c.FplacesIncrementalPath.dispose(scene);
    expect(disposed).toBe(4);
  });
});

describe('visual tangent sampling', () => {
  function sample(points: any[], marks: number[]) {
    const { c } = runtime();
    return c.FplacesIncrementalPath.placementsAtMarks(points, marks, .04);
  }
  it('keeps straight arrows on the route including endpoints and repeated points', () => {
    const points = [pt(0, 0), pt(0, 0), pt(0, -5), pt(0, -5)];
    const copy = JSON.stringify(points);
    const samples = sample(points, [0, 2, 5]);
    expect(samples.map((p: any) => p.z)).toEqual([0, -2, -5]);
    samples.forEach((p: any) => expect(forward(p.rotationY).z).toBeCloseTo(-1));
    expect(JSON.stringify(points)).toBe(copy);
    expect(sample([pt(0, 0), pt(0, 0)], [0])).toEqual([]);
  });
  it('blends a gentle bend while leaving the placement on the original polyline', () => {
    const angle = Math.PI / 6;
    const [p] = sample([pt(0, 0), pt(0, -4), pt(4 * Math.sin(angle), -4 - 4 * Math.cos(angle))], [4]);
    expect(p.x).toBe(0);
    expect(p.z).toBe(-4);
    expect(forward(p.rotationY).x).toBeCloseTo(Math.sin(angle / 2));
  });
  it.each([90, 150, 180])('does not cut a %s degree corner', (degrees) => {
    const angle = degrees * Math.PI / 180;
    const samples = sample([pt(0, 0), pt(0, -4), pt(4 * Math.sin(angle), -4 - 4 * Math.cos(angle))], [3.8, 4, 4.2]);
    expect(forward(samples[0].rotationY).x).toBeCloseTo(0);
    expect(forward(samples[1].rotationY).x).toBeCloseTo(Math.sin(angle));
    expect(forward(samples[2].rotationY).z).toBeCloseTo(-Math.cos(angle));
    samples.forEach((p: any) => expect(Number.isFinite(p.rotationY)).toBe(true));
  });
  it('respects the existing configurable yaw offset', () => {
    const { c } = runtime({ arrowHeadingOffsetRad: 0 });
    const [p] = c.FplacesIncrementalPath.placementsAtMarks(straight, [2], .04);
    expect(p.rotationY).toBeCloseTo(Math.PI);
  });
});

describe('requested chevron dimensions', () => {
  it('renders 0.975 m width and 0.78 m length without changing thickness or spacing', () => {
    const { c } = runtime(); const scene = new THREE.Group();
    const trail = c.FplacesIncrementalPath.extend(THREE, scene, straight, { cameraX: 0, cameraZ: 0, alongPathM: 0 });
    const arrow = trail.children[0]; const geometry = arrow.children[0].geometry;
    let width = c.FPLACES_AR_CONFIG.trailArrowWidthM, length = c.FPLACES_AR_CONFIG.trailArrowLengthM;
    let depth = geometry.parameters.options.depth;
    if (geometry.computeBoundingBox) {
      geometry.computeBoundingBox(); const box = geometry.boundingBox;
      width = box.max.x - box.min.x; length = box.max.z - box.min.z; depth = box.max.y - box.min.y;
    }
    expect(width * arrow.scale.x).toBeCloseTo(.975, 6);
    expect(length * arrow.scale.z).toBeCloseTo(.78, 6);
    expect(depth * arrow.scale.y).toBeCloseTo(.018 * 1.12, 6);
    expect(trail.children[1].userData.alongM - arrow.userData.alongM).toBe(2);
  });
});
