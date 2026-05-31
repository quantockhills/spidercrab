import { useState, useCallback, useEffect, useRef } from 'react';
import type { MatrixData, ClipSlot } from '../hooks/useReaper';

interface SessionViewProps {
  matrix: MatrixData | null;
  getMatrix: () => Promise<MatrixData | null>;
  triggerSlot: (column: number, row: number) => Promise<ClipSlot | null>;
  triggerScene: (row: number) => Promise<ClipSlot[] | null>;
  onEvent?: (pattern: string, handler: (data: any) => void) => () => void;
}

/** Map slot state to CSS class name */
function stateClass(state: ClipSlot['state']): string {
  switch (state) {
    case 'empty':     return 'slot-empty';
    case 'stopped':   return 'slot-stopped';
    case 'playing':   return 'slot-playing';
    case 'recording': return 'slot-recording';
  }
}

/** Map slot state to display color hex (for the cell accent) */
function stateColor(state: ClipSlot['state']): string {
  switch (state) {
    case 'empty':     return 'var(--text-secondary)';
    case 'stopped':   return 'var(--accent-dim)';
    case 'playing':   return 'var(--accent-green)';
    case 'recording': return 'var(--accent-red)';
  }
}

export function SessionView({
  matrix,
  getMatrix,
  triggerSlot,
  triggerScene,
  onEvent,
}: SessionViewProps) {
  const [loading, setLoading] = useState(!matrix);
  const [activeScene, setActiveScene] = useState<number | null>(null);
  const initializedRef = useRef(false);

  // Load matrix on mount if not provided
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      getMatrix().then(() => setLoading(false));
    }
  }, [getMatrix]);

  // Subscribe to slotStateChanged events for real-time updates
  useEffect(() => {
    if (!onEvent) return;
    const unsub = onEvent('event:slotStateChanged', (msg: any) => {
      // Matrix state is managed externally via the prop — parent re-renders
      // This hook allows future integration for optimistic UI updates
    });
    return unsub;
  }, [onEvent]);

  const handleSlotTap = useCallback(async (col: number, row: number) => {
    await triggerSlot(col, row);
  }, [triggerSlot]);

  const handleSceneLaunch = useCallback(async (row: number) => {
    setActiveScene(row);
    await triggerScene(row);
    setActiveScene(null);
  }, [triggerScene]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
        Loading clip matrix…
      </div>
    );
  }

  if (!matrix) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
        No matrix data available
      </div>
    );
  }

  const rows = matrix.rows;
  const cols = matrix.columns;

  // Build a lookup: "col,row" -> ClipSlot
  const slotMap = new Map<string, ClipSlot>();
  for (const slot of matrix.slots) {
    slotMap.set(`${slot.column},${slot.row}`, slot);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Session View
        </h2>
        <button
          onClick={() => getMatrix()}
          className="p-2 hover:bg-[var(--bg-tertiary)] active:brightness-95 transition-colors text-sm"
          title="Refresh matrix"
        >
          ↻
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-[var(--text-secondary)] border-b border-[var(--border)]">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--text-secondary)]/30" /> Empty
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent-dim)]" /> Stopped
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent-green)]" /> Playing
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent-red)]" /> Recording
        </span>
      </div>

      {/* Grid area */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid gap-px" style={{
          gridTemplateColumns: `repeat(${cols}, 1fr) 32px`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}>
          {/* Clip slots */}
          {Array.from({ length: rows }, (_, row) =>
            Array.from({ length: cols }, (_, col) => {
              const slot = slotMap.get(`${col},${row}`);
              const state = slot?.state ?? 'empty';
              const color = stateColor(state);
              const name = slot?.name ?? '';
              const clipType = slot?.clipType ?? 'none';

              return (
                <button
                  key={`${col}-${row}`}
                  onClick={() => handleSlotTap(col, row)}
                  className={`
                    relative flex flex-col items-center justify-center
                    aspect-square min-h-[44px] min-w-[44px]
                    bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]
                    active:brightness-90 transition-all duration-75
                    cursor-pointer overflow-hidden
                    ${state === 'playing' ? 'ring-1 ring-[var(--accent-green)]' : ''}
                    ${state === 'recording' ? 'ring-1 ring-[var(--accent-red)] animate-pulse' : ''}
                    ${state === 'stopped' ? 'opacity-80' : ''}
                  `}
                  data-col={col}
                  data-row={row}
                  data-state={state}
                  aria-label={`Slot ${col + 1},${row + 1}`}
                >
                  {/* Color accent bar at top */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: color }}
                  />

                  {/* Clip type icon */}
                  {clipType === 'midi' && (
                    <span className="text-[10px] opacity-50">♪</span>
                  )}
                  {clipType === 'audio' && (
                    <span className="text-[10px] opacity-50">🔊</span>
                  )}

                  {/* Clip name (truncated) */}
                  {name && (
                    <span className="text-[9px] leading-tight text-center px-0.5 truncate w-full mt-0.5">
                      {name}
                    </span>
                  )}

                  {/* State indicator icon */}
                  {state === 'playing' && (
                    <span className="absolute bottom-0.5 right-0.5 text-[8px] opacity-70">▶</span>
                  )}
                  {state === 'recording' && (
                    <span className="absolute bottom-0.5 right-0.5 text-[8px] text-[var(--accent-red)] opacity-80">●</span>
                  )}
                </button>
              );
            }),
          )}

          {/* Scene launch buttons (right column) */}
          {Array.from({ length: rows }, (_, row) => (
            <button
              key={`scene-${row}`}
              onClick={() => handleSceneLaunch(row)}
              className={`
                flex items-center justify-center
                aspect-square min-h-[44px] min-w-[32px]
                text-[10px] font-semibold
                transition-colors active:brightness-90 cursor-pointer
                ${activeScene === row
                  ? 'bg-[var(--accent-orange)]/30 text-[var(--accent-orange)] ring-1 ring-[var(--accent-orange)]/50'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                }
              `}
              aria-label={`Scene ${row + 1}`}
            >
              Scene {row + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
