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

const FRAMES_REQUIRED = 30;
const HYSTERESIS_MS = 3_000;

export class FloorOrchestrator {
  private committedFloorId: string | null = null;
  private candidateFloorId: string | null = null;
  private framesHeld = 0;
  private candidateHeldSince: number | null = null;

  propose(floorId: string | null | undefined): FloorProposeResult {
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
    const framesReady = this.framesHeld >= FRAMES_REQUIRED;
    const timeReady = elapsedMs >= HYSTERESIS_MS;

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

    return this.getResult(committedChanged);
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

  private getResult(committedChanged: boolean): FloorProposeResult {
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
      framesRequired: FRAMES_REQUIRED,
      progressPct,
      committedChanged,
    };
  }
}
