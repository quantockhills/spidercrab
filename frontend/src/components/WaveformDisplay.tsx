import { useRef, useEffect, useCallback, useState } from 'react';

interface WaveformDisplayProps {
  /** Waveform peaks (normalized 0-1) */
  peaks: Float32Array | null;
  /** Current playback position as fraction [0, 1] */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Whether the clip is in reverse mode */
  reverse?: boolean;
  /** Click-to-seek callback (fraction 0-1) */
  onSeek?: (fraction: number) => void;
  /** Component height in pixels */
  height?: number;
  /** Optional className */
  className?: string;
}

/**
 * Canvas-based waveform display with playhead and played/unplayed coloring.
 * Supports click-to-seek and reverse visual indicator.
 */
export function WaveformDisplay({
  peaks,
  currentTime,
  duration,
  isPlaying,
  reverse = false,
  onSeek,
  height = 80,
  className = '',
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Set canvas size accounting for device pixel ratio
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, w, h);

    if (!peaks || peaks.length === 0) {
      // Draw placeholder
      ctx.strokeStyle = 'var(--border, #444)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.fillStyle = 'var(--text-secondary, #888)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No waveform data', w / 2, h / 2 + 4);
      return;
    }

    const playheadX = duration > 0 ? (currentTime / duration) * w : 0;
    const midY = h / 2;
    const barWidth = w / peaks.length;

    // Draw background
    ctx.fillStyle = 'var(--bg-tertiary, #222)';
    ctx.fillRect(0, 0, w, h);

    // Draw waveform
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth;
      const amp = peaks[i] * (h * 0.4);
      const xRight = x + Math.max(1, barWidth - 1);

      // Determine if this peak is played or unplayed
      const peakFraction = i / peaks.length;
      const isPlayed = peakFraction <= (duration > 0 ? currentTime / duration : 0);

      if (isPlayed) {
        // Played region: accent color
        ctx.fillStyle = 'var(--accent-orange, #e8883a)';
      } else {
        // Unplayed region: dimmer
        ctx.fillStyle = 'var(--text-secondary, #666)';
      }

      ctx.fillRect(x, midY - amp, xRight - x, amp * 2);
    }

    // Draw playhead line
    ctx.strokeStyle = 'var(--accent-orange, #e8883a)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();

    // Draw playhead triangle
    ctx.fillStyle = 'var(--accent-orange, #e8883a)';
    ctx.beginPath();
    ctx.moveTo(playheadX - 5, 0);
    ctx.lineTo(playheadX + 5, 0);
    ctx.lineTo(playheadX, 6);
    ctx.closePath();
    ctx.fill();

    // Reverse badge
    if (reverse) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'var(--accent-orange, #e8883a)';
      ctx.fillText('↔ REV', w - 4, h - 4);
    }
  }, [peaks, currentTime, duration, isPlaying, reverse]);

  // Handle click/touch to seek
  const getFractionFromEvent = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!onSeek) return;
    setIsDragging(true);
    const fraction = getFractionFromEvent(e.clientX);
    onSeek(fraction);
    e.preventDefault();
  }, [onSeek, getFractionFromEvent]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !onSeek) return;
    const fraction = getFractionFromEvent(e.clientX);
    onSeek(fraction);
  }, [isDragging, onSeek, getFractionFromEvent]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full touch-none select-none ${className}`}
      style={{ height: `${height}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
}
