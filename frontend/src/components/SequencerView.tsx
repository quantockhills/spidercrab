import { useState, useCallback, useEffect, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────

export interface StepData {
  column: number;
  row: number;
  active: boolean;
  velocity: number;
  note: number;
}

export interface SequencerData {
  columns: number;
  rows: number;
  length: number;
  baseNote: number;
  playhead: number;
  steps: StepData[];
}

interface SequencerViewProps {
  sequencer: SequencerData | null;
  getSequencer: () => Promise<SequencerData | null>;
  toggleStep: (column: number, row: number) => Promise<StepData | null>;
  setStep: (column: number, row: number, active: boolean, velocity?: number) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  setLength: (length: number) => Promise<boolean>;
  setBaseNote: (note: number) => Promise<boolean>;
}

// ── Note names for display ──

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteName(midiNote: number): string {
  const octave = Math.floor(midiNote / 12) - 1;
  const note = NOTE_NAMES[midiNote % 12];
  return `${note}${octave}`;
}

// ── Component ────────────────────────────────────────────────

export function SequencerView({
  sequencer,
  getSequencer,
  toggleStep,
  setStep,
  clearAll,
  setLength,
  setBaseNote,
}: SequencerViewProps) {
  const [loading, setLoading] = useState(!sequencer);
  const [lengthInput, setLengthInput] = useState(sequencer?.length ?? 16);
  const [velocityMode, setVelocityMode] = useState(false);
  const [velocityEdit, setVelocityEdit] = useState<{col: number; row: number} | null>(null);
  const [velocityValue, setVelocityValue] = useState(100);
  const [selectedNote, setSelectedNote] = useState(36);
  const initializedRef = useRef(false);

  // Load sequencer on mount
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      getSequencer().then(() => setLoading(false));
    }
  }, [getSequencer]);

  // Sync length input from data
  useEffect(() => {
    if (sequencer) {
      setLengthInput(sequencer.length);
    }
  }, [sequencer?.length]);

  const handleToggleStep = useCallback(async (col: number, row: number) => {
    if (velocityMode) {
      setVelocityEdit({ col, row });
      const step = sequencer?.steps.find(s => s.column === col && s.row === row);
      setVelocityValue(step?.velocity ?? 100);
      return;
    }
    await toggleStep(col, row);
  }, [toggleStep, velocityMode, sequencer]);

  const handleVelocitySubmit = useCallback(async () => {
    if (!velocityEdit) return;
    await setStep(velocityEdit.col, velocityEdit.row, true, velocityValue);
    setVelocityEdit(null);
  }, [velocityEdit, velocityValue, setStep]);

  const handleLengthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= 64) {
      setLengthInput(val);
      setLength(val);
    }
  }, [setLength]);

  const handleBaseNoteChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const note = parseInt(e.target.value, 10);
    setSelectedNote(note);
    setBaseNote(note);
  }, [setBaseNote]);

  const handleClearAll = useCallback(async () => {
    await clearAll();
    await getSequencer();
  }, [clearAll, getSequencer]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
        Loading sequencer…
      </div>
    );
  }

  if (!sequencer) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
        No sequencer data available
      </div>
    );
  }

  const rows = sequencer.rows;
  const cols = sequencer.columns;

  // Build lookup: "col,row" -> StepData
  const stepMap = new Map<string, StepData>();
  for (const step of sequencer.steps) {
    stepMap.set(`${step.column},${step.row}`, step);
  }

  const page = Math.floor(sequencer.playhead / cols) * cols;
  const visibleSteps = Array.from({ length: cols }, (_, c) => page + c);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Step Sequencer
        </h2>
        <div className="flex items-center gap-2">
          {/* Velocity mode toggle */}
          <button
            onClick={() => setVelocityMode(!velocityMode)}
            className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              velocityMode
                ? 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)] ring-1 ring-[var(--accent-orange)]/50'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
            }`}
          >
            {velocityMode ? 'VEL' : 'Note'}
          </button>
          <button
            onClick={handleClearAll}
            className="p-1.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent-red)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
            title="Clear all steps"
          >
            ✕ Clear
          </button>
          <button
            onClick={() => getSequencer()}
            className="p-1.5 hover:bg-[var(--bg-tertiary)] active:brightness-95 transition-colors text-sm"
            title="Refresh sequencer"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-[var(--text-secondary)] border-b border-[var(--border)] bg-[var(--bg-secondary)]/50 flex-wrap">
        <label className="flex items-center gap-1">
          Length:
          <input
            type="number"
            min={1}
            max={64}
            value={lengthInput}
            onChange={handleLengthChange}
            className="w-10 px-1 py-0.5 bg-[var(--bg-tertiary)] text-center rounded text-[var(--text-primary)] text-[10px]"
          />
        </label>
        <label className="flex items-center gap-1">
          Base Note:
          <select
            value={sequencer.baseNote}
            onChange={handleBaseNoteChange}
            className="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-primary)] text-[10px]"
          >
            {Array.from({ length: 7 }, (_, i) => {
              const note = 24 + i * 12; // C1 through C7
              return (
                <option key={note} value={note}>
                  {noteName(note)}
                </option>
              );
            })}
          </select>
        </label>
        <span className="ml-auto">
          Playhead: step {sequencer.playhead + 1} / {sequencer.length}
        </span>
      </div>

      {/* Velocity editor popup */}
      {velocityEdit && (
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-tertiary)] flex items-center gap-3">
          <span className="text-[10px] text-[var(--text-secondary)]">
            Velocity ({velocityEdit.col},{velocityEdit.row}):
          </span>
          <input
            type="range"
            min={1}
            max={127}
            value={velocityValue}
            onChange={e => setVelocityValue(parseInt(e.target.value, 10))}
            className="flex-1 max-w-[200px]"
          />
          <span className="text-[10px] text-[var(--text-primary)] w-6 text-right">
            {velocityValue}
          </span>
          <button
            onClick={handleVelocitySubmit}
            className="px-2 py-0.5 text-[10px] bg-[var(--accent-green)]/20 text-[var(--accent-green)] rounded hover:brightness-110"
          >
            Set
          </button>
          <button
            onClick={() => setVelocityEdit(null)}
            className="px-2 py-0.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Sequencer grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid gap-px" style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}>
          {Array.from({ length: rows }, (_, row) =>
            Array.from({ length: cols }, (_, col) => {
              const step = stepMap.get(`${col},${row}`);
              const active = step?.active ?? false;
              const velocity = step?.velocity ?? 100;
              const note = step?.note ?? 36;
              const isPlayhead = col === (sequencer.playhead % cols);

              return (
                <button
                  key={`${col}-${row}`}
                  onClick={() => handleToggleStep(col, row)}
                  className={`
                    relative flex flex-col items-center justify-center
                    aspect-square min-h-[36px] min-w-[36px]
                    transition-all duration-75 cursor-pointer overflow-hidden
                    ${isPlayhead ? 'ring-1 ring-[var(--accent-orange)]' : ''}
                    ${active
                      ? 'bg-[var(--accent-green)]/25 hover:bg-[var(--accent-green)]/35'
                      : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]'
                    }
                    active:brightness-90
                  `}
                  data-col={col}
                  data-row={row}
                  data-active={active}
                  aria-label={`Step ${col + 1}, note ${noteName(note)}`}
                >
                  {/* Active indicator */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-0.5 transition-colors ${
                      active ? 'bg-[var(--accent-green)]' : 'bg-transparent'
                    }`}
                  />

                  {/* Note name (always visible) */}
                  <span className={`text-[8px] leading-tight font-medium ${
                    active ? 'text-[var(--accent-green)]' : 'text-[var(--text-secondary)]/60'
                  }`}>
                    {noteName(note)}
                  </span>

                  {/* Velocity indicator (when active) */}
                  {active && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <div
                        className="h-1 rounded-full bg-[var(--accent-green)]/50"
                        style={{ width: `${Math.round(velocity / 127 * 20)}px` }}
                      />
                    </div>
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>

      {/* Step indicator bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)]/50 overflow-x-auto">
        {Array.from({ length: sequencer.length }, (_, i) => (
          <div
            key={i}
            className={`flex-shrink-0 w-4 h-1.5 rounded-sm transition-colors ${
              i === sequencer.playhead
                ? 'bg-[var(--accent-orange)]'
                : i < sequencer.length
                  ? 'bg-[var(--bg-tertiary)]'
                  : 'bg-transparent'
            }`}
            title={`Step ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
