import { describe, expect, it } from 'vitest';

import {
  isIndoorMapSurface,
  remainingStartupSplashMs,
  resolveStartupDestination,
  resolveStartupShell,
  shouldHideMapCanvas,
  shouldShowMapBootOverlay,
  shouldShowStartupSplash,
} from './entities';

describe('resolveStartupDestination', () => {
  it('routes brand-new devices to marketing', () => {
    expect(
      resolveStartupDestination({
        hasReturningSession: false,
        hasAuthTokens: false,
        deviceHasUsedApp: false,
      }),
    ).toBe('marketing');
  });

  it('routes known devices without a session to sign-in', () => {
    expect(
      resolveStartupDestination({
        hasReturningSession: false,
        hasAuthTokens: false,
        deviceHasUsedApp: true,
      }),
    ).toBe('sign-in');
  });

  it('routes returning sessions and tokens to the app', () => {
    expect(
      resolveStartupDestination({
        hasReturningSession: true,
        hasAuthTokens: false,
        deviceHasUsedApp: true,
      }),
    ).toBe('app');
    expect(
      resolveStartupDestination({
        hasReturningSession: false,
        hasAuthTokens: true,
        deviceHasUsedApp: false,
      }),
    ).toBe('app');
  });
});

describe('startup shell', () => {
  it('keeps the splash until the cold-start destination is known', () => {
    expect(
      resolveStartupShell({
        destinationResolved: false,
        onboardingComplete: false,
      }),
    ).toBe('splash');
    expect(shouldShowStartupSplash(false)).toBe(true);
  });

  it('shows onboarding after splash without waiting for the 3D map', () => {
    expect(
      resolveStartupShell({
        destinationResolved: true,
        onboardingComplete: false,
      }),
    ).toBe('onboarding');
    expect(shouldShowStartupSplash(true)).toBe(false);
  });

  it('holds the splash for the remaining minimum duration', () => {
    expect(remainingStartupSplashMs(1000, 1000)).toBe(2000);
    expect(remainingStartupSplashMs(1000, 2200)).toBe(800);
    expect(remainingStartupSplashMs(1000, 4000)).toBe(0);
    expect(remainingStartupSplashMs(0, 1000)).toBe(0);
  });

  it('shows the app shell for returning sessions while the map may still boot', () => {
    expect(
      resolveStartupShell({
        destinationResolved: true,
        onboardingComplete: true,
      }),
    ).toBe('app');
  });

  it('shows the in-map loader only on the indoor map canvas', () => {
    expect(
      shouldShowMapBootOverlay({
        shell: 'app',
        activeTab: 'map',
        navigateView: 'map',
        mapStatus: 'loading',
      }),
    ).toBe(true);
    expect(
      shouldShowMapBootOverlay({
        shell: 'app',
        activeTab: 'map',
        navigateView: 'home',
        mapStatus: 'loading',
      }),
    ).toBe(false);
    expect(
      shouldShowMapBootOverlay({
        shell: 'onboarding',
        activeTab: 'map',
        navigateView: 'map',
        mapStatus: 'loading',
      }),
    ).toBe(false);
    expect(
      shouldShowMapBootOverlay({
        shell: 'app',
        activeTab: 'map',
        navigateView: 'map',
        mapStatus: 'ready',
      }),
    ).toBe(false);
    expect(
      isIndoorMapSurface({
        shell: 'app',
        activeTab: 'social',
        navigateView: 'map',
      }),
    ).toBe(false);
  });

  it('hides the map canvas on home and other shells without waiting for Mappedin', () => {
    expect(
      shouldHideMapCanvas({
        shell: 'app',
        activeTab: 'map',
        navigateView: 'home',
      }),
    ).toBe(true);
    expect(
      shouldHideMapCanvas({
        shell: 'splash',
        activeTab: 'map',
        navigateView: 'home',
      }),
    ).toBe(false);
    expect(
      shouldHideMapCanvas({
        shell: 'onboarding',
        activeTab: 'map',
        navigateView: 'map',
      }),
    ).toBe(true);
    expect(
      shouldHideMapCanvas({
        shell: 'app',
        activeTab: 'social',
        navigateView: 'map',
      }),
    ).toBe(true);
  });

  it('keeps the indoor map canvas visible so Mappedin can paint', () => {
    expect(
      shouldHideMapCanvas({
        shell: 'app',
        activeTab: 'map',
        navigateView: 'map',
      }),
    ).toBe(false);
    expect(
      shouldHideMapCanvas({
        shell: 'app',
        activeTab: 'map',
        navigateView: 'map',
        mapStatus: 'ready',
      }),
    ).toBe(false);
  });

  it('hides the indoor map canvas while the next venue map boots', () => {
    expect(
      shouldHideMapCanvas({
        shell: 'app',
        activeTab: 'map',
        navigateView: 'map',
        mapStatus: 'loading',
      }),
    ).toBe(true);
    expect(
      shouldHideMapCanvas({
        shell: 'app',
        activeTab: 'map',
        navigateView: 'map',
        mapStatus: 'initial',
      }),
    ).toBe(true);
  });
});
