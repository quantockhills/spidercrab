import '@testing-library/jest-dom/vitest'

// Mock window.matchMedia for jsdom (used by useTheme hook and any component
// that checks prefers-color-scheme)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom has no ResizeObserver. Every browser we target does (iOS Safari 13.4+),
// so this is a test-environment gap rather than something to guard against in
// the components — the Grid strip uses it to track the scroller's geometry.
// Layout is always zero in jsdom anyway, so a no-op observer is honest here.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverStub,
});
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
