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

// Mock document.elementFromPoint for jsdom
document.elementFromPoint = () => {
  const mockElement = document.createElement('div');
  mockElement.setAttribute('data-drop-zone', 'test-zone');
  return mockElement;
};
