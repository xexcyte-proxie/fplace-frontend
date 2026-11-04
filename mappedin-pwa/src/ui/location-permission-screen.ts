import type { AppState } from '../types';
import { renderBusyLabel } from './content-loading-overlay';
import { locationHelpSteps, locationServicesHelpSteps } from '../location/domain/location-help';

type DialogState = Pick<AppState, 'locationGateLoading'> & Partial<Pick<AppState, 'locationFailure' | 'locationPermission'>>;
function help(label: string): string {
  return `<details class="location-help"><summary class="location-dialog-primary">${label}</summary><ol class="location-dialog-help">${locationHelpSteps().map(step => `<li>${step}</li>`).join('')}</ol></details>`;
}
function dialog(state: DialogState, id: string, title: string, description: string, action: string, dismissLabel = 'Not Now', dismissClass = 'location-dialog-secondary'): string {
  return `<div class="location-dialog-backdrop" id="location-gate-dismiss" role="presentation">
    <div class="location-dialog" role="dialog" aria-modal="true" aria-labelledby="${id}-title" aria-describedby="${id}-desc" aria-busy="${state.locationGateLoading}">
      <div class="location-dialog-icon" aria-hidden="true"><img src="/location/location-services.svg" width="240" height="96" alt="" draggable="false" /></div>
      <h2 id="${id}-title" class="location-dialog-title">${title}</h2>
      <p id="${id}-desc" class="location-dialog-body">${description}</p>
      ${action}
      <button type="button" id="location-dismiss-btn" class="${dismissClass}">${dismissLabel}</button>
    </div></div>`;
}
function requestButton(state: DialogState, id: string, label: string): string {
  return `<button type="button" id="${id}" class="location-dialog-primary ${state.locationGateLoading ? 'is-loading' : ''}" ${state.locationGateLoading ? 'disabled' : ''}>${state.locationGateLoading ? renderBusyLabel('Getting location…') : label}</button>`;
}
export function renderLocationPermissionScreen(state: DialogState): string {
  return dialog(state, 'location-dialog', 'Allow Location Access',
    'fplaces uses your location to show where you are and guide you to your destination.',
    requestButton(state, 'location-enable-btn', 'Allow Location'));
}
const deviceLocationDescription = 'Enabling Location Services can enhance your navigation experience. To re-enable this feature, please adjust the relevant settings on your device.';

function deviceLocationDialog(state: DialogState, id: string): string {
  const labels = ['Device', 'Browser', 'Finish'];
  const instructions = `<ol class="location-dialog-help">${locationServicesHelpSteps().map((step, index) => `<li><strong>${labels[index]}:</strong> ${step}</li>`).join('')}</ol>`;
  return dialog(state, id, 'Location Services', deviceLocationDescription, instructions, 'CLOSE', 'location-dialog-primary');
}

export function renderLocationPermissionRequiredScreen(state: DialogState & Pick<AppState, 'locationPermanentlyDenied'>): string {
  return deviceLocationDialog(state, 'location-required');
}
export function renderLocationErrorScreen(state: DialogState & Pick<AppState, 'locationGateError'>): string {
  const message = state.locationGateError ?? '';
  const unsupported = state.locationFailure === 'unsupported' || /not supported|secure|https/i.test(message);
  const timeout = state.locationFailure === 'timeout' || /timed out|timeout/i.test(message);
  const restricted = state.locationFailure === 'restricted';
  const deviceRecovery = !unsupported && !timeout && state.locationPermission === 'granted';
  if (deviceRecovery) return deviceLocationDialog(state, 'location-error');
  return dialog(state, 'location-error', unsupported || restricted ? 'Location Unavailable' : "We Couldn't Find Your Location",
    unsupported ? 'Live location requires a supported browser and a secure (HTTPS) connection. You can still browse the map and choose places manually.' : restricted ? "fplaces can't access your current location. Check that location services are turned on and that your browser is allowed to use your location." : timeout
      ? 'Finding your position took too long. Try moving to an area with a clearer signal, then try again.'
      : "fplaces couldn't determine your current position. Try moving to an area with a clearer signal, then try again.",
    (unsupported ? '' : requestButton(state, 'location-retry-btn', 'Try Again')) + help('How to Fix This'));
}
