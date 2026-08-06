import { vi } from 'vitest';

/**
 * Default mock for the useReaper composite hook.
 *
 * useReaper spreads seven domain hooks together, so its surface is large and
 * grows regularly. Test files used to hand-list it, which meant every new
 * member silently broke them: App gained a `sendCommand` dependency, the
 * hand-written mocks did not, App threw on mount, and ~45 tests failed on
 * assertions that had nothing to do with what they were testing.
 *
 * Anything not named here resolves to a fresh `vi.fn()` returning undefined,
 * so adding a member to useReaper cannot break unrelated tests. Pass overrides
 * for the handful of values a given test actually cares about:
 *
 *   (useReaper as Mock).mockReturnValue(makeReaperMock({ isRefreshingFx: true }));
 */

// Members that must NOT default to a function — components read these as data.
const DATA_DEFAULTS: Record<string, unknown> = {
  connected: true,
  tracks: [],
  matrix: null,
  sequencer: null,
  isRefreshingFx: false,
  clientRef: { current: null },
};

export function makeReaperMock(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const target: Record<string, unknown> = { ...DATA_DEFAULTS, ...overrides };

  return new Proxy(target, {
    get(obj, prop) {
      // Symbols are React/JS internals probing the object — never auto-create.
      if (typeof prop === 'symbol') return undefined;
      if (!Reflect.has(obj, prop)) {
        obj[prop] = vi.fn().mockResolvedValue(undefined);
      }
      return obj[prop];
    },
    has() {
      return true;
    },
  });
}
