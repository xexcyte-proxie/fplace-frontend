/**
 * Session façade — MapApp uses this to recognize returning users across reloads.
 */
import type {
  ReturningSessionSnapshot,
  StartupDestination,
} from '../session/domain/entities';
import {
  isReturningSession,
  resolveStartupDestination,
} from '../session/domain/entities';
import { returningSessionRepository } from '../session/data/returning-session-repository-impl';
import { deviceRecognitionRepository } from '../session/data/device-recognition-repository-impl';

export type { ReturningSessionSnapshot, StartupDestination };
export { isReturningSession, resolveStartupDestination };

export function loadReturningSession(): ReturningSessionSnapshot | null {
  return returningSessionRepository.load();
}

export function saveReturningSession(
  snapshot: ReturningSessionSnapshot,
): void {
  returningSessionRepository.save(snapshot);
}

export function clearReturningSession(): void {
  returningSessionRepository.clear();
}

export function hasDeviceUsedApp(): boolean {
  return deviceRecognitionRepository.hasUsedApp();
}

/** Mark this browser as past first-run marketing (survives logout). */
export function markDeviceHasUsedApp(): void {
  deviceRecognitionRepository.markUsed();
}

export function clearDeviceHasUsedApp(): void {
  deviceRecognitionRepository.clear();
}
