export const AR_MOBILE_MESSAGE = 'AR is available on mobile. Open fplaces on your phone to use AR navigation. You can still explore with the 2D map here.';

/** Use device signals, not window width: resizing a laptop must not unlock AR. */
export function isMobileArDevice(device: { userAgent: string; maxTouchPoints?: number; mobile?: boolean }): boolean {
  return device.mobile === true || /Android|iPhone|iPad|iPod/i.test(device.userAgent) ||
    (/Macintosh/i.test(device.userAgent) && (device.maxTouchPoints ?? 0) > 1);
}

export function isDesktopArDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const device = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return !isMobileArDevice({ userAgent: device.userAgent, maxTouchPoints: device.maxTouchPoints, mobile: device.userAgentData?.mobile });
}
