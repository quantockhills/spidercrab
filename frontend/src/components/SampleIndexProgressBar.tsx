import { useState, useEffect, useRef } from 'react';

interface SampleIndexProgressBarProps {
  onEvent: (pattern: string, handler: (data: unknown) => void) => () => void;
}

interface ProgressPayload {
  scanned?: number;
  total?: number;
  status?: string;
}

interface CompletePayload {
  total?: number;
  rootPath?: string;
}

export default function SampleIndexProgressBar({ onEvent }: SampleIndexProgressBarProps) {
  const [visible, setVisible] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [total, setTotal] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubProgress = onEvent('event:sampleIndexProgress', (msg: unknown) => {
      const m = msg as { payload?: ProgressPayload };
      const payload = m.payload || {};
      setScanned(payload.scanned ?? 0);
      setTotal(payload.total ?? 0);
      setVisible(true);
      setFadingOut(false);

      // Clear any pending hide timer
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    });

    const unsubComplete = onEvent('event:sampleIndexComplete', () => {
      // Start fade-out animation
      setFadingOut(true);
      // After animation, hide the component
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
        setFadingOut(false);
      }, 500);
    });

    return () => {
      unsubProgress();
      unsubComplete();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [onEvent]);

  if (!visible) return null;

  const progress = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0;

  return (
    <div className={`transition-opacity duration-300 ${fadingOut ? 'opacity-0' : 'opacity-100'}`}>
      <div className="bg-[var(--bg-tertiary)] px-4 py-2 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-[var(--text-secondary)]">
            Indexing samples: {scanned}/{total} files...
          </span>
          <span className="text-[11px] font-mono text-[var(--text-secondary)]">
            {progress}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-[var(--bg-secondary)] overflow-hidden">
          <div
            className="h-full bg-[var(--accent-orange)] transition-all duration-200 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
