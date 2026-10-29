import { describe, expect, it } from 'vitest';
import { VenueGpsReference } from './venue-gps-reference';
import { geoToLocalMeters } from '../../utils/geo-math';

describe('temporary venue GPS reference', () => {
  const physical = { latitude: 6.615911, longitude: 3.355013 };
  const start = { latitude: 43.463393, longitude: -80.523515 };
  it('reads browser coordinates exposed as prototype getters', () => {
    const reference = new VenueGpsReference();
    const coords = Object.create({ get latitude() { return 6; }, get longitude() { return 3; } });
    reference.capture(coords);
    reference.anchor(start);
    expect(reference.translate({ latitude: 6, longitude: 3 })).toEqual(start);
  });
  it('waits for a map-space reference, then preserves movement in meters', () => {
    const reference = new VenueGpsReference();
    reference.capture(physical);
    expect(reference.translate(physical)).toBeNull();
    reference.anchor(start);
    expect(reference.translate(physical)).toEqual(start);
    const moved = { latitude: physical.latitude + 0.0001, longitude: physical.longitude + 0.0001, heading: 45, floorId: 'ground' };
    const translated = reference.translate(moved)!;
    const before = geoToLocalMeters(physical, moved);
    const after = geoToLocalMeters(start, translated);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.z).toBeCloseTo(before.z, 6);
    expect(translated.heading).toBe(45);
    expect(translated.floorId).toBe('ground');
    expect(moved.latitude).toBe(physical.latitude + 0.0001);
  });
  it('does not recenter on GPS updates or reroutes; a new session captures afresh', () => {
    const reference = new VenueGpsReference();
    reference.capture(physical);
    reference.anchor(start);
    reference.capture({ latitude: 0, longitude: 0 });
    reference.anchor({ latitude: 0, longitude: 0 });
    expect(reference.translate(physical)).toEqual(start);
    const reopened = new VenueGpsReference();
    reopened.capture({ latitude: 0, longitude: 0 });
    reopened.anchor(start);
    expect(reopened.translate({ latitude: 0, longitude: 0 })).toEqual(start);
  });
  it.each([[0.0001, 0], [-0.0001, 0], [0, 0.0001], [0, -0.0001]])(
    'preserves signed GPS displacement (%s, %s) without changing source coordinates', (lat, lng) => {
      const reference = new VenueGpsReference();
      const originalVenue = Object.freeze({ ...start });
      const originalPhysical = Object.freeze({ ...physical });
      reference.capture(originalPhysical); reference.anchor(originalVenue);
      const moved = Object.freeze({ latitude: physical.latitude + lat, longitude: physical.longitude + lng, accuracy: 5, timestamp: 123 });
      const result = reference.translate(moved)!;
      const physicalDelta = geoToLocalMeters(physical, moved);
      const mapDelta = geoToLocalMeters(start, result);
      expect(mapDelta.x).toBeCloseTo(physicalDelta.x, 6);
      expect(mapDelta.z).toBeCloseTo(physicalDelta.z, 6);
      expect(result.accuracy).toBe(5); expect(result.timestamp).toBe(123);
      expect(originalVenue).toEqual(start); expect(originalPhysical).toEqual(physical);
    },
  );

  it('converts both directions with the same fixed origins', () => {
    const reference = new VenueGpsReference();
    expect(reference.toPhysical(start)).toBeNull();
    reference.capture(physical); reference.anchor(start, { source: 'mapped-space', objectId: 'room' });
    const moved = { latitude: physical.latitude + .0002, longitude: physical.longitude - .0003, accuracy: 5 };
    const translated = reference.translate(moved)!;
    const roundTrip = reference.toPhysical(translated)!;
    expect(roundTrip.latitude).toBeCloseTo(moved.latitude, 10);
    expect(roundTrip.longitude).toBeCloseTo(moved.longitude, 10);
    expect(roundTrip.accuracy).toBe(5);
    expect(reference.toPhysical(start)).toEqual(physical);
    reference.anchor({ latitude: 0, longitude: 0 });
    expect(reference.translate(physical)).toEqual(start);
    expect(reference.diagnosticSnapshot().mapAnchorInfo?.objectId).toBe('room');
  });

});
