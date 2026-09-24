import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PositionProvider } from './positionProvider';

class TestProvider extends PositionProvider {
  readonly source = 'gps' as const;
  protected onStart() {}
  protected onStop() {}
  send(timestamp = Date.now()) {
    this.emit({ latitude: 6.6, longitude: 3.35, accuracy: 5, timestamp });
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('provider health lifecycle', () => {
  it('reports signal loss, does not refresh on old compass fixes, and recovers', () => {
    const provider = new TestProvider();
    const onStatus = vi.fn();
    provider.start(vi.fn(), { onStatus });
    const timestamp = Date.now();
    provider.send(timestamp);
    expect(onStatus.mock.calls.map(([s]) => s)).toEqual(['starting', 'active']);
    vi.advanceTimersByTime(16_000);
    expect(onStatus).toHaveBeenLastCalledWith('inactive');
    provider.send(timestamp);
    expect(onStatus).toHaveBeenLastCalledWith('inactive');
    provider.send();
    expect(onStatus).toHaveBeenLastCalledWith('active');
    provider.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans old watches on restart and ignores emissions after stop', () => {
    const provider = new TestProvider();
    const stop = vi.spyOn(provider as any, 'onStop');
    const first = vi.fn();
    const second = vi.fn();
    provider.start(first);
    provider.start(second);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    provider.send();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    provider.stop();
    provider.send();
    expect(second).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
