import { useState, useCallback } from 'react';
import { useSlicer, type SlicePoint } from '../hooks/useSlicer';
import { useReaperClient } from '../hooks/useReaperClient';

// ── Props ──────────────────────────────────────────────

interface SlicerPanelProps {
  onBack: () => void;
}

// ── Component ──────────────────────────────────────────

export default function SlicerPanel({ onBack }: SlicerPanelProps) {
  const { detectSlices, applyToRS5K } = useSlicer();
  const { send } = useReaperClient();

  // File selection
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [browsePath, setBrowsePath] = useState('/');
  const [browseEntries, setBrowseEntries] = useState<{ name: string; type: string }[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  // Detection state
  const [sensitivity, setSensitivity] = useState(50); // 0-100 slider → 0.0-1.0
  const [slices, setSlices] = useState<SlicePoint[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sliceCount: number;
    trackIdx: number;
    baseNote: number;
  } | null>(null);

  // File browser
  const loadDirectory = useCallback(async (path: string) => {
    setBrowseLoading(true);
    try {
      const resp = await send('sample/getDirectory', { path, limit: 200 });
      if (resp.success) {
        const p = resp.payload as Record<string, unknown>;
        setBrowsePath(p.path as string);
        setBrowseEntries(p.entries as { name: string; type: string }[]);
      }
    } catch {
      // ignore
    }
    setBrowseLoading(false);
  }, [send]);

  const handleBrowseOpen = useCallback(() => {
    setShowFileBrowser(true);
    loadDirectory('/');
  }, [loadDirectory]);

  const handleBrowseEntryClick = useCallback(
    async (entry: { name: string; type: string }) => {
      if (entry.type === 'dir') {
        const newPath =
          entry.name === '..'
            ? browsePath.substring(0, browsePath.lastIndexOf('/', browsePath.length - 2) + 1) || '/'
            : browsePath + (browsePath.endsWith('/') ? '' : '/') + entry.name;
        await loadDirectory(newPath);
      } else {
        // File selected
        const fullPath =
          browsePath + (browsePath.endsWith('/') ? '' : '/') + entry.name;
        setFilePath(fullPath);
        setFileName(entry.name);
        setShowFileBrowser(false);
        setSlices(null);
        setResult(null);
        setStatus(null);
      }
    },
    [browsePath, loadDirectory],
  );

  const handleBrowseParent = useCallback(async () => {
    const parent = browsePath.substring(0, browsePath.lastIndexOf('/', browsePath.length - 2) + 1) || '/';
    await loadDirectory(parent);
  }, [browsePath, loadDirectory]);

  // Detect slices
  const handleDetect = useCallback(async () => {
    if (!filePath) return;
    setDetecting(true);
    setStatus('Detecting slices...');
    setSlices(null);
    setResult(null);

    const sens = sensitivity / 100;
    const result = await detectSlices(filePath, sens);

    if (result && result.slices && result.slices.length > 0) {
      setSlices(result.slices);
      setStatus(`Detected ${result.slices.length} slices`);
    } else {
      setStatus('No slices detected. Try adjusting sensitivity.');
    }
    setDetecting(false);
  }, [filePath, sensitivity, detectSlices]);

  // Apply to RS5K
  const handleApply = useCallback(async () => {
    if (!filePath || !slices) return;
    setApplying(true);
    setStatus('Creating RS5K instances...');

    const sens = sensitivity / 100;
    const r = await applyToRS5K(filePath, sens);

    if (r) {
      setResult({ sliceCount: r.sliceCount, trackIdx: r.trackIdx, baseNote: r.baseNote });
      setStatus(`Created ${r.sliceCount} RS5K instances on track ${r.trackIdx}`);
    } else {
      setStatus('Failed to create RS5K instances. Is ReaSamplOmatic5000 installed?');
    }
    setApplying(false);
  }, [filePath, sensitivity, slices, applyToRS5K]);

  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
  };

  // ── Render ────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700">
        <button
          onClick={onBack}
          className="text-blue-400 hover:text-blue-300 text-sm"
        >
          ← Back
        </button>
        <h2 className="text-lg font-semibold">🔪 Slicer</h2>
      </div>

      {/* File selection */}
      <div className="mb-3">
        <label className="block text-xs text-gray-400 mb-1">Source File</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={filePath}
            readOnly
            placeholder="Select an audio file..."
            className="flex-1 bg-gray-800 text-white text-sm px-2 py-1.5 rounded border border-gray-600"
          />
          <button
            onClick={handleBrowseOpen}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded"
          >
            Browse
          </button>
        </div>
        {fileName && (
          <p className="text-xs text-green-400 mt-1">{fileName}</p>
        )}
      </div>

      {/* Sensitivity slider */}
      <div className="mb-3">
        <label className="block text-xs text-gray-400 mb-1">
          Sensitivity: {sensitivity}% ({((sensitivity / 100) * 5).toFixed(1)}σ)
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={sensitivity}
          onChange={(e) => {
            setSensitivity(Number(e.target.value));
            setSlices(null);
            setResult(null);
            setStatus(null);
          }}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>More slices</span>
          <span>Fewer slices</span>
        </div>
      </div>

      {/* Detect button */}
      <button
        onClick={handleDetect}
        disabled={!filePath || detecting}
        className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded mb-3 transition-colors"
      >
        {detecting ? 'Detecting...' : '🔍 Detect Slices'}
      </button>

      {/* Status */}
      {status && (
        <div className="text-sm mb-2 text-gray-300">{status}</div>
      )}

      {/* Slice preview / waveform markers */}
      {slices && slices.length > 0 && (
        <div className="mb-3 flex-1 overflow-auto">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-300">
              Slices ({slices.length})
            </h3>
            <span className="text-xs text-gray-500">
              Base note: C2
            </span>
          </div>

          {/* Waveform markers — simplified visual */}
          <div className="bg-gray-800 rounded p-2 mb-2">
            <div className="relative h-10 bg-gray-750 rounded overflow-hidden">
              {slices.map((slice, i) => {
                const totalDuration = slices[slices.length - 1].endTime;
                const leftPct = totalDuration > 0
                  ? (slice.startTime / totalDuration) * 100
                  : 0;
                const widthPct = totalDuration > 0
                  ? (slice.duration / totalDuration) * 100
                  : 0;
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-full bg-blue-500/20 border-l border-blue-400"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 0.5)}%`,
                    }}
                    title={`${slice.label}: ${formatTime(slice.startTime)} - ${formatTime(slice.endTime)}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Slice list */}
          <div className="max-h-40 overflow-y-auto text-xs space-y-0.5">
            {slices.map((slice, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1 hover:bg-gray-750 rounded"
              >
                <span className="text-blue-400 w-16 shrink-0">{slice.label}</span>
                <span className="text-gray-400 w-20 shrink-0">
                  {formatTime(slice.startTime)}
                </span>
                <span className="text-gray-600">→</span>
                <span className="text-gray-400 w-20 shrink-0">
                  {formatTime(slice.endTime)}
                </span>
                <span className="text-gray-500">
                  ({slice.duration.toFixed(2)}s)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Apply button */}
      {slices && slices.length > 0 && (
        <button
          onClick={handleApply}
          disabled={applying}
          className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded transition-colors mb-2"
        >
          {applying ? 'Creating...' : '🎛️ Generate RS5K Track'}
        </button>
      )}

      {/* Result info */}
      {result && (
        <div className="bg-green-900/40 border border-green-700 rounded p-2 text-sm">
          <p className="text-green-400">
            ✓ Created {result.sliceCount} RS5K instances on track {result.trackIdx}
          </p>
          <p className="text-gray-400 text-xs mt-1">
            MIDI notes start at C2 ({result.baseNote}). Each slice maps to
            consecutive notes.
          </p>
        </div>
      )}

      {/* File browser modal */}
      {showFileBrowser && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-gray-800 rounded-lg w-[90vw] max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-gray-700">
              <h3 className="text-sm font-medium">Select File</h3>
              <button
                onClick={() => setShowFileBrowser(false)}
                className="text-gray-400 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>
            <div className="p-2 text-xs text-gray-500 border-b border-gray-700">
              Current: {browsePath}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {browseLoading ? (
                <div className="text-center text-gray-400 py-8">Loading...</div>
              ) : (
                <div className="space-y-0.5">
                  {browsePath !== '/' && (
                    <button
                      onClick={handleBrowseParent}
                      className="w-full text-left px-2 py-1.5 text-gray-400 hover:bg-gray-700 rounded"
                    >
                      📁 ..
                    </button>
                  )}
                  {browseEntries.map((entry, i) => (
                    <button
                      key={i}
                      onClick={() => handleBrowseEntryClick(entry)}
                      className="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded text-sm"
                    >
                      {entry.type === 'dir' ? '📁 ' : '🎵 '}
                      {entry.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
