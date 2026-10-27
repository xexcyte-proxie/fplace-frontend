import { describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState } from '../types';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));

describe('first-visit venue switching', () => {
  it('loads the new venue and remains on first-visit home', async () => {
    const state = { ...initialAppState(), selectedVenueId: '1' };
    const venue = { id: 2, name: 'New venue', location: 'Lagos' };
    const app = Object.create(MapApp.prototype) as any;
    Object.assign(app, {
      store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) },
      resolveVenueSelection: () => ({ forumVenue: venue }),
      showToast: vi.fn(),
      beginBackgroundVenueMapSwitch: vi.fn(async () => {
        state.selectedVenueId = '2';
      }),
      loadOnboardingSections: vi.fn(async () => { state.selectedGateId = '20'; }),
      enterSelectedVenue: vi.fn(async () => { state.mapStatus = 'ready'; }),
    });
    app.selectFirstVisitVenue('2');
    await vi.waitFor(() => expect(app.venueEnterInFlight).toBe(false));
    expect(app.beginBackgroundVenueMapSwitch).toHaveBeenCalledWith(venue);
    expect(app.loadOnboardingSections).toHaveBeenCalledWith('2');
    expect(app.enterSelectedVenue).toHaveBeenCalledWith(expect.objectContaining({
      homeExperience: 'first-visit', landOn: 'home', skipLocationGate: true,
    }));
    expect(state.activeTab).toBe('home');
    expect(state.navigateView).toBe('home');
  });

  it('does nothing when the current venue is selected again', () => {
    const app = Object.create(MapApp.prototype) as any;
    app.store = { get: () => ({ selectedVenueId: '1' }) };
    app.openHomeVenue = vi.fn();
    app.selectFirstVisitVenue('1');
    expect(app.openHomeVenue).not.toHaveBeenCalled();
  });
});
