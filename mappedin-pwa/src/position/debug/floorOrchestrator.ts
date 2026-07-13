export interface FloorOrchestratorState {
  committedFloorId: string | null;
  candidateFloorId: string | null;
  framesHeld: number;
  framesRequired: number;
  progressPct: number;
}

export interface FloorProposeResult extends FloorOrchestratorState {
  committedChanged: boolean;
}

export interface FloorProposeContext {
  /** User heading in degrees (0 = north). */
  headingDegrees?: number;
  /** Bearing toward next route point. */
  routeBearingDegrees?: number;
  /** Distance to next floor transition along path (meters). */
  distanceToTransitionM?: number;
  /** Kind of upcoming vertical connector. */
  transitionKind?: 'elevator' | 'stairs' | 'escalator' | 'ramp' | 'doorway' | 'connection' | 'unknown';
  /** Position source confidence 0–1. */
  confidence?: number;
}

const FRAMES_REQUIRED = 12;
const HYSTERESIS_MS = 1_200;
const FAST_FRAMES = 4;
const FAST_HYSTERESIS_MS = 400;

export class FloorOrchestrator {
  private committedFloorId: string | null = null;
  private candidateFloorId: string | null = null;
  private framesHeld = 0;
  private candidateHeldSince: number | null = null;

  propose(
    floorId: string | null | undefined,
    context: FloorProposeContext = {},
  ): FloorProposeResult {
    if (!floorId) {
      return this.getResult(false);
    }

    const now = performance.now();

    if (floorId === this.candidateFloorId) {
      this.framesHeld += 1;
    } else {
      this.candidateFloorId = floorId;
      this.framesHeld = 1;
      this.candidateHeldSince = now;
    }

    const elapsedMs =
      this.candidateHeldSince != null ? now - this.candidateHeldSince : 0;

    const fastTrack = this.shouldFastTrack(context);
    const framesRequired = fastTrack ? FAST_FRAMES : FRAMES_REQUIRED;
    const hysteresisMs = fastTrack ? FAST_HYSTERESIS_MS : HYSTERESIS_MS;

    const framesReady = this.framesHeld >= framesRequired;
    const timeReady = elapsedMs >= hysteresisMs;

    let committedChanged = false;
    if (
      framesReady &&
      timeReady &&
      this.candidateFloorId &&
      this.candidateFloorId !== this.committedFloorId
    ) {
      this.committedFloorId = this.candidateFloorId;
      committedChanged = true;
    }

    return this.getResult(committedChanged, framesRequired);
  }

  private shouldFastTrack(context: FloorProposeContext): boolean {
    const confidence = context.confidence ?? 0.5;
    if (confidence >= 0.85) return true;

    const dist = context.distanceToTransitionM;
    const kind = context.transitionKind;
    if (dist != null && dist <= 8 && kind && kind !== 'unknown') {
      return true;
    }

    const heading = context.headingDegrees;
    const routeBearing = context.routeBearingDegrees;
    if (
      heading != null &&
      routeBearing != null &&
      Math.abs(this.normalizeDelta(heading, routeBearing)) < 35
    ) {
      return confidence >= 0.65;
    }

    return false;
  }

  private normalizeDelta(a: number, b: number): number {
    let delta = a - b;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  forceFloor(floorId: string): void {
    this.committedFloorId = floorId;
    this.candidateFloorId = floorId;
    this.framesHeld = FRAMES_REQUIRED;
    this.candidateHeldSince = performance.now() - HYSTERESIS_MS;
  }

  reset(): void {
    this.committedFloorId = null;
    this.candidateFloorId = null;
    this.framesHeld = 0;
    this.candidateHeldSince = null;
  }

  getState(): FloorOrchestratorState {
    return this.getResult(false);
  }

  private getResult(
    committedChanged: boolean,
    framesRequired = FRAMES_REQUIRED,
  ): FloorProposeResult {
    const elapsedMs =
      this.candidateHeldSince != null
        ? performance.now() - this.candidateHeldSince
        : 0;
    const progressPct = Math.min(
      100,
      Math.round((elapsedMs / HYSTERESIS_MS) * 100),
    );

    return {
      committedFloorId: this.committedFloorId,
      candidateFloorId: this.candidateFloorId,
      framesHeld: this.framesHeld,
      framesRequired,
      progressPct,
      committedChanged,
    };
  }
}
