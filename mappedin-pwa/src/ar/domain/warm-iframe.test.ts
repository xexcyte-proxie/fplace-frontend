import { describe, expect, it } from 'vitest';

import {
  isPreloadArSrc,
  isUsableWarmedArSrc,
  preloadSrcNeedsRefresh,
  shouldReuseWarmedArIframe,
  shouldWaitForInFlightPreload,
} from './warm-iframe';

const readyChild = {
  hasActivate: true,
  hasRouteBridge: true,
  buildId: 'fast-boot-v1',
};

describe('warm iframe reuse', () => {
  it('rejects blank and cross-origin frames', () => {
    expect(isUsableWarmedArSrc('about:blank')).toBe(false);
    expect(
      shouldReuseWarmedArIframe({
        src: 'https://app.test/ar/?preload=1&build=fast-boot-v1',
        sameOrigin: false,
        expectedBuildId: 'fast-boot-v1',
        child: readyChild,
      }),
    ).toBe(false);
  });

  it('reuses a same-origin document that exposes activate + route bridge', () => {
    expect(
      shouldReuseWarmedArIframe({
        src: 'https://app.test/ar/?preload=1&build=fast-boot-v1',
        sameOrigin: true,
        expectedBuildId: 'fast-boot-v1',
        child: readyChild,
      }),
    ).toBe(true);
  });

  it('does not reuse a stale AR build', () => {
    expect(
      shouldReuseWarmedArIframe({
        src: 'https://app.test/ar/?preload=1&build=old',
        sameOrigin: true,
        expectedBuildId: 'fast-boot-v1',
        child: { ...readyChild, buildId: 'old' },
      }),
    ).toBe(false);
  });

  it('waits for an in-flight preload instead of restarting the document', () => {
    expect(isPreloadArSrc('https://app.test/ar/?arDebug=0&preload=1&build=x')).toBe(
      true,
    );
    expect(
      shouldWaitForInFlightPreload({
        src: 'https://app.test/ar/?preload=1&build=fast-boot-v1',
        sameOrigin: true,
        child: { hasActivate: false, hasRouteBridge: false },
      }),
    ).toBe(true);
    expect(
      shouldWaitForInFlightPreload({
        src: 'https://app.test/ar/?preload=1&build=fast-boot-v1',
        sameOrigin: true,
        child: readyChild,
      }),
    ).toBe(false);
  });

  it('refreshes preload when the build query does not match', () => {
    expect(
      preloadSrcNeedsRefresh({
        src: 'https://app.test/ar/?preload=1&build=old',
        expectedBuildId: 'fast-boot-v1',
      }),
    ).toBe(true);
    expect(
      preloadSrcNeedsRefresh({
        src: 'https://app.test/ar/?preload=1&build=fast-boot-v1',
        expectedBuildId: 'fast-boot-v1',
      }),
    ).toBe(false);
  });
});
