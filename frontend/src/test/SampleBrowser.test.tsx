import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SampleBrowser } from '../components/SampleBrowser';
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
    { name: '..', type: 'dir', size: 0 },
    { name: 'Drums', type: 'dir', size: 0 },
    { name: 'Synth', type: 'dir', size: 0 },
    { name: 'kick.wav', type: 'file', size: 102400 },
    { name: 'snare.wav', type: 'file', size: 204800 },
    { name: 'lead.mp3', type: 'file', size: 5120000 },
    { name: 'notes.txt', type: 'file', size: 1024 },
  ];
}

// ── Tests ─────────────────────────────────────────────────────

describe('SampleBrowser', () => {
  const mockGetDirectory = vi.fn();
  const mockSendSampleToTrack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDirectory.mockResolvedValue({ entries: createMockEntries() });
    mockSendSampleToTrack.mockResolvedValue(true);
  });

  it('renders loading state initially', () => {
    mockGetDirectory.mockImplementation(() => new Promise(() => {})); // never resolves
    render(
      <SampleBrowser
        tracks={[]}
        selectedTrack={null}
        getDirectory={mockGetDirectory}
        sendSampleToTrack={mockSendSampleToTrack}
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
});
