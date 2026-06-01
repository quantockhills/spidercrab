import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';
import App from '../App';
import { useReaper } from '../hooks/useReaper';

// Mock the useReaper hook
vi.mock('../hooks/useReaper', () => ({
  useReaper: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  (useReaper as ReturnType<typeof vi.fn>).mockReturnValue({
    connected: true,
    tracks: [],
    refreshTracks: vi.fn().mockResolvedValue(undefined),
    toggleTrackMute: vi.fn().mockResolvedValue(undefined),
    toggleTrackSolo: vi.fn().mockResolvedValue(undefined),
    toggleTrackArm: vi.fn().mockResolvedValue(undefined),
    selectTrack: vi.fn().mockResolvedValue(undefined),
    enumerateFx: vi.fn().mockResolvedValue([]),
    getTrackFx: vi.fn().mockResolvedValue([]),
    getFxParams: vi.fn().mockResolvedValue([]),
    setFxParam: vi.fn().mockResolvedValue(true),
    addFx: vi.fn(),
    deleteFx: vi.fn().mockResolvedValue(true),
    getDirectory: vi.fn().mockResolvedValue([]),
    sendSampleToTrack: vi.fn(),
    isRefreshingFx: false,
    refreshFxCache: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    getTransportState: vi.fn().mockResolvedValue({ playing: false, recording: false }),
    onEvent: vi.fn().mockReturnValue(vi.fn()),
    updateTrack: vi.fn(),
  });
});

// ---------------------------------------------------------------------------
// CrashTest — throws during render so ErrorBoundary can catch it
// ---------------------------------------------------------------------------
interface CrashTestProps {
  shouldThrow?: boolean;
  message?: string;
}

function CrashTest({ shouldThrow = true, message = 'Test crash' }: CrashTestProps) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div>All good</div>;
}

// ---------------------------------------------------------------------------
// Helper: suppress console.error during tests where we expect thrown errors,
// since React logs caught errors there.
// ---------------------------------------------------------------------------
function suppressConsoleError() {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return spy;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ErrorBoundary', () => {
  describe('Fallback UI', () => {
    it('renders fallback UI when a child component throws', () => {
      const spy = suppressConsoleError();
      render(
        <ErrorBoundary>
          <CrashTest />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Something went wrong')).toBeDefined();
      expect(screen.getByText('Test crash')).toBeDefined();
      expect(screen.getByText('Retry')).toBeDefined();
      spy.mockRestore();
    });

    it('displays the error message in the fallback', () => {
      const spy = suppressConsoleError();
      render(
        <ErrorBoundary>
          <CrashTest message="Something exploded" />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Something exploded')).toBeDefined();
      spy.mockRestore();
    });

    it('renders the warning icon (⚠️) in the fallback', () => {
      const spy = suppressConsoleError();
      render(
        <ErrorBoundary>
          <CrashTest />
        </ErrorBoundary>,
      );

      // The icon should be rendered somewhere in the fallback UI
      expect(screen.getByText('⚠️')).toBeDefined();
      spy.mockRestore();
    });
  });

  describe('Normal children', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Hello from child</div>
        </ErrorBoundary>,
      );

      expect(screen.getByText('Hello from child')).toBeDefined();
      expect(screen.queryByText('Something went wrong')).toBeNull();
    });

    it('renders children alongside other elements', () => {
      render(
        <ErrorBoundary>
          <div>Child A</div>
          <div>Child B</div>
        </ErrorBoundary>,
      );

      expect(screen.getByText('Child A')).toBeDefined();
      expect(screen.getByText('Child B')).toBeDefined();
    });
  });

  describe('Retry button', () => {
    it('re-shows fallback after Retry when child still throws', () => {
      const spy = suppressConsoleError();

      render(
        <ErrorBoundary>
          <CrashTest shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Something went wrong')).toBeDefined();

      // Click Retry — this clears error state and re-renders children.
      // Since CrashTest still throws, the fallback should reappear.
      fireEvent.click(screen.getByText('Retry'));

      // After retry, error is re-caught, fallback shows again
      expect(screen.getByText('Something went wrong')).toBeDefined();
      expect(screen.getByText('Test crash')).toBeDefined();

      spy.mockRestore();
    });

    it('successfully recovers when error condition is fixed and Retry clicked', () => {
      const spy = suppressConsoleError();

      // We'll control throw state externally
      let throwError = true;
      function DynamicCrashTest() {
        if (throwError) {
          throw new Error('Temporary error');
        }
        return <div>Recovered!</div>;
      }

      render(
        <ErrorBoundary>
          <DynamicCrashTest />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Something went wrong')).toBeDefined();

      // Fix the error condition
      throwError = false;

      // Click Retry
      fireEvent.click(screen.getByText('Retry'));

      // Now the child should render successfully
      expect(screen.getByText('Recovered!')).toBeDefined();
      expect(screen.queryByText('Something went wrong')).toBeNull();

      spy.mockRestore();
    });
  });

  describe('Custom fallback prop', () => {
    it('renders custom fallback when provided', () => {
      const spy = suppressConsoleError();
      render(
        <ErrorBoundary fallback={<div>Custom error UI</div>}>
          <CrashTest />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Custom error UI')).toBeDefined();
      expect(screen.queryByText('Something went wrong')).toBeNull();
      spy.mockRestore();
    });
  });
});

describe('ErrorBoundary — integration with App', () => {
  it('does not interfere with normal app rendering', () => {
    // The App component wraps content in <ErrorBoundary>, so rendering App
    // normally should work without showing the fallback.
    render(<App />);

    // App should render its tabs
    expect(screen.getAllByText('Tracks').length).toBeGreaterThan(0);
    expect(screen.getByText('Settings')).toBeDefined();

    // The fallback should NOT be visible
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});
