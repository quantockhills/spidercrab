import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * Resolve a CSS custom property value from the document root.
 * Falls back to `fallback` if the variable is not defined.
 * Canvas 2D context does NOT resolve `var()` syntax, so we must
 * eagerly read the computed value at draw time.
 */
function resolveCSSVar(name: string, fallback: string): string {
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || fallback;
  } catch {
    return fallback;
  }
}

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
  /** Region trim handles: left marker position, fraction [0, 1]. Defaults to 0. */
  selectionStart?: number;
  /** Region trim handles: right marker position, fraction [0, 1]. Defaults to 1. */
  selectionEnd?: number;
  /** Called while dragging either handle, with the updated (start, end) fractions */
  onSelectionChange?: (start: number, end: number) => void;
  /** Component height in pixels */
  height?: number;
  /** Optional className */
  className?: string;
}

// Minimum gap between handles so they can never fully collide (fraction of width)
const MIN_HANDLE_GAP = 0.01;
// How close a touch needs to land to a handle to grab it, in CSS pixels
const HANDLE_HIT_RADIUS = 18;

/**
 * Canvas-based waveform display with playhead and played/unplayed coloring.
 * Supports click-to-seek, a reverse indicator, and a draggable L/R region
 * selection (trim handles default to the start and end of the file, so
 * ignoring them behaves exactly like before — the "selection" is the whole
 * file until a handle is moved).
 */
export function WaveformDisplay({
  peaks,
  currentTime,
  duration,
  isPlaying,
  reverse = false,
  onSeek,
  selectionStart = 0,
  selectionEnd = 1,
  onSelectionChange,
  height = 80,
  className = '',
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragHandleRef = useRef<'start' | 'end' | null>(null);

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

    // Resolve CSS variable colors for canvas 2D (does not support var() syntax)
    const bgColor = resolveCSSVar('--bg-tertiary', '#222');
    const accentColor = resolveCSSVar('--accent-orange', '#e8883a');
    const textColor = resolveCSSVar('--text-secondary', '#666');
    const borderColor = resolveCSSVar('--border', '#444');

    if (!peaks || peaks.length === 0) {
      // Draw placeholder
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No waveform data', w / 2, h / 2 + 4);
      return;
    }

    const playheadX = duration > 0 ? (currentTime / duration) * w : 0;
    const midY = h / 2;
    const barWidth = w / peaks.length;
    const selStartX = selectionStart * w;
    const selEndX = selectionEnd * w;
    const hasSelection = selectionStart > 0.0001 || selectionEnd < 0.9999;

    // Draw background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Dim the parts of the file outside the selected region
    if (hasSelection) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      if (selStartX > 0) ctx.fillRect(0, 0, selStartX, h);
      if (selEndX < w) ctx.fillRect(selEndX, 0, w - selEndX, h);
    }

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
        ctx.fillStyle = accentColor;
      } else {
        // Unplayed region: dimmer
        ctx.fillStyle = textColor;
      }

      ctx.fillRect(x, midY - amp, xRight - x, amp * 2);
    }

    // Selection handles (L/R trim markers)
    if (hasSelection || onSelectionChange) {
      ctx.fillStyle = accentColor;
      for (const x of [selStartX, selEndX]) {
        ctx.fillRect(x - 1.5, 0, 3, h);
      }
      // Grab tabs at top so they read as draggable on a touchscreen
      ctx.beginPath();
      ctx.moveTo(selStartX - 6, 0);
      ctx.lineTo(selStartX + 6, 0);
      ctx.lineTo(selStartX, 8);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(selEndX - 6, 0);
      ctx.lineTo(selEndX + 6, 0);
      ctx.lineTo(selEndX, 8);
      ctx.closePath();
      ctx.fill();
    }

    // Draw playhead line
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();

    // Draw playhead triangle
    ctx.fillStyle = accentColor;
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
      ctx.fillStyle = accentColor;
      ctx.fillText('↔ REV', w - 4, h - 4);
    }
  }, [peaks, currentTime, duration, isPlaying, reverse, selectionStart, selectionEnd, onSelectionChange]);

  const getFractionFromEvent = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;

    // Did this land on a handle? If so, grab it instead of seeking.
    if (onSelectionChange) {
      const startX = selectionStart * rect.width;
      const endX = selectionEnd * rect.width;
      if (Math.abs(px - startX) <= HANDLE_HIT_RADIUS) {
        dragHandleRef.current = 'start';
        setIsDragging(true);
        e.preventDefault();
        return;
      }
      if (Math.abs(px - endX) <= HANDLE_HIT_RADIUS) {
        dragHandleRef.current = 'end';
        setIsDragging(true);
        e.preventDefault();
        return;
      }
    }

    // Otherwise: normal scrub-to-seek, unchanged.
    if (!onSeek) return;
    dragHandleRef.current = null;
    setIsDragging(true);
    onSeek(getFractionFromEvent(e.clientX));
    e.preventDefault();
  }, [onSeek, onSelectionChange, selectionStart, selectionEnd, getFractionFromEvent]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const fraction = getFractionFromEvent(e.clientX);

    if (dragHandleRef.current === 'start') {
      const clamped = Math.min(fraction, selectionEnd - MIN_HANDLE_GAP);
      onSelectionChange?.(Math.max(0, clamped), selectionEnd);
      return;
    }
    if (dragHandleRef.current === 'end') {
      const clamped = Math.max(fraction, selectionStart + MIN_HANDLE_GAP);
      onSelectionChange?.(selectionStart, Math.min(1, clamped));
      return;
    }
    onSeek?.(fraction);
  }, [isDragging, onSeek, onSelectionChange, selectionStart, selectionEnd, getFractionFromEvent]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    dragHandleRef.current = null;
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
