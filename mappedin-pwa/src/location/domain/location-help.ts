/** Browser detection is only for help copy; permissions use capability detection. */
export function locationHelpEnvironment() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const os = ios ? 'ios' : /Android/.test(ua) ? 'android' : 'other';
  const brandedBrave = typeof navigator !== 'undefined' && typeof (navigator as Navigator & { brave?: { isBrave?: unknown } }).brave?.isBrave === 'function';
  const browser = brandedBrave || /Brave/i.test(ua) ? 'Brave' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'your browser';
  const installed = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return { os, browser, installed };
}

export function locationHelpSteps(env = locationHelpEnvironment()): string[] {
  const { os, browser, installed } = env;
  const steps: string[] = [];
  if (installed) steps.push('If Fplaces has no address bar, open the same Fplaces address in the browser you used to install it to review site permissions. Installed app permissions may be separate.');
  if (os === 'ios') {
    steps.push('Open iPhone or iPad Settings → Privacy & Security → Location Services. Turn Location Services on.');
    steps.push(`In that list, select ${browser === 'Safari' ? 'Safari Websites' : browser === 'your browser' ? 'the browser you use for Fplaces' : browser}, if listed, and allow access while using the app. Enable Precise Location for better positioning.`);
    if (browser === 'Safari') steps.push('In Safari, open Fplaces → Page Menu → Website Settings → Location. Choose Allow or Ask if available. Labels can vary by iOS version.');
    else steps.push(`Return to Fplaces in ${browser}. Review location access in its site controls, if available. If permission was reset, tap Allow Location in Fplaces to request access again.`);
    if (installed) steps.push('Also check Fplaces in Location Services if listed, then return to the installed app.');
  } else if (os === 'android') {
    steps.push('Open device Settings → Location and turn Use location on. Names vary by device.');
    steps.push(`Open device Settings → Apps → ${installed ? 'Fplaces (if listed), or the browser used to install it' : browser} → Permissions → Location. Allow access while using the app; enable precise location if available.`);
    if (browser === 'Firefox') steps.push('In Firefox, open Settings → Site permissions. Review Location and any blocked decision for Fplaces (often listed under Exceptions), then reset that decision to allow a new request. Menu names vary by version.');
    else if (browser === 'Chrome') steps.push('In Chrome, open Fplaces → site information beside the address → Permissions → Location. Allow access, or use Settings → Site settings → Location to find Fplaces. If you use Brave and it identifies as Chrome, use Brave’s equivalent site controls.');
    else if (browser === 'Brave') steps.push('In Brave, open Settings → Site settings → Location. You can also select All sites, then Fplaces, to review or reset its location permission.');
    else steps.push(`In ${browser}, open Fplaces and look for Location in the site information or site permission settings. Allow access or reset the blocked decision. Brave may identify itself as Chrome; use your browser’s equivalent controls.`);
  } else {
    steps.push('Open the site information or permission controls beside the browser address bar. Allow location for Fplaces, or reset a blocked decision.');
    steps.push('Check device privacy settings to ensure location services and location access for your browser are allowed.');
  }
  steps.push('Return to Fplaces. We’ll check access again. If access is still unclear, use Allow Location or Try Again.');
  return steps;
}

/** Compact device → browser → refresh guidance for the visible dialog. */
export function locationServicesHelpSteps(env = locationHelpEnvironment()): [string, string, string] {
  const device = env.os === 'ios'
    ? 'Settings → Privacy & Security → Location Services → On.'
    : env.os === 'android'
      ? 'Settings → Location → Use location → On.'
      : 'Turn on Location Services in your device settings.';
  let browser = 'Allow location for Fplaces in the site controls beside the address bar.';
  if (env.os === 'ios') {
    browser = env.browser === 'Safari'
      ? 'Safari → Page Menu → Website Settings → Location → Allow.'
      : `Settings → Privacy & Security → Location Services → ${env.browser} → While Using.`;
  } else if (env.os === 'android') {
    if (env.browser === 'Firefox') browser = 'Firefox → Site permissions: allow or reset location for Fplaces.';
    else if (env.browser === 'Brave') browser = 'Brave → Settings → Site settings → All sites → Fplaces → Location → Allow.';
    else browser = 'Site information beside the address → Permissions → Location → Allow.';
  }
  if (env.installed) browser = 'Use the browser you used to install it. ' + browser;
  return [device, browser, 'Return to Fplaces and refresh.'];
}
