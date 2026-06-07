import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SampleBrowser } from '../components/SampleBrowser';
import { DragProvider } from '../hooks/useDragContext';
import type { Track, DirEntry } from '../hooks/useReaper';

// ── Helpers ───────────────────────────────────────────────────

function createMockTracks(): Track[] {
  return [
    { index: 0, name: 'Kick', trackNumber: 1, selected: true, muted: false, soloed: false, armed: false, volume: 0.8 },
    { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.7 },
  ];
}

function createMockEntries(): DirEntry[] {
  return [
    { name: '..', type: 'dir' },
    { name: 'Drums', type: 'dir' },
    { name: 'Synth', type: 'dir' },
    { name: 'kick.wav', type: 'file' },
    { name: 'snare.wav', type: 'file' },
    { name: 'lead.mp3', type: 'file' },
    { name: 'notes.txt', type: 'file' },
  ];
}

// ── Tests ─────────────────────────────────────────────────────

describe('SampleBrowser', () => {
  const mockGetDirectory = vi.fn();
  const mockSendSampleToTrack = vi.fn();
  const mockSendCommand = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDirectory.mockResolvedValue({ entries: createMockEntries(), total: createMockEntries().length, offset: 0, path: '/samples' });
    mockSendSampleToTrack.mockResolvedValue(true);
    mockSendCommand.mockResolvedValue({ payload: {} });
  });

  it('renders loading state initially', () => {
    mockGetDirectory.mockImplementation(() => new Promise(() => {})); // never resolves
    render(
      <SampleBrowser
        tracks={[]}
        selectedTrack={null}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('renders directory and file entries after loading', async () => {
    render(
      <SampleBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      // Should see directory listing
      expect(screen.getByText('Drums')).toBeDefined();
      expect(screen.getByText('Synth')).toBeDefined();
      // Should see audio files
      expect(screen.getByText('kick.wav')).toBeDefined();
      expect(screen.getByText('snare.wav')).toBeDefined();
    });
  });

  it('shows target track name when selected', async () => {
    render(
      <SampleBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Kick')).toBeDefined();
    });
  });

  it('shows warning when no track is selected', () => {
    render(
      <SampleBrowser
        tracks={createMockTracks()}
        selectedTrack={null}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    expect(screen.getByText(/Select a track first/i)).toBeDefined();
  });

  it('calls getDirectory on mount', async () => {
    render(
      <SampleBrowser
        tracks={[]}
        selectedTrack={null}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(mockGetDirectory).toHaveBeenCalled();
    });
  });

  it('calls sendSampleToTrack when Send button clicked', async () => {
    render(
      <SampleBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('kick.wav')).toBeDefined();
    });

    // Find and click the Send button next to kick.wav
    const sendButtons = screen.getAllByText('🎯 Send');
    fireEvent.click(sendButtons[0]);

    await waitFor(() => {
      // The send button text should change
      expect(mockSendSampleToTrack).toHaveBeenCalledTimes(1);
      expect(mockSendSampleToTrack).toHaveBeenCalledWith(expect.stringContaining('kick.wav'), 0);
    });
  });

  it('filters entries by search query', async () => {
    render(
      <SampleBrowser
        tracks={[]}
        selectedTrack={null}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('kick.wav')).toBeDefined();
    });

    // Type in search
    const searchInput = screen.getByPlaceholderText('Filter files...');
    fireEvent.change(searchInput, { target: { value: 'snare' } });

    await waitFor(() => {
      // kick.wav should no longer be visible
      expect(screen.queryByText('kick.wav')).toBeNull();
      expect(screen.getByText('snare.wav')).toBeDefined();
    });
  });

  it('shows empty state when directory has no entries', async () => {
    mockGetDirectory.mockResolvedValue({ entries: [] });
    render(
      <SampleBrowser
        tracks={[]}
        selectedTrack={null}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Empty directory')).toBeDefined();
    });
  });

  it('shows error state when directory load fails', async () => {
    mockGetDirectory.mockRejectedValue(new Error('Permission denied'));
    render(
      <SampleBrowser
        tracks={[]}
        selectedTrack={null}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeDefined();
    });
  });

  it('shows no results when search matches nothing', async () => {
    render(
      <SampleBrowser
        tracks={[]}
        selectedTrack={null}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Drums')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Filter files...');
    fireEvent.change(searchInput, { target: { value: 'zzzzz_not_found' } });

    await waitFor(() => {
      expect(screen.getByText(/no results matching/i)).toBeDefined();
    });
  });

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn();
    render(
      <SampleBrowser
        tracks={[]}
        selectedTrack={null}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={onBack}
      />
    );

    const backButton = screen.getByText('← Back');
    fireEvent.click(backButton);

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows retry button on error and can reload', async () => {
    mockGetDirectory
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({ entries: createMockEntries() });

    render(
      <SampleBrowser
        tracks={[]}
        selectedTrack={null}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeDefined();
    });

    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(mockGetDirectory).toHaveBeenCalledTimes(2);
    });
  });

  // ── Audio preview tests ──────────────────────────────────────

  it('shows play button on audio file rows', async () => {
    render(
      <SampleBrowser
        tracks={[]}
        selectedTrack={null}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('kick.wav')).toBeDefined();
    });

    // Audio files should have play buttons
    const playButtons = screen.getAllByLabelText('Preview');
    expect(playButtons.length).toBeGreaterThan(0);
  });

  it('shows audio preview panel when play button is clicked', async () => {
    // Mock sendCommand to return audio info (Issue #106: sample/getAudioInfo)
    mockSendCommand.mockResolvedValue({
      payload: {
        duration: 10.5,
        sampleRate: 44100,
        channels: 2,
        peaks: [0.1, 0.3, 0.5, 0.8, 0.6, 0.4, 0.2, 0.1],
      },
    });

    render(
      <SampleBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
        sendCommand={mockSendCommand}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('kick.wav')).toBeDefined();
    });

    // Click play button on kick.wav
    const playButtons = screen.getAllByLabelText('Preview');
    fireEvent.click(playButtons[0]);

    // Preview panel should show the waveform (peaks loaded)
    await waitFor(() => {
      expect(screen.getByLabelText(/Play/i)).toBeDefined();
    });
  });

  // ── Long-press / Context Menu tests (Issue #28) ─────────────────
  // Uses vi.useFakeTimers in combination with real timers for async rendering.
  // The pattern: render with real timers, waitFor render, then switch to fake timers
  // for the long-press timer interaction.

  describe('long-press context menu', () => {
    afterEach(() => {
      vi.useRealTimers();
      localStorage.clear();
    });

    it('shows context menu on long-press of file', async () => {
      render(
        <SampleBrowser
          tracks={createMockTracks()}
          selectedTrack={0}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('kick.wav')).toBeDefined();
      });

      // Find the FileRow div (the one with pointer handlers)
      const fileRow = screen.getByText('kick.wav').closest('[class*="touch-none"]');
      expect(fileRow).not.toBeNull();

      // Switch to fake timers for the long-press interaction
      vi.useFakeTimers();

      // Trigger pointer down (start long-press timer)
      fireEvent.pointerDown(fileRow!, { clientX: 100, clientY: 200 });

      // Advance timers past 500ms threshold (wrapped in act for React state flush)
      act(() => { vi.advanceTimersByTime(600); });

      // Context menu should appear with menu items
      expect(screen.getByText('Send to Track')).toBeDefined();
      expect(screen.getByText('Start Drag to Slot')).toBeDefined();
      expect(screen.getByText('File Info')).toBeDefined();

      vi.useRealTimers();
    });

    it('shows context menu on non-audio files too', async () => {
      render(
        <SampleBrowser
          tracks={createMockTracks()}
          selectedTrack={0}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('notes.txt')).toBeDefined();
      });

      // Find the FileRow
      const notesRow = screen.getByText('notes.txt').closest('[class*="touch-none"]');
      expect(notesRow).not.toBeNull();

      vi.useFakeTimers();

      // Long-press on notes.txt
      fireEvent.pointerDown(notesRow!, { clientX: 50, clientY: 100 });
      act(() => { vi.advanceTimersByTime(600); });

      // Non-audio files should show File Info and Start Drag
      expect(screen.getByText('Start Drag to Slot')).toBeDefined();
      expect(screen.getByText('File Info')).toBeDefined();

      vi.useRealTimers();
    });

    it('cancels context menu on pointer up before threshold', async () => {
      render(
        <SampleBrowser
          tracks={createMockTracks()}
          selectedTrack={0}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('kick.wav')).toBeDefined();
      });

      const fileRow = screen.getByText('kick.wav').closest('[class*="touch-none"]');
      expect(fileRow).not.toBeNull();

      vi.useFakeTimers();

      // Start long-press
      fireEvent.pointerDown(fileRow!, { clientX: 100, clientY: 200 });

      // Release before threshold (500ms)
      act(() => { vi.advanceTimersByTime(400); });
      act(() => { fireEvent.pointerUp(fileRow!); });

      // Advance past the threshold
      act(() => { vi.advanceTimersByTime(200); });

      // Context menu should NOT appear
      expect(screen.queryByText('Send to Track')).toBeNull();

      vi.useRealTimers();
    });

    it('cancels context menu on pointer move', async () => {
      render(
        <SampleBrowser
          tracks={createMockTracks()}
          selectedTrack={0}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('kick.wav')).toBeDefined();
      });

      const fileRow = screen.getByText('kick.wav').closest('[class*="touch-none"]');
      expect(fileRow).not.toBeNull();

      vi.useFakeTimers();

      // Start long-press
      fireEvent.pointerDown(fileRow!, { clientX: 100, clientY: 200 });

      // Move before threshold
      act(() => { vi.advanceTimersByTime(400); });
      act(() => { fireEvent.pointerMove(fileRow!); });

      // Advance past the threshold
      act(() => { vi.advanceTimersByTime(200); });

      // Context menu should NOT appear
      expect(screen.queryByText('Send to Track')).toBeNull();

      vi.useRealTimers();
    });

    it('dismisses context menu on outside click', async () => {
      render(
        <SampleBrowser
          tracks={createMockTracks()}
          selectedTrack={0}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('kick.wav')).toBeDefined();
      });

      // Trigger context menu
      const fileRow = screen.getByText('kick.wav').closest('[class*="touch-none"]');
      expect(fileRow).not.toBeNull();

      vi.useFakeTimers();

      fireEvent.pointerDown(fileRow!, { clientX: 100, clientY: 200 });
      act(() => { vi.advanceTimersByTime(600); });

      expect(screen.getByText('Send to Track')).toBeDefined();

      // Click outside
      act(() => { fireEvent.mouseDown(document.body); });

      expect(screen.queryByText('Send to Track')).toBeNull();

      vi.useRealTimers();
    });

    it('triggers drag from Start Drag to Slot context menu option', async () => {
      const mockStartDrag = vi.fn();

      // Wrap in a DragProvider to capture startDrag calls
      render(
        <DragProvider>
          <SampleBrowser
            tracks={createMockTracks()}
            selectedTrack={0}
            getDirectory={mockGetDirectory}
            sendSampleToTrack={mockSendSampleToTrack}
            sendCommand={mockSendCommand}
            onBack={() => {}}
          />
        </DragProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('kick.wav')).toBeDefined();
      });

      const fileRow = screen.getByText('kick.wav').closest('[class*="touch-none"]');
      expect(fileRow).not.toBeNull();

      vi.useFakeTimers();

      // Long-press kick.wav
      fireEvent.pointerDown(fileRow!, { clientX: 100, clientY: 200 });
      act(() => { vi.advanceTimersByTime(600); });

      expect(screen.getByText('Start Drag to Slot')).toBeDefined();

      vi.useRealTimers();

      // Click Start Drag to Slot context menu item
      act(() => { fireEvent.click(screen.getByText('Start Drag to Slot')); });

      // After clicking, the drag should be active (overlay would show)
      // We can't easily check the context state from outside, but
      // we verify it doesn't crash and the menu closes
      await waitFor(() => {
        expect(screen.queryByText('Start Drag to Slot')).toBeNull();
      });
    });

    it('sends sample from context menu Send to Track option', async () => {
      mockSendSampleToTrack.mockResolvedValue(true);

      render(
        <SampleBrowser
          tracks={createMockTracks()}
          selectedTrack={0}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('snare.wav')).toBeDefined();
      });

      const snareRow = screen.getByText('snare.wav').closest('[class*="touch-none"]');
      expect(snareRow).not.toBeNull();

      vi.useFakeTimers();

      // Long-press snare.wav
      fireEvent.pointerDown(snareRow!, { clientX: 100, clientY: 200 });
      act(() => { vi.advanceTimersByTime(600); });

      expect(screen.getByText('Send to Track')).toBeDefined();

      vi.useRealTimers();

      // Click Send to Track in context menu
      fireEvent.click(screen.getByText('Send to Track'));

      await waitFor(() => {
        expect(mockSendSampleToTrack).toHaveBeenCalledWith(
          expect.stringContaining('snare.wav'),
          0
        );
      });
    });

    it('shows File Info modal from context menu', async () => {
      render(
        <SampleBrowser
          tracks={createMockTracks()}
          selectedTrack={0}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('kick.wav')).toBeDefined();
      });

      const fileRow = screen.getByText('kick.wav').closest('[class*="touch-none"]');
      expect(fileRow).not.toBeNull();

      vi.useFakeTimers();

      // Long-press kick.wav
      fireEvent.pointerDown(fileRow!, { clientX: 100, clientY: 200 });
      act(() => { vi.advanceTimersByTime(600); });

      expect(screen.getByText('File Info')).toBeDefined();

      vi.useRealTimers();

      // Click File Info
      act(() => { fireEvent.click(screen.getByText('File Info')); });

      // File Info modal should appear
      await waitFor(() => {
        expect(screen.getByText('Type')).toBeDefined();
        expect(screen.getByText('Size')).toBeDefined();
      });

      // Should show file details
      expect(screen.getByText('Audio')).toBeDefined();
    });

    it('closes File Info modal on Done click', async () => {
      render(
        <SampleBrowser
          tracks={createMockTracks()}
          selectedTrack={0}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('kick.wav')).toBeDefined();
      });

      const fileRow = screen.getByText('kick.wav').closest('[class*="touch-none"]');
      expect(fileRow).not.toBeNull();

      vi.useFakeTimers();

      // Open context menu
      fireEvent.pointerDown(fileRow!, { clientX: 100, clientY: 200 });
      act(() => { vi.advanceTimersByTime(600); });

      expect(screen.getByText('File Info')).toBeDefined();

      vi.useRealTimers();

      // Open file info
      act(() => { fireEvent.click(screen.getByText('File Info')); });

      await waitFor(() => {
        expect(screen.getByText('Done')).toBeDefined();
      });

      // Click Done
      act(() => { fireEvent.click(screen.getByText('Done')); });

      await waitFor(() => {
        expect(screen.queryByText('Type')).toBeNull();
      });
    });
  });

  // ── Root selector tests (Issue #101) ────────────────────────────

  describe('root selector with samplePaths', () => {
    beforeEach(() => {
      localStorage.clear();
      mockGetDirectory.mockResolvedValue({ entries: createMockEntries(), total: createMockEntries().length, offset: 0, path: '/samples' });
    });

    it('shows root selector when samplePaths is provided and no root selected', () => {
      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
          samplePaths={['/samples/drums', '/samples/synths', '/samples/loops']}
        />
      );

      // Should show the root selector heading
      expect(screen.getByText('Sample Directories')).toBeDefined();

      // Should show each configured root
      expect(screen.getByText('/samples/drums')).toBeDefined();
      expect(screen.getByText('/samples/synths')).toBeDefined();
      expect(screen.getByText('/samples/loops')).toBeDefined();

      // Should NOT load any directory yet
      expect(mockGetDirectory).not.toHaveBeenCalled();
    });

    it('tapping a root navigates into it', async () => {
      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
          samplePaths={['/samples/drums', '/samples/synths']}
        />
      );

      // Root selector visible
      expect(screen.getByText('/samples/drums')).toBeDefined();

      // Click the drums root
      fireEvent.click(screen.getByText('/samples/drums'));

      // Should navigate into that directory
      await waitFor(() => {
        expect(mockGetDirectory).toHaveBeenCalledWith('/samples/drums');
      });

      // Should show directory contents
      await waitFor(() => {
        expect(screen.getByText('Drums')).toBeDefined();
      });
    });

    it('shows empty state when samplePaths is empty array', () => {
      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
          samplePaths={[]}
        />
      );

      expect(screen.getByText(/No sample directories configured/i)).toBeDefined();
    });

    it('shows which root is currently being browsed', async () => {
      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
          samplePaths={['/samples/drums', '/samples/synths']}
        />
      );

      // Click drums root
      fireEvent.click(screen.getByText('/samples/drums'));

      await waitFor(() => {
        expect(screen.getByText('Drums')).toBeDefined();
      });

      // Should show "← Roots" back button when browsing a root
      expect(screen.getByText('← Roots')).toBeDefined();
    });

    it('".." at root level returns to root selector', async () => {
      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
          samplePaths={['/samples/drums', '/samples/synths']}
        />
      );

      // Click drums root
      fireEvent.click(screen.getByText('/samples/drums'));

      await waitFor(() => {
        expect(screen.getByText('Drums')).toBeDefined();
      });

      // Navigate into a subdirectory
      const drumDir = screen.getByText('Drums');
      fireEvent.click(drumDir);

      await waitFor(() => {
        expect(mockGetDirectory).toHaveBeenCalledWith('/samples/drums/Drums');
      });

      // Go up with ..
      // After loading Drums subdir, the entries include '..'
      const entries = [
        { name: '..', type: 'dir' as const, size: 0 },
        { name: 'kick.wav', type: 'file' as const, size: 100 },
      ];
      mockGetDirectory.mockResolvedValue({ entries });

      // Click Drums to go back (..) and then navigate up
      // Actually, we need to go up from Drums to return to root selector
      // The '..' entry should be visible
      await waitFor(() => {
        expect(screen.getByText('..')).toBeDefined();
      });

      // Go up — should return to root selector
      fireEvent.click(screen.getByText('..'));

      await waitFor(() => {
        expect(screen.getByText('/samples/drums')).toBeDefined();
        expect(screen.getByText('/samples/synths')).toBeDefined();
      });
    });

    it('falls back to old behavior when samplePaths prop is not provided', () => {
      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      // Should show the old path from localStorage (default /tmp)
      expect(screen.getByText(/\/tmp/)).toBeDefined();
    });
  });

  // ── Configurable root path tests (Issue #28) ───────────────────

  describe('configurable root path', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('uses default path /tmp when no localStorage value', () => {
      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      expect(screen.getByText(/\/tmp/)).toBeDefined();
    });

    it('persists root path to localStorage', async () => {
      mockGetDirectory.mockResolvedValue({ entries: createMockEntries(), total: createMockEntries().length, offset: 0, path: '/samples' });

      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      // Navigate into Drums folder
      await waitFor(() => {
        expect(screen.getByText('Drums')).toBeDefined();
      });

      fireEvent.click(screen.getByText('Drums'));

      await waitFor(() => {
        expect(mockGetDirectory).toHaveBeenCalledWith('/tmp/Drums');
      });

      // Check localStorage was updated
      expect(localStorage.getItem('sampleBrowserRootPath')).toBe('/tmp/Drums');

      // Now unmount and remount to verify localStorage persistence
      const { unmount } = render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );
      unmount();

      // A fresh render should load from localStorage
      mockGetDirectory.mockClear();
      mockGetDirectory.mockResolvedValue({ entries: createMockEntries(), total: createMockEntries().length, offset: 0, path: '/samples' });

      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      // Should load the persisted path
      await waitFor(() => {
        expect(mockGetDirectory).toHaveBeenCalledWith('/tmp/Drums');
      });
    });

    it('allows editing root path via click on path breadcrumb', async () => {
      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      // Click the edit icon/button on the path
      const editButton = screen.getByText('✏️');
      fireEvent.click(editButton);

      // Should show input field
      const pathInput = screen.getByPlaceholderText('Enter path...');
      expect(pathInput).toBeDefined();

      // Change path
      fireEvent.change(pathInput, { target: { value: '/home/samples' } });

      // Click Go
      fireEvent.click(screen.getByText('Go'));

      await waitFor(() => {
        expect(mockGetDirectory).toHaveBeenCalledWith('/home/samples');
      });

      // Path should be updated
      expect(screen.getByText(/\/home\/samples/)).toBeDefined();

      // localStorage should be updated
      expect(localStorage.getItem('sampleBrowserRootPath')).toBe('/home/samples');
    });

    it('cancels path editing on Escape', async () => {
      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      // Click edit
      fireEvent.click(screen.getByText('✏️'));

      const pathInput = screen.getByPlaceholderText('Enter path...');
      expect(pathInput).toBeDefined();

      // Type and press Escape
      fireEvent.change(pathInput, { target: { value: '/should/not/save' } });
      fireEvent.keyDown(pathInput, { key: 'Escape' });

      // Should revert to original path
      expect(screen.getByText(/\/tmp/)).toBeDefined();
      expect(localStorage.getItem('sampleBrowserRootPath')).toBe('/tmp');
    });

    it('does not save empty path', async () => {
      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
        />
      );

      // Click edit
      fireEvent.click(screen.getByText('✏️'));

      const pathInput = screen.getByPlaceholderText('Enter path...');
      fireEvent.change(pathInput, { target: { value: '   ' } });
      fireEvent.click(screen.getByText('Go'));

      // Should NOT call getDirectory with empty path
      expect(mockGetDirectory).toHaveBeenCalledTimes(1); // only initial mount
      expect(localStorage.getItem('sampleBrowserRootPath')).toBe('/tmp');
    });
  });

  // ── Cross-root search tests (Issue #101, Acceptance Criterion #4) ────────

  describe('cross-root search', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      localStorage.clear();
    });

    it('searches across all configured roots when at root selector level', async () => {
      // Each root has different files
      mockGetDirectory.mockImplementation(async (path: string) => {
        if (path === '/samples/drums') {
          return {
            entries: [
              { name: '..', type: 'dir', size: 0 },
              { name: 'kick.wav', type: 'file', size: 102400 },
              { name: 'snare.wav', type: 'file', size: 204800 },
              { name: 'hihat.wav', type: 'file', size: 51200 },
            ],
          };
        }
        if (path === '/samples/synths') {
          return {
            entries: [
              { name: '..', type: 'dir', size: 0 },
              { name: 'lead.mp3', type: 'file', size: 5120000 },
              { name: 'bass.wav', type: 'file', size: 2048000 },
              { name: 'pad.wav', type: 'file', size: 1024000 },
            ],
          };
        }
        if (path === '/samples/loops') {
          return {
            entries: [
              { name: '..', type: 'dir', size: 0 },
              { name: 'beat.wav', type: 'file', size: 409600 },
              { name: 'kick.wav', type: 'file', size: 102400 },
              { name: 'melody.mp3', type: 'file', size: 2048000 },
            ],
          };
        }
        return { entries: [] };
      });

      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
          samplePaths={['/samples/drums', '/samples/synths', '/samples/loops']}
        />
      );

      // Should show root selector initially
      expect(screen.getByText('Sample Directories')).toBeDefined();

      // Type a search query that should match files across multiple roots
      const searchInput = screen.getByPlaceholderText('Filter files...');
      fireEvent.change(searchInput, { target: { value: 'kick' } });

      // Should fetch ALL roots
      await waitFor(() => {
        expect(mockGetDirectory).toHaveBeenCalledWith('/samples/drums');
        expect(mockGetDirectory).toHaveBeenCalledWith('/samples/synths');
        expect(mockGetDirectory).toHaveBeenCalledWith('/samples/loops');
      });

      // Should show matching files from ALL roots
      // Both kick.wav files should be visible (from /samples/drums and /samples/loops)
      await waitFor(() => {
        const kickElements = screen.getAllByText('kick.wav');
        expect(kickElements.length).toBe(2);
      });

      // Non-matching files should NOT be visible
      expect(screen.queryByText('snare.wav')).toBeNull();
      expect(screen.queryByText('bass.wav')).toBeNull();
      expect(screen.queryByText('beat.wav')).toBeNull();
    });

    it('shows results grouped by root path', async () => {
      mockGetDirectory.mockImplementation(async (path: string) => {
        if (path === '/samples/drums') {
          return {
            entries: [
              { name: '..', type: 'dir', size: 0 },
              { name: 'kick.wav', type: 'file', size: 102400 },
              { name: 'snare.wav', type: 'file', size: 204800 },
            ],
          };
        }
        if (path === '/samples/synths') {
          return {
            entries: [
              { name: '..', type: 'dir', size: 0 },
              { name: 'lead.mp3', type: 'file', size: 5120000 },
              { name: 'pad.wav', type: 'file', size: 1024000 },
            ],
          };
        }
        return { entries: [] };
      });

      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
          samplePaths={['/samples/drums', '/samples/synths']}
        />
      );

      // Type search for 'wav' — should match files from both roots
      const searchInput = screen.getByPlaceholderText('Filter files...');
      fireEvent.change(searchInput, { target: { value: 'wav' } });

      await waitFor(() => {
        // Should show root indicators for matching results
        expect(screen.getByText(/\/samples\/drums/)).toBeDefined();
        expect(screen.getByText(/\/samples\/synths/)).toBeDefined();

        // Matching files from both roots
        expect(screen.getByText('kick.wav')).toBeDefined();
        expect(screen.getByText('snare.wav')).toBeDefined();
        expect(screen.getByText('pad.wav')).toBeDefined();

        // Non-matching file should not be visible
        expect(screen.queryByText('lead.mp3')).toBeNull();
      });
    });

    it('shows no results message when cross-root search matches nothing', async () => {
      mockGetDirectory.mockResolvedValue({
        entries: [
          { name: '..', type: 'dir', size: 0 },
          { name: 'kick.wav', type: 'file', size: 102400 },
          { name: 'snare.wav', type: 'file', size: 204800 },
        ],
      });

      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
          samplePaths={['/samples/drums', '/samples/synths']}
        />
      );

      // Type search that matches nothing
      const searchInput = screen.getByPlaceholderText('Filter files...');
      fireEvent.change(searchInput, { target: { value: 'zzzzz_not_found' } });

      await waitFor(() => {
        expect(screen.getByText(/no results matching/i)).toBeDefined();
      });
    });

    it('clears cross-root results when search is cleared', async () => {
      mockGetDirectory.mockImplementation(async (path: string) => {
        if (path === '/samples/drums') {
          return {
            entries: [
              { name: '..', type: 'dir', size: 0 },
              { name: 'kick.wav', type: 'file', size: 102400 },
            ],
          };
        }
        return { entries: [] };
      });

      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
          samplePaths={['/samples/drums', '/samples/synths']}
        />
      );

      // First search for something
      const searchInput = screen.getByPlaceholderText('Filter files...');
      fireEvent.change(searchInput, { target: { value: 'kick' } });

      await waitFor(() => {
        expect(screen.getByText('kick.wav')).toBeDefined();
      });

      // Clear the search
      fireEvent.change(searchInput, { target: { value: '' } });

      // Should return to root selector view
      await waitFor(() => {
        expect(screen.getByText('Sample Directories')).toBeDefined();
      });
    });

    it('handles partial failure gracefully (one root fails, others work)', async () => {
      mockGetDirectory.mockImplementation(async (path: string) => {
        if (path === '/samples/broken') {
          throw new Error('Permission denied');
        }
        if (path === '/samples/drums') {
          return {
            entries: [
              { name: '..', type: 'dir', size: 0 },
              { name: 'kick.wav', type: 'file', size: 102400 },
            ],
          };
        }
        return { entries: [] };
      });

      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
          samplePaths={['/samples/drums', '/samples/broken']}
        />
      );

      // Type a search
      const searchInput = screen.getByPlaceholderText('Filter files...');
      fireEvent.change(searchInput, { target: { value: 'kick' } });

      // Should still show results from the working root
      await waitFor(() => {
        expect(screen.getByText('kick.wav')).toBeDefined();
        // Should show that one root failed
        expect(screen.getByText(/Permission denied/)).toBeDefined();
      });
    });

    it('still shows single-root search when browsing a specific root', async () => {
      mockGetDirectory.mockResolvedValue({
        entries: [
          { name: '..', type: 'dir', size: 0 },
          { name: 'kick.wav', type: 'file', size: 102400 },
          { name: 'snare.wav', type: 'file', size: 204800 },
        ],
      });

      render(
        <SampleBrowser
          tracks={[]}
          selectedTrack={null}
          getDirectory={mockGetDirectory}
          sendSampleToTrack={mockSendSampleToTrack}
          sendCommand={mockSendCommand}
          onBack={() => {}}
          samplePaths={['/samples/drums', '/samples/synths']}
        />
      );

      // Navigate into a specific root
      fireEvent.click(screen.getByText('/samples/drums'));

      await waitFor(() => {
        expect(mockGetDirectory).toHaveBeenCalledWith('/samples/drums');
      });

      // Clear mocks to reset call tracking
      mockGetDirectory.mockClear();

      // Search within the browsed root
      const searchInput = screen.getByPlaceholderText('Filter files...');
      fireEvent.change(searchInput, { target: { value: 'snare' } });

      await waitFor(() => {
        // Should find the matching file
        expect(screen.getByText('snare.wav')).toBeDefined();
        // Non-matching file should be filtered
        expect(screen.queryByText('kick.wav')).toBeNull();
      });

      // Should NOT have called getDirectory again (it's client-side filtering)
      expect(mockGetDirectory).not.toHaveBeenCalled();
    });
  });
});
