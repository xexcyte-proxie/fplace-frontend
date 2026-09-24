import { describe, expect, it } from 'vitest';

import { isArrivalLocked } from './arrival-lock';

describe('isArrivalLocked', () => {
  it('locks when the route simulation completed', () => {
    expect(
      isArrivalLocked({
        routeSimulationComplete: true,
        arrivalDialogOpen: false,
      }),
    ).toBe(true);
  });

  it('locks while the arrival dialog is open', () => {
    expect(
      isArrivalLocked({
        routeSimulationComplete: false,
        arrivalDialogOpen: true,
      }),
    ).toBe(true);
  });

  it('does not lock before arrival', () => {
    expect(
      isArrivalLocked({
        routeSimulationComplete: false,
        arrivalDialogOpen: false,
      }),
    ).toBe(false);
  });
});
