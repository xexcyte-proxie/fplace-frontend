import type { FplacesPositionFrame } from '../types';
import type { ParsedBeaconAdvert } from './bleBeaconParser';
import { beaconKey } from './bleBeaconParser';
import { bearingDegrees } from './heading';

export interface BeaconMatrixEntry {
  uuid: string;
  major?: number;
  minor?: number;
  latitude: number;
  longitude: number;
  floorId?: string;
  label?: string;
}

export interface BeaconVenueMatrix {
  venueMapId: string;
  beacons: BeaconMatrixEntry[];
}

export interface BeaconReading extends ParsedBeaconAdvert {
  key: string;
}

export function toReading(advert: ParsedBeaconAdvert): BeaconReading {
  return {
    ...advert,
    key: beaconKey(advert.uuid, advert.major, advert.minor),
  };
}

function matchesMatrixEntry(reading: BeaconReading, entry: BeaconMatrixEntry): boolean {
  if (reading.uuid.toUpperCase() !== entry.uuid.toUpperCase()) return false;
  if (entry.major != null && reading.major != null && entry.major !== reading.major) return false;
  if (entry.minor != null && reading.minor != null && entry.minor !== reading.minor) return false;
  return true;
}

export function selectNearestBeacon(
  readings: Iterable<BeaconReading>,
  matrix: BeaconVenueMatrix,
  rssiThresholdDbm: number,
): { entry: BeaconMatrixEntry; reading: BeaconReading } | null {
  let best: { entry: BeaconMatrixEntry; reading: BeaconReading } | null = null;

  for (const reading of readings) {
    if (reading.rssi < rssiThresholdDbm) continue;

    for (const entry of matrix.beacons) {
      if (!matchesMatrixEntry(reading, entry)) continue;
      if (!best || reading.rssi > best.reading.rssi) {
        best = { entry, reading };
      }
    }
  }

  return best;
}

export function snapToBeaconFrame(
  match: { entry: BeaconMatrixEntry; reading: BeaconReading },
  previousSnap?: Pick<FplacesPositionFrame, 'latitude' | 'longitude'> | null,
): FplacesPositionFrame {
  const { entry, reading } = match;
  const from = previousSnap ?? entry;
  const heading = bearingDegrees(
    { latitude: from.latitude, longitude: from.longitude },
    { latitude: entry.latitude, longitude: entry.longitude },
  );

  const proximityMeters = Math.max(1, Math.min(12, (-reading.rssi - 30) / 3));

  return {
    latitude: entry.latitude,
    longitude: entry.longitude,
    heading,
    accuracy: proximityMeters,
    source: 'ble_beacon',
    floorId: entry.floorId,
    timestamp: Date.now(),
  };
}
