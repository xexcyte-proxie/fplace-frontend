/**
 * Survives logout so we never re-show marketing onboarding on a known device.
 */
export interface DeviceRecognitionRepository {
  hasUsedApp(): boolean;
  markUsed(): void;
  clear(): void;
}
