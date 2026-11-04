import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocationService } from './location-service';
import { getLocationDiagnosticReport, recordLocationDiagnostic } from '../location/domain/location-diagnostics';
import { renderLocationErrorScreen } from '../ui/location-permission-screen';

afterEach(() => vi.unstubAllGlobals());

describe('location diagnostic report', () => {
  it('records timeout, fallback, and unavailable errors without coordinates', async () => {
    const position = vi.fn()
      .mockImplementationOnce((_ok, fail) => fail({ code: 3, TIMEOUT: 3, message: 'GPS timed out' }))
      .mockImplementationOnce((_ok, fail) => fail({ code: 2, message: 'Position provider unavailable' }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: position }, permissions: { query: async () => ({ state: 'granted' }) } });
    const service = new LocationService();
    await service.queryPermission();
    await expect(service.requestLocation()).rejects.toMatchObject({ code: 2 });
    const report = JSON.parse(getLocationDiagnosticReport());
    expect(report.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'permission', detail: { state: 'granted' } }),
      expect.objectContaining({ event: 'position-failed', detail: expect.objectContaining({ category: 'timeout', elapsedMs: expect.any(Number) }) }),
      expect.objectContaining({ event: 'retry-relaxed-accuracy' }),
      expect.objectContaining({ event: 'position-failed', detail: expect.objectContaining({ category: 'position-unavailable' }) }),
    ]));
    expect(position.mock.calls[1][2]).toMatchObject({ enableHighAccuracy: false, timeout: 15000 });
  });

  it('records successful accuracy without precise coordinates', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 12.34567, longitude: 76.54321, accuracy: 20 } } as GeolocationPosition) } });
    await new LocationService().requestLocation();
    const report = getLocationDiagnosticReport();
    expect(report).toContain('accuracyMeters');
    expect(report).not.toContain('12.34567');
    expect(report).not.toContain('76.54321');
  });

  it('bounds report history and escapes browser errors in dialog markup', () => {
    for (let i = 0; i < 50; i++) recordLocationDiagnostic('test', { index: i });
    recordLocationDiagnostic('error', { message: '</textarea><script>alert(1)</script>' });
    expect(JSON.parse(getLocationDiagnosticReport()).events).toHaveLength(40);
    const html = renderLocationErrorScreen({ locationGateLoading: false, locationGateError: 'Failed' });
    expect(html).not.toContain('Copy debug report');
    expect(html).not.toContain('Location debug details');
    expect(html).not.toContain('<script>');
    expect(html).toContain('id="location-dismiss-btn"');
  });
});
