import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

// Constructor-level doubles keep these tests offline. Set FPLACES_TEST_THREE to
// an exact Three.js 0.160.0 CommonJS build to run the same cases on real meshes.
class Vector {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number) { Object.assign(this, { x, y, z }); return this; }
  copy(v: Vector) { return this.set(v.x, v.y, v.z); }
  setScalar(n: number) { return this.set(n, n, n); }
}
class Group {
  children: any[] = []; userData: any = {}; name = ''; visible = true;
  position = new Vector(); scale = new Vector(1, 1, 1); rotation = { x: 0, y: 0, z: 0 };
  add(...objects: any[]) { this.children.push(...objects); }
  remove(object: any) { this.children = this.children.filter((c) => c !== object); }
  traverse(fn: (obj: any) => void) { fn(this); this.children.forEach((c) => c.traverse(fn)); }
  getObjectByName(name: string): any { return this.name === name ? this : this.children.map((c) => c.getObjectByName(name)).find(Boolean); }
}
class Shape {
  points: Array<{ x: number; y: number }> = [];
  moveTo(x: number, y: number) { this.points.push({ x, y }); }
  lineTo(x: number, y: number) { this.points.push({ x, y }); }
  closePath() {}
}
class Geometry {
  parameters: any; rotation = 0; attributes: any = {}; disposed = false;
  constructor(shape?: Shape, options?: any) { this.parameters = { shapes: shape, options }; }
  rotateX(r: number) { this.rotation = r; }
  getAttribute() { return { count: 3, getY: (i: number) => i === 0 ? 1 : 0 }; }
  setAttribute(key: string, value: any) { this.attributes[key] = value; }
  clearGroups() {}
  dispose() { this.disposed = true; }
}
class Material {
  disposed = false; opacity = 1;
  constructor(options: any) { Object.assign(this, options); }
  dispose() { this.disposed = true; }
}
class Mesh extends Group {
  isMesh = true;
  constructor(public geometry: any, public material: any) { super(); }
}
class Color {
  constructor(public value: number) {}
  toArray(a: Float32Array, i: number) { a[i] = this.value; }
}
const doubles = {
  Group, Mesh, Shape, Vector3: Vector, Color,
  BufferAttribute: class { constructor(public array: any, public itemSize: number) {} },
  ExtrudeGeometry: Geometry, SphereGeometry: Geometry, CylinderGeometry: Geometry, RingGeometry: Geometry,
  MeshBasicMaterial: Material, FrontSide: 0, DoubleSide: 2,
};
const require = createRequire(import.meta.url);
export const THREE = process.env.FPLACES_TEST_THREE ? require(process.env.FPLACES_TEST_THREE) : doubles;
export function runtime(overrides: Record<string, number> = {}) {
  let time = 1000;
  const context: any = { THREE, performance: { now: () => time }, URLSearchParams, location: { search: '' }, isSecureContext: true };
  context.window = context;
  vm.createContext(context);
  for (const file of ['config.js', 'js/ar-quaternion-alignment.js', 'js/incremental-path-spawn.js', 'js/world-floor-arrows.js', 'js/incremental-ar-path.js']) {
    vm.runInContext(readFileSync(new URL(`../../ar-nav/${file}`, import.meta.url), 'utf8'), context);
  }
  Object.assign(context.FPLACES_AR_CONFIG, overrides);
  return { c: context, tick: () => { time += 500; context.FplacesIncrementalPath.updateVisuals(time); } };
}
