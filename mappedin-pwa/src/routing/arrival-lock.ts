/**
 * Once navigation reaches the destination, keep the arrival experience locked
 * until the user confirms (Okay) or clears the route.
 */
export function isArrivalLocked(state: {
  routeSimulationComplete: boolean;
  arrivalDialogOpen: boolean;
}): boolean {
  return state.routeSimulationComplete || state.arrivalDialogOpen;
}
