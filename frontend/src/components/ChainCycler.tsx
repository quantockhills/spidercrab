import { useState, useCallback } from 'react';
import type { FxInfo } from '../hooks/useReaper';

interface ChainCyclerProps {
  trackIdx: number;
  chainPath: string;
  chainName: string;
  fxCount: number;
  fxChainCycle: (trackIdx: number, direction: 'next' | 'prev', chainPath?: string) => Promise<{success: boolean; fx?: FxInfo[]}>;
  getTrackFx: (trackIdx: number) => Promise<FxInfo[]>;
  onDone: () => void;
  onFxChanged: (fx: FxInfo[]) => void;
}

export function ChainCycler({
  trackIdx,
  chainPath,
  chainName,
  fxCount,
  fxChainCycle,
  getTrackFx,
  onDone,
  onFxChanged,
}: ChainCyclerProps) {
  const [cycling, setCycling] = useState(false);
  const [currentName, setCurrentName] = useState(chainName);
  const [error, setError] = useState<string | null>(null);

  const handlePrev = useCallback(async () => {
    setCycling(true);
    setError(null);
    try {
      const result = await fxChainCycle(trackIdx, 'prev', chainPath);
      if (result.success && result.fx) {
        onFxChanged(result.fx);
        // Update the displayed name from the new FX list
        const firstFx = result.fx[0];
        if (firstFx?.chainPath) {
          const name = firstFx.chainPath.split('/').pop()?.split('\\').pop() || '';
          setCurrentName(name);
        }
      } else {
        setError('No more chains');
      }
    } catch {
      setError('Failed to cycle');
    } finally {
      setCycling(false);
    }
  }, [trackIdx, chainPath, fxChainCycle, onFxChanged]);

  const handleNext = useCallback(async () => {
    setCycling(true);
    setError(null);
    try {
      const result = await fxChainCycle(trackIdx, 'next', chainPath);
      if (result.success && result.fx) {
        onFxChanged(result.fx);
        const firstFx = result.fx[0];
        if (firstFx?.chainPath) {
          const name = firstFx.chainPath.split('/').pop()?.split('\\').pop() || '';
          setCurrentName(name);
        }
      } else {
        setError('No more chains');
      }
    } catch {
      setError('Failed to cycle');
    } finally {
      setCycling(false);
    }
  }, [trackIdx, chainPath, fxChainCycle, onFxChanged]);

  // Extract just the filename from the path
  const displayName = currentName || chainName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        // Close if clicking overlay background
        if (e.target === e.currentTarget) onDone();
      }}
    >
      <div className="bg-[var(--bg-primary)] ring-2 ring-[var(--accent-green)] p-6 w-80 shadow-xl">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-1">
            Chain Cycler
          </div>
          <div className="text-lg font-semibold text-[var(--accent-green)] truncate">
            {displayName}
          </div>
          <div className="text-xs text-[var(--text-tertiary)] mt-1">
            {fxCount} FX in chain
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-[var(--accent-red)] text-center mb-3">
            {error}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={handlePrev}
            disabled={cycling}
            className="flex-1 py-3 text-sm font-semibold bg-[var(--bg-tertiary)] text-[var(--text-primary)] active:brightness-95 disabled:opacity-40 transition-colors"
          >
            ◀ Prev
          </button>
          <button
            onClick={handleNext}
            disabled={cycling}
            className="flex-1 py-3 text-sm font-semibold bg-[var(--bg-tertiary)] text-[var(--text-primary)] active:brightness-95 disabled:opacity-40 transition-colors"
          >
            Next ▶
          </button>
        </div>

        {/* Done button */}
        <button
          onClick={onDone}
          className="w-full py-2.5 text-sm font-semibold bg-[var(--accent-green)]/25 text-[var(--accent-green)] active:brightness-95 transition-colors"
        >
          Done
        </button>

        {/* Loading indicator */}
        {cycling && (
          <div className="text-center mt-2 text-xs text-[var(--text-secondary)] animate-pulse">
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
