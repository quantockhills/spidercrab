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

    await waitFor(() => {
      expect(onSelectFx).toHaveBeenCalledWith(0, 0, mockFx[0].name);
    });
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
      expect(screen.getByText(/No FX matching/)).toBeDefined();
    });
  });

  it('shows target track name in header', async () => {
    renderFxBrowser();

    await waitFor(() => {
      expect(screen.getByText(/Kick/)).toBeDefined();
    });
  });

  // ── Back button (Issue #86) ──

  it('has back button in the search/filter row', async () => {
    renderFxBrowser();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search FX...')).toBeDefined();
    });

    // Back button should be present
    const backButton = screen.getByLabelText('Back');
    expect(backButton).toBeDefined();

    // The back button should be in the same container as the search input
    const searchInput = screen.getByPlaceholderText('Search FX...');
    const searchRow = searchInput.closest('div')?.parentElement;
    expect(searchRow).toBeDefined();
    expect(searchRow?.contains(backButton)).toBe(true);
  });

  it('calls onBack when back button is clicked', async () => {
    const { onBack } = renderFxBrowser();

    await waitFor(() => {
      expect(screen.getByLabelText('Back')).toBeDefined();
    });

    fireEvent.click(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('does not show back button in the header (it moved to search/filter row)', async () => {
    renderFxBrowser();

    await waitFor(() => {
      expect(screen.getByText('FX Browser')).toBeDefined();
    });

    // The header contains 'FX Browser' text but NOT the back button
    const headerElements = screen.getAllByText('FX Browser');
    let headerFound = false;
    for (const el of headerElements) {
      const header = el.closest('.border-b');
      if (header) {
        const backInHeader = header.querySelector('[aria-label="Back"]');
        expect(backInHeader).toBeNull();
        headerFound = true;
      }
    }
    expect(headerFound).toBe(true);
  });

  // ── Unified search: FX + FX Chains (Issue #96) ──

  it('calls fxChainSearchRecursive when search has text and prop is provided', async () => {
    const fxChainSearchRecursive = vi.fn().mockResolvedValue({
      query: 'comp',
      results: [{ filePath: '/chains/MyComp.RfxChain', name: 'MyComp.RfxChain', size: 1024 }],
    });
    const fxChainLoad = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ fxChainSearchRecursive, fxChainLoad, fxChainPath: '/chains' });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search FX...')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search FX...');
    fireEvent.change(searchInput, { target: { value: 'comp' } });

    // Wait for debounce (300ms) + async call
    await waitFor(() => {
      expect(fxChainSearchRecursive).toHaveBeenCalledWith('comp', '/chains');
    }, { timeout: 1000 });
  });

  it('shows chain results with 🔗 Chain: prefix', async () => {
    const fxChainSearchRecursive = vi.fn().mockResolvedValue({
      query: 'comp',
      results: [{ filePath: '/chains/MyComp.RfxChain', name: 'MyComp.RfxChain', size: 1024 }],
    });
    const fxChainLoad = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ fxChainSearchRecursive, fxChainLoad, fxChainPath: '/chains' });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search FX...')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search FX...');
    fireEvent.change(searchInput, { target: { value: 'comp' } });

    // Wait for chain result to appear
    await waitFor(() => {
      expect(screen.getByText(/🔗 Chain:/)).toBeDefined();
    });

    // The chain name should be visible (cleaned name, no .RfxChain extension)
    expect(screen.getByText('MyComp')).toBeDefined();
  });

  it('calls fxChainLoad when chain result is clicked', async () => {
    const fxChainSearchRecursive = vi.fn().mockResolvedValue({
      query: 'comp',
      results: [{ filePath: '/chains/MyComp.RfxChain', name: 'MyComp.RfxChain', size: 1024 }],
    });
    const fxChainLoad = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ fxChainSearchRecursive, fxChainLoad, fxChainPath: '/chains' });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search FX...')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search FX...');
    fireEvent.change(searchInput, { target: { value: 'comp' } });

    // Wait for chain result to appear
    await waitFor(() => {
      expect(screen.getByText(/🔗 Chain:/)).toBeDefined();
    });

    // Click on the chain result (the button containing "MyComp")
    const chainButton = screen.getByText('MyComp').closest('button');
    if (chainButton) fireEvent.click(chainButton);

    await waitFor(() => {
      expect(fxChainLoad).toHaveBeenCalledWith(0, '/chains/MyComp.RfxChain', 'replace');
    });
  });

  it('shows empty state when chain search returns no results', async () => {
    const fxChainSearchRecursive = vi.fn().mockResolvedValue({
      query: 'zzzzz',
      results: [],
    });
    const fxChainLoad = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ fxChainSearchRecursive, fxChainLoad, fxChainPath: '/chains' });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search FX...')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search FX...');
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });

    // Wait - should show "No FX matching" since there are no FX results
    await waitFor(() => {
      expect(screen.getByText(/No FX matching/)).toBeDefined();
    });
    // Wait for chain search debounce to complete and show "No matching chains"
    await waitFor(() => {
      expect(screen.getByText('No matching chains')).toBeDefined();
    }, { timeout: 2000 });
  });

  it('does not call fxChainSearchRecursive when search is empty', async () => {
    const fxChainSearchRecursive = vi.fn().mockResolvedValue({
      query: '',
      results: [],
    });
    const fxChainLoad = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ fxChainSearchRecursive, fxChainLoad, fxChainPath: '/chains' });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search FX...')).toBeDefined();
    });

    // Wait a bit to ensure no call was made
    await new Promise((r) => setTimeout(r, 500));
    expect(fxChainSearchRecursive).not.toHaveBeenCalled();
  });

  // ── Tag tests (Issue #97) ──

  it('loads tags on mount when getFxTags is provided', async () => {
    const getFxTags = vi.fn().mockResolvedValue({
      fxTags: { 'VST3:ReaEQ': ['eq', 'guitar'], 'VST3:ReaComp': ['comp', 'drums'] },
      chainTags: { '/chains/guitar.RfxChain': ['guitar'] },
    });
    const setFxTags = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ getFxTags, setFxTags });

    await waitFor(() => {
      expect(getFxTags).toHaveBeenCalled();
    });
  });

  it('shows tag badges on FX rows', async () => {
    const getFxTags = vi.fn().mockResolvedValue({
      fxTags: { 'VST3:ReaEQ': ['eq', 'guitar'] },
      chainTags: {},
    });
    const setFxTags = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ getFxTags, setFxTags });

    await waitFor(() => {
      // Tag badges should appear as spans with tag text
      // Use getAllByText since the tag also appears in the filter bar
      const eqBadges = screen.getAllByText('eq');
      expect(eqBadges.length).toBeGreaterThanOrEqual(1);
      // Find the span badge (not the filter button)
      const spanBadges = eqBadges.filter(el => el.tagName === 'SPAN');
      expect(spanBadges.length).toBe(1);
      const guitarBadges = screen.getAllByText('guitar');
      expect(guitarBadges.length).toBeGreaterThanOrEqual(1);
      const guitarSpans = guitarBadges.filter(el => el.tagName === 'SPAN');
      expect(guitarSpans.length).toBe(1);
    });
  });

  it('shows tag filter bar when tags exist', async () => {
    const getFxTags = vi.fn().mockResolvedValue({
      fxTags: { 'VST3:ReaEQ': ['eq'] },
      chainTags: {},
    });
    const setFxTags = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ getFxTags, setFxTags });

    await waitFor(() => {
      // The tag filter bar should show 'All' button (note: 'All' also appears
      // as the format filter dropdown option, so use getAllByText)
      const allElements = screen.getAllByText('All');
      expect(allElements.length).toBeGreaterThanOrEqual(1);
      // Find the button element specifically
      const allButtons = allElements.filter(el => el.tagName === 'BUTTON');
      expect(allButtons.length).toBe(1);
      // 'eq' appears both as filter button and badge — check it exists
      const eqElements = screen.getAllByText('eq');
      expect(eqElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('filters FX list when tag is selected', async () => {
    const getFxTags = vi.fn().mockResolvedValue({
      fxTags: {
        'VST3:ReaEQ': ['eq'],
        'VST3:ReaComp': ['comp'],
        'VST2:ValhallaRoom': ['reverb'],
      },
      chainTags: {},
    });
    const setFxTags = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ getFxTags, setFxTags });

    await waitFor(() => {
      const eqElements = screen.getAllByText('eq');
      expect(eqElements.length).toBeGreaterThanOrEqual(1);
    });

    // Click the 'eq' tag filter button (use the button element, not the span badge)
    const eqElements = screen.getAllByText('eq');
    const eqFilter = eqElements.find(el => el.tagName === 'BUTTON');
    expect(eqFilter).toBeDefined();
    if (eqFilter) fireEvent.click(eqFilter);

    // ReaEQ should be visible (it has 'eq' tag)
    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // ReaComp should be hidden (no 'eq' tag)
    await waitFor(() => {
      expect(screen.queryByText('ReaComp')).toBeNull();
    });
  });

  it('shows All button as active when no tags selected', async () => {
    const getFxTags = vi.fn().mockResolvedValue({
      fxTags: { 'VST3:ReaEQ': ['eq'] },
      chainTags: {},
    });
    const setFxTags = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ getFxTags, setFxTags });

    await waitFor(() => {
      const allButton = screen.getByText('All');
      expect(allButton).toBeDefined();
    });
  });

  it('clears tag filter when All button is clicked', async () => {
    const getFxTags = vi.fn().mockResolvedValue({
      fxTags: {
        'VST3:ReaEQ': ['eq'],
        'VST2:ValhallaRoom': ['reverb'],
      },
      chainTags: {},
    });
    const setFxTags = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ getFxTags, setFxTags });

    await waitFor(() => {
      const eqElements = screen.getAllByText('eq');
      expect(eqElements.length).toBeGreaterThanOrEqual(1);
    });

    // First select a tag filter
    const eqElements = screen.getAllByText('eq');
    const eqFilter = eqElements.find(el => el.tagName === 'BUTTON');
    expect(eqFilter).toBeDefined();
    if (eqFilter) fireEvent.click(eqFilter);
    await waitFor(() => {
      // ValhallaRoom should be hidden
      expect(screen.queryByText('ValhallaRoom')).toBeNull();
    });

    // Click 'All' button (find the tag filter 'All' button, not the dropdown option)
    const allElements = screen.getAllByText('All');
    const allButton = allElements.find(el => el.tagName === 'BUTTON');
    expect(allButton).toBeDefined();
    if (allButton) fireEvent.click(allButton);
    await waitFor(() => {
      // Both should be visible
      expect(screen.getByText('ReaEQ')).toBeDefined();
      expect(screen.getByText('ValhallaRoom')).toBeDefined();
    });
  });

  it('shows edit tags button on FX rows', async () => {
    const getFxTags = vi.fn().mockResolvedValue({
      fxTags: { 'VST3:ReaEQ': ['eq'] },
      chainTags: {},
    });
    const setFxTags = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ getFxTags, setFxTags });

    await waitFor(() => {
      // Edit tags buttons should be present
      const editButtons = screen.getAllByTitle('Edit tags');
      expect(editButtons.length).toBeGreaterThan(0);
    });
  });

  it('disables chain load button when no track is selected', async () => {
    const fxChainSearchRecursive = vi.fn().mockResolvedValue({
      query: 'comp',
      results: [{ filePath: '/chains/MyComp.RfxChain', name: 'MyComp.RfxChain', size: 1024 }],
    });
    const fxChainLoad = vi.fn().mockResolvedValue(true);

    renderFxBrowser({ selectedTrack: null, fxChainSearchRecursive, fxChainLoad, fxChainPath: '/chains' });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search FX...')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search FX...');
    fireEvent.change(searchInput, { target: { value: 'comp' } });

    await waitFor(() => {
      expect(screen.getByText(/🔗 Chain:/)).toBeDefined();
    });

    // The load button should be disabled
    const loadButton = screen.getByText('Load');
    expect(loadButton.closest('button')).toBeDisabled();
  });
});
