import { describe, expect, it } from 'vitest';

import { AppStore } from './app-store';

describe('AppStore.patch', () => {
  it('does not notify listeners when patched fields are unchanged', () => {
    const store = new AppStore();
    let emissions = 0;
    store.subscribe(() => {
      emissions += 1;
    });
    expect(emissions).toBe(1);

    store.patch({
      blueDotStatus: 'off',
      blueDotFollowing: false,
    });
    expect(emissions).toBe(1);
  });

  it('notifies listeners when a patched field changes', () => {
    const store = new AppStore();
    let emissions = 0;
    store.subscribe(() => {
      emissions += 1;
    });

    store.patch({ routeRemainingMeters: 42 });
    expect(emissions).toBe(2);
    expect(store.get().routeRemainingMeters).toBe(42);
  });
});
