/**
 * Best-effort public IP for POST /api/users/guest/ `ip_address`.
 * Backend may still trust the connection address; this fills the required body field.
 */
export async function resolveClientIpAddress(): Promise<string> {
  const controllers: AbortController[] = [];

  const withTimeout = async (url: string): Promise<string | null> => {
    const controller = new AbortController();
    controllers.push(controller);
    const timer = window.setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const body = (await response.json()) as { ip?: string };
        return typeof body.ip === 'string' && body.ip.trim()
          ? body.ip.trim()
          : null;
      }
      const text = (await response.text()).trim();
      return text || null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  };

  try {
    const fromJson = await withTimeout('https://api.ipify.org?format=json');
    if (fromJson) return fromJson;
    const fromText = await withTimeout('https://api.ipify.org');
    if (fromText) return fromText;
  } finally {
    for (const controller of controllers) {
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    }
  }

  return '0.0.0.0';
}
