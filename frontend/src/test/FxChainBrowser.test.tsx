import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FxChainBrowser } from '../components/FxChainBrowser';
import type { Track, FxChainEntry, FxChainInfo } from '../hooks/useReaper';

// ── Helpers ───────────────────────────────────────────────────

function createMockTracks(): Track[] {
  return [
    { index: 0, name: 'Kick', trackNumber: 1, selected: true, muted: false, soloed: false, armed: false, volume: 0.8 },
    { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.7 },
  ];
}

function createMockChains(): FxChainEntry[] {
  return [
    { name: 'my_comp.RfxChain', size: 512 },
    { name: 'reverb.RfxChain', size: 1024 },
    { name: 'full_mix.RfxChain', size: 2048 },
  ];
}

function createMockChainInfo(): FxChainInfo {
  return {
    filePath: '/tmp/test_chains/my_comp.RfxChain',
    fxCount: 2,
    fxNames: ['ReaComp', 'ReaEQ'],
    fileSize: 512,
  };
}

const testPath = '/tmp/test_chains';

// ── Tests ─────────────────────────────────────────────────────

describe('FxChainBrowser', () => {
  const mockGetDirectory = vi.fn();
  const mockSave = vi.fn();
  const mockLoad = vi.fn();
  const mockGetInfo = vi.fn();
  const mockSearchRecursive = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDirectory.mockResolvedValue({ chains: createMockChains(), dirs: [] });
    mockSave.mockResolvedValue(true);
    mockLoad.mockResolvedValue(true);
    mockGetInfo.mockResolvedValue(createMockChainInfo());
    mockSearchRecursive.mockResolvedValue([]);
  });

  it('renders loading state initially', () => {
    mockGetDirectory.mockImplementation(() => new Promise(() => {})); // never resolves
    render(
      <FxChainBrowser
        tracks={[]}
        selectedTrack={null}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );
    expect(screen.getByText('Loading…')).toBeDefined();
  });

  it('renders FX chain files after loading', async () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('my_comp.RfxChain')).toBeDefined();
      expect(screen.getByText('reverb.RfxChain')).toBeDefined();
      expect(screen.getByText('full_mix.RfxChain')).toBeDefined();
    });
  });

  it('shows target track name when selected', async () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Kick')).toBeDefined();
    });
  });

  it('shows warning when no track is selected', () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={null}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    expect(screen.getByText(/Select a track first/i)).toBeDefined();
  });

  it('calls getDirectory on mount', async () => {
    render(
      <FxChainBrowser
        tracks={[]}
        selectedTrack={null}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(mockGetDirectory).toHaveBeenCalledWith(testPath);
    });
  });

  it('calls fxChainLoad when Load button clicked', async () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    // Wait for chains to load
    await screen.findByText('my_comp.RfxChain');
    // Wait for at least one Load button to appear
    await screen.findAllByText('Load');

    // Click the first Load button
    const loadButtons = screen.getAllByText('Load');
    fireEvent.click(loadButtons[0]);

    await waitFor(() => {
      expect(mockLoad).toHaveBeenCalledWith(0, expect.stringContaining('my_comp.RfxChain'), 'replace');
    });
  });

  it('calls fxChainLoad with append mode when + button clicked', async () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('my_comp.RfxChain')).toBeDefined();
    });

    // Click the + append button (title="Append")
    const appendButtons = screen.getAllByTitle('Append');
    fireEvent.click(appendButtons[0]);

    await waitFor(() => {
      expect(mockLoad).toHaveBeenCalledWith(0, expect.stringContaining('my_comp.RfxChain'), 'append');
    });
  });

  it('calls fxChainGetInfo when a chain is selected', async () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('my_comp.RfxChain')).toBeDefined();
    });

    // Click on a chain name to select it
    fireEvent.click(screen.getByText('my_comp.RfxChain'));

    await waitFor(() => {
      expect(mockGetInfo).toHaveBeenCalledWith(expect.stringContaining('my_comp.RfxChain'));
    });
  });

  it('shows chain info panel when chain is selected', async () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('my_comp.RfxChain')).toBeDefined();
    });

    // Click on a chain name to select it
    fireEvent.click(screen.getByText('my_comp.RfxChain'));

    await waitFor(() => {
      expect(screen.getByText('Chain Info')).toBeDefined();
      expect(screen.getByText('2 FX')).toBeDefined();
      expect(screen.getByText('ReaComp')).toBeDefined();
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });
  });

  it('disables Load buttons when no track is selected', async () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={null}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      const loadButtons = screen.getAllByText('Load');
      loadButtons.forEach((btn) => {
        expect(btn.closest('button')).toBeDisabled();
      });
    });
  });

  it('switches to save mode and shows save UI', async () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    // Switch to Save mode
    const saveTab = screen.getByText('Save Chain');
    fireEvent.click(saveTab);

    await waitFor(() => {
      expect(screen.getByText('Save FX Chain')).toBeDefined();
      expect(screen.getByText('💾 Save FX Chain')).toBeDefined();
    });
  });

  it('calls fxChainSave when saving a chain', async () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    // Switch to Save mode
    fireEvent.click(screen.getByText('Save Chain'));

    await waitFor(() => {
      expect(screen.getByText('💾 Save FX Chain')).toBeDefined();
    });

    // Type a name and save
    const input = screen.getByPlaceholderText('My Chain');
    fireEvent.change(input, { target: { value: 'my_chain' } });

    const saveButton = screen.getByText('💾 Save FX Chain');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(0, expect.stringContaining('my_chain'));
    });
  });

  it('shows retry button on error', async () => {
    mockGetDirectory.mockRejectedValueOnce(new Error('Permission denied'));

    render(
      <FxChainBrowser
        tracks={[]}
        selectedTrack={null}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeDefined();
      expect(screen.getByText('Retry')).toBeDefined();
    });
  });

  it('shows empty state when no chain files found', async () => {
    mockGetDirectory.mockResolvedValue({ chains: [], dirs: [] });

    render(
      <FxChainBrowser
        tracks={[]}
        selectedTrack={null}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No FX chains found in this folder')).toBeDefined();
    });
  });

  it('shows folder prompt when no path is configured', () => {
    // No initialPath — should show the folder prompt
    render(
      <FxChainBrowser
        tracks={[]}
        selectedTrack={null}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
      />
    );

    expect(screen.getByText('Set the FX Chains folder path in Settings')).toBeDefined();
  });

  it('filters chains by search query', async () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('my_comp.RfxChain')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search all FX chains…');
    fireEvent.change(searchInput, { target: { value: 'reverb' } });

    await waitFor(() => {
      expect(screen.queryByText('my_comp.RfxChain')).toBeNull();
      expect(screen.getByText('reverb.RfxChain')).toBeDefined();
    });
  });

  it('shows no results when search matches nothing', async () => {
    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('my_comp.RfxChain')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search all FX chains…');
    fireEvent.change(searchInput, { target: { value: 'zzzzz_not_found' } });

    await waitFor(() => {
      expect(screen.getByText(/No results for/i)).toBeDefined();
    });
  });

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn();
    render(
      <FxChainBrowser
        tracks={[]}
        selectedTrack={null}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={onBack}
        initialPath={testPath}
      />
    );

    const backButton = screen.getByText('← Back');
    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls fxChainSearchRecursive when search text changes', async () => {
    mockSearchRecursive.mockResolvedValue([
      { filePath: '/tmp/test_chains/sub/hidden_comp.RfxChain', name: 'hidden_comp.RfxChain', size: 256 },
    ]);

    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('my_comp.RfxChain')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search all FX chains…');
    fireEvent.change(searchInput, { target: { value: 'hidden' } });

    // Wait for 300ms debounce to fire
    await waitFor(() => {
      expect(mockSearchRecursive).toHaveBeenCalledWith('hidden', testPath);
    }, { timeout: 5000 });
  });

  it('shows backend results merged with local results', async () => {
    mockSearchRecursive.mockResolvedValue([
      { filePath: '/tmp/test_chains/sub/extra.RfxChain', name: 'extra.RfxChain', size: 128 },
    ]);

    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('my_comp.RfxChain')).toBeDefined();
    });

    // Search for 'RfxChain' which matches all local + backend results
    const searchInput = screen.getByPlaceholderText('Search all FX chains…');
    fireEvent.change(searchInput, { target: { value: 'RfxChain' } });

    await waitFor(() => {
      expect(screen.getByText('extra.RfxChain')).toBeDefined();
      expect(screen.getByText('my_comp.RfxChain')).toBeDefined();
    }, { timeout: 5000 });
  });

  it('shows searching indicator while backend search is in flight', async () => {
    // Use a slow-resolving promise so the search indicator stays visible
    let resolvePromise: (v: unknown) => void = () => {};
    mockSearchRecursive.mockImplementation(() => new Promise(resolve => { resolvePromise = resolve; }));

    render(
      <FxChainBrowser
        tracks={createMockTracks()}
        selectedTrack={0}
        fxChainGetDirectory={mockGetDirectory}
        fxChainSave={mockSave}
        fxChainLoad={mockLoad}
        fxChainGetInfo={mockGetInfo}
        fxChainSearchRecursive={mockSearchRecursive}
        onBack={() => {}}
        initialPath={testPath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('my_comp.RfxChain')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search all FX chains…');
    fireEvent.change(searchInput, { target: { value: 'hidden' } });

    // Wait for debounce to fire and searching indicator to appear
    await waitFor(() => {
      expect(screen.getByText('Searching all folders…')).toBeDefined();
    }, { timeout: 5000 });

    // Resolve the promise to clean up
    resolvePromise([]);
  });
});
