import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FxBrowser } from '../components/FxBrowser';
import type { EnumeratedFx, Track } from '../hooks/useReaper';

// ── Mock data ────────────────────────────────────────────────

const mockFx: EnumeratedFx[] = [
  { index: 0, name: 'ReaEQ', ident: 'VST3:ReaEQ', format: 'VST3' },
  { index: 1, name: 'ReaComp', ident: 'VST3:ReaComp', format: 'VST3' },
  { index: 2, name: 'ValhallaRoom', ident: 'VST:ValhallaRoom', format: 'VST2' },
  { index: 3, name: 'Serum', ident: 'CLAP:Serum', format: 'CLAP' },
  { index: 4, name: 'JS: Delay', ident: 'JS:Delay', format: 'JSFX' },
];

const mockTracks: Track[] = [
  { index: 0, name: 'Kick', trackNumber: 1, selected: true, muted: false, soloed: false, armed: false, volume: 0.8 },
  { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.7 },
];

// ── Helpers ──────────────────────────────────────────────────

function renderFxBrowser(props: Partial<Parameters<typeof FxBrowser>[0]> = {}) {
  const enumerateFx = vi.fn().mockResolvedValue(mockFx);
  const addFx = vi.fn().mockResolvedValue(0);
  const getTrackFx = vi.fn().mockResolvedValue([]);
  const onSelectFx = vi.fn();
  const onBack = vi.fn();

  const utils = render(
    <FxBrowser
      tracks={mockTracks}
      selectedTrack={0}
      enumerateFx={enumerateFx}
      getTrackFx={getTrackFx}
      addFx={addFx}
      onSelectFx={onSelectFx}
      onBack={onBack}
      {...props}
    />,
  );

  return { ...utils, enumerateFx, addFx, getTrackFx, onSelectFx, onBack };
}

// ── Tests ────────────────────────────────────────────────────

describe('FxBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls enumerateFx on mount', () => {
    const { enumerateFx } = renderFxBrowser();
    expect(enumerateFx).toHaveBeenCalledOnce();
  });

  it('shows loading state initially', () => {
    // Don't resolve the promise yet
    const enumerateFx = vi.fn().mockReturnValue(new Promise(() => {}));
    render(
      <FxBrowser
        tracks={mockTracks}
        selectedTrack={0}
        enumerateFx={enumerateFx}
        getTrackFx={vi.fn()}
        addFx={vi.fn()}
        onSelectFx={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText('Loading FX...')).toBeDefined();
  });

  it('displays FX list grouped by format', async () => {
    renderFxBrowser();

    await waitFor(() => {
      expect(screen.getByText('VST3')).toBeDefined();
    });

    // Should show format section headers
    // (getAllByText / queryAllByText since badges also contain format names)
    expect(screen.getAllByText('VST3').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('VST2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('CLAP').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('JSFX').length).toBeGreaterThanOrEqual(1);

    // Should show plugin names
    expect(screen.getByText('ReaEQ')).toBeDefined();
    expect(screen.getByText('ReaComp')).toBeDefined();
    expect(screen.getByText('ValhallaRoom')).toBeDefined();
    expect(screen.getByText('Serum')).toBeDefined();
  });

  it('shows total plugin count', async () => {
    renderFxBrowser();

    await waitFor(() => {
      expect(screen.getByText(/5 total plugins/)).toBeDefined();
    });
  });

  it('filters by search query', async () => {
    renderFxBrowser();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search FX...')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search FX...');
    fireEvent.change(searchInput, { target: { value: 'rea' } });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
      expect(screen.getByText('ReaComp')).toBeDefined();
    });

    // ValhallaRoom and Serum should not be visible
    await waitFor(() => {
      expect(screen.queryByText('ValhallaRoom')).toBeNull();
    });
  });

  it('filters by format dropdown', async () => {
    renderFxBrowser();

    await waitFor(() => {
      expect(screen.getByDisplayValue('All')).toBeDefined();
    });

    // Change to VST3 filter
    const select = screen.getByDisplayValue('All');
    fireEvent.change(select, { target: { value: 'VST3' } });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
      expect(screen.getByText('ReaComp')).toBeDefined();
    });

    // VST2 plugin should not be visible
    expect(screen.queryByText('ValhallaRoom')).toBeNull();
  });

  it('calls addFx when Add button is clicked', async () => {
    const { addFx } = renderFxBrowser();

    await waitFor(() => {
      expect(screen.getAllByText('Add')).toHaveLength(5);
    });

    // Click first "Add" button (ReaEQ)
    const addButtons = screen.getAllByText('Add');
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(addFx).toHaveBeenCalledWith(0, 'ReaEQ');
    });
  });

  it('disables Add buttons when no track is selected', async () => {
    renderFxBrowser({ selectedTrack: null });

    await waitFor(() => {
      const addButtons = screen.getAllByText('Add');
      addButtons.forEach((btn) => {
        expect(btn.closest('button')).toBeDisabled();
      });
    });
  });

  it('shows track selection warning when no track selected', () => {
    renderFxBrowser({ selectedTrack: null });
    expect(screen.getByText(/Select a track first/)).toBeDefined();
  });

  it('calls onSelectFx when FX name is clicked', async () => {
    const { onSelectFx } = renderFxBrowser();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    fireEvent.click(screen.getByText('ReaEQ'));
    expect(onSelectFx).toHaveBeenCalledWith(0, 0, mockFx[0].name);
  });

  it('handles enumerate failure gracefully', async () => {
    const enumerateFx = vi.fn().mockRejectedValue(new Error('Connection failed'));
    render(
      <FxBrowser
        tracks={mockTracks}
        selectedTrack={0}
        enumerateFx={enumerateFx}
        getTrackFx={vi.fn()}
        addFx={vi.fn()}
        onSelectFx={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeDefined();
    });

    // Should show retry button
    expect(screen.getByText('Retry')).toBeDefined();
  });

  it('shows empty state when no FX installed', async () => {
    const enumerateFx = vi.fn().mockResolvedValue([]);
    render(
      <FxBrowser
        tracks={mockTracks}
        selectedTrack={0}
        enumerateFx={enumerateFx}
        getTrackFx={vi.fn()}
        addFx={vi.fn()}
        onSelectFx={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No plugins found')).toBeDefined();
    });
  });

  it('shows no results message when search matches nothing', async () => {
    renderFxBrowser();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search FX...')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search FX...');
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });

    await waitFor(() => {
      expect(screen.getByText(/No results matching/)).toBeDefined();
    });
  });

  it('shows target track name in header', async () => {
    renderFxBrowser();

    await waitFor(() => {
      expect(screen.getByText(/Kick/)).toBeDefined();
    });
  });
});
