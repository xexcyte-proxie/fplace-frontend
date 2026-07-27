import { appConfig } from '../../config';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }): void;
          prompt(
            momentListener?: (notification: {
              isNotDisplayed(): boolean;
              isSkippedMoment(): boolean;
              isDismissedMoment(): boolean;
              getNotDisplayedReason(): string;
            }) => void,
          ): void;
          renderButton(
            parent: HTMLElement,
            options: Record<string, unknown>,
          ): void;
          cancel(): void;
        };
      };
    };
  }
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let gisScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Sign-In.')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Failed to load Google Sign-In.'));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

export function isGoogleSignInConfigured(): boolean {
  return Boolean(appConfig.googleClientId.trim());
}

/**
 * Requests a Google ID token via One Tap, falling back to the GIS button popup
 * when One Tap is not displayed (common in custom-button flows).
 */
export async function requestGoogleIdToken(): Promise<string> {
  const clientId = appConfig.googleClientId.trim();
  if (!clientId) {
    throw new Error(
      'Google Sign-In is not configured. Set VITE_GOOGLE_CLIENT_ID.',
    );
  }

  await loadGoogleIdentityScript();
  if (!window.google?.accounts?.id) {
    throw new Error('Google Sign-In is unavailable in this browser.');
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let fallbackHost: HTMLDivElement | null = null;

    const cleanup = () => {
      if (fallbackHost?.parentNode) {
        fallbackHost.parentNode.removeChild(fallbackHost);
      }
      fallbackHost = null;
    };

    const finish = (credential: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(credential);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    window.google!.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response?.credential) {
          finish(response.credential);
          return;
        }
        fail('Google did not return an ID token.');
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    const openButtonFallback = () => {
      if (settled || fallbackHost) return;
      fallbackHost = document.createElement('div');
      fallbackHost.setAttribute('aria-hidden', 'true');
      fallbackHost.style.cssText =
        'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
      document.body.appendChild(fallbackHost);

      window.google!.accounts.id.renderButton(fallbackHost, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
      });

      const btn = fallbackHost.querySelector<HTMLElement>('div[role="button"]');
      if (!btn) {
        fail('Google Sign-In button failed to initialize.');
        return;
      }
      // Make the generated button reachable for the synthetic click.
      fallbackHost.style.cssText =
        'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(18,18,27,0.45);';
      fallbackHost.style.pointerEvents = 'auto';
      fallbackHost.style.opacity = '1';
      fallbackHost.addEventListener(
        'click',
        (event) => {
          if (event.target === fallbackHost) {
            fail('Google Sign-In was cancelled.');
          }
        },
        { once: true },
      );
    };

    window.google!.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        openButtonFallback();
      }
      if (notification.isDismissedMoment()) {
        // User closed One Tap — still offer the button fallback.
        openButtonFallback();
      }
    });

    window.setTimeout(() => {
      fail('Google Sign-In timed out. Please try again.');
    }, 90_000);
  });
}
