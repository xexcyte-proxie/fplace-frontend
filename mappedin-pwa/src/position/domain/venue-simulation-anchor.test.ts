import { describe, expect, it } from 'vitest';
import { resolveVenueSimulationAnchor } from './venue-simulation-anchor';
function object(id: string, floorId = 'ground', longitude = 3, extra = {}) {
  return { id, name: id, floor: { id: floorId }, center: { latitude: 6, longitude, floorId }, ...extra };
}
const data = (objects: Record<string, object[]>) => ({
  getByType: (type: string) => objects[type] ?? [], getById: () => null,
}) as any;
describe('route-independent simulation map anchor', () => {
  it('uses the selected mapped section on the opening floor', () => {
    const space = object('section-space');
    const map = data({ space: [object('other'), space], door: [object('entrance', 'ground', 4, { isExterior: true })],
      'location-profile': [{ id: 'section', name: 'Selected section', spaces: [space] }] });
    expect(resolveVenueSimulationAnchor(map, 'ground', 'section')).toMatchObject({
      coordinate: { latitude: 6, longitude: 3, floorId: 'ground' }, source: 'selected-section', objectId: 'section-space',
    });
  });
  it('prefers an actual exterior entrance and chooses deterministically', () => {
    const map = data({ space: [object('space')], door: [object('z', 'ground', 4, { isExterior: true }),
      object('a', 'ground', 5, { isExterior: true }), object('interior', 'ground', 6)] });
    expect(resolveVenueSimulationAnchor(map, 'ground')).toMatchObject({ source: 'exterior-entrance', objectId: 'a', coordinate: { longitude: 5 } });
  });
  it('falls back to a real mapped space on the opening floor, never an off-floor entrance', () => {
    const map = data({ space: [object('upstairs', 'upper'), object('ground')],
      door: [object('entrance', 'upper', 4, { isExterior: true })] });
    expect(resolveVenueSimulationAnchor(map, 'ground')).toMatchObject({ source: 'mapped-space', objectId: 'ground' });
  });
  it('reads SDK prototype getters', () => {
    const space = Object.create({ get center() { return { latitude: 6, longitude: 3 }; }, get floor() { return { id: 'ground' }; } });
    space.id = 'sdk'; space.name = 'SDK space';
    expect(resolveVenueSimulationAnchor(data({ space: [space] }), 'ground')?.coordinate).toMatchObject({ latitude: 6, longitude: 3, floorId: 'ground' });
  });
  it('withholds an anchor for absent, invalid or mismatched geometry', () => {
    expect(resolveVenueSimulationAnchor(data({}), 'ground')).toBeNull();
    expect(resolveVenueSimulationAnchor(data({ space: [object('bad', 'ground', 190), object('upstairs', 'upper')] }), 'ground')).toBeNull();
  });
});
