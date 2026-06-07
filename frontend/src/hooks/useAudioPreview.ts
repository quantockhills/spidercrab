import { useState, useRef, useCallback, useEffect } from 'react';

export interface AudioInfoResult {
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: number[]; // downsampled peak amplitudes [0..1]
}

export interface AudioPreviewState {
  /** Play (starts host-side preview) */
  play: () => void;
  /** Pause (stops host-side preview, remembers position) */
  pause: () => void;
  /** Seek to fraction [0, 1] */
  seek: (fraction: number) => void;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Duration in seconds */
  duration: number;
  /** Current playback position in seconds (simulated via animation frame) */
  currentTime: number;
  /** Waveform peaks (downsampled for display) */
  peaks: Float32Array | null;
  /** Whether audio info is being fetched */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Reverse playback flag (UI only — not supported by host preview yet) */
  reverse: boolean;
  /** Toggle reverse (UI only) */
  toggleReverse: () => void;
  /** Reset/stop playback */
  stop: () => void;
}

/**
 * Hook for fetching lightweight audio info (peaks + metadata) from the backend
 * and controlling host-side preview playback.
 *
 * Flow:
 *   1. On file selection: call `sample/getAudioInfo` → get peaks + metadata
 *   2. On play: call `sample/preview {path, startPos}` → host starts playback
 *   3. On stop: call `sample/stopPreview` → host stops playback
 *   4. Position is simulated client-side via animation frame (no real-time feedback)
 */
export function useAudioPreview(
  filePath: string | null,
  sendCommand: (command: string, params?: Record<string, unknown>) => Promise<{ payload: Record<string, unknown> }>
): AudioPreviewState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [reverse, setReverse] = useState(false);

  // Refs for playback simulation
  const startTimeRef = useRef(0);       // Date.now() when playback started
  const startOffsetRef = useRef(0);     // position offset (in seconds) at start
  const animFrameRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      // If we're playing, tell host to stop
      if (filePath) {
        sendCommand('sample/stopPreview').catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animation frame for updating currentTime
  const updatePosition = useCallback(() => {
    if (!startTimeRef.current) return;
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const newTime = startOffsetRef.current + elapsed;
    if (duration > 0 && newTime >= duration) {
      // Playback finished naturally
      setIsPlaying(false);
      setCurrentTime(duration);
      return;
    }
    setCurrentTime(Math.min(newTime, duration || Infinity));
    animFrameRef.current = requestAnimationFrame(updatePosition);
  }, [duration]);

  // Reset all playback state (keeps peaks loaded)
  const resetPlayback = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
    startTimeRef.current = 0;
    startOffsetRef.current = 0;
    setCurrentTime(0);
  }, []);

  // Fetch audio info when filePath changes
  useEffect(() => {
    if (!filePath) {
      setPeaks(null);
      setDuration(0);
      setCurrentTime(0);
      setIsPlaying(false);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Cancel previous fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Stop any current playback
    sendCommand('sample/stopPreview').catch(() => {});
    resetPlayback();

    setIsLoading(true);
    setError(null);

    const signal = abortControllerRef.current.signal;

    (async () => {
      try {
        if (signal.aborted) return;

        const resp = await sendCommand('sample/getAudioInfo', { path: filePath });
        if (signal.aborted) return;

        const payload = resp.payload as unknown as AudioInfoResult;

        // Convert peaks array to Float32Array
        if (payload.peaks && payload.peaks.length > 0) {
          setPeaks(new Float32Array(payload.peaks));
        } else {
          setPeaks(null);
        }
        setDuration(payload.duration || 0);
        setError(null);
      } catch (err) {
        if (signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Failed to load audio info';
        setError(msg);
        setPeaks(null);
        setDuration(0);
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const play = useCallback(() => {
    if (!filePath) return;

    // Stop any existing preview first
    sendCommand('sample/stopPreview').catch(() => {});

    const startPos = startOffsetRef.current;

    // Start host preview
    sendCommand('sample/preview', { path: filePath, startPos: String(startPos) })
      .then(() => {
        startTimeRef.current = Date.now();
        setIsPlaying(true);
        animFrameRef.current = requestAnimationFrame(updatePosition);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to start preview';
        setError(msg);
      });
  }, [filePath, sendCommand, updatePosition]);

  const pause = useCallback(() => {
    if (!filePath || !isPlaying) return;

    // Stop host preview
    sendCommand('sample/stopPreview').catch(() => {});

    // Record current offset
    const elapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
    startOffsetRef.current = startOffsetRef.current + elapsed;
    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
    setCurrentTime(startOffsetRef.current);
  }, [filePath, isPlaying, sendCommand]);

  const seek = useCallback((fraction: number) => {
    if (!filePath || duration <= 0) return;
    const newTime = Math.max(0, Math.min(fraction, 1)) * duration;
    startOffsetRef.current = newTime;
    setCurrentTime(newTime);

    // If playing, restart host preview at new position
    if (isPlaying) {
      // Stop current preview
      sendCommand('sample/stopPreview').catch(() => {});
      // Start at new position
      sendCommand('sample/preview', { path: filePath, startPos: String(newTime) })
        .then(() => {
          startTimeRef.current = Date.now();
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = requestAnimationFrame(updatePosition);
        })
        .catch(() => {});
    }
  }, [filePath, duration, isPlaying, sendCommand, updatePosition]);

  const stop = useCallback(() => {
    if (!filePath) return;

    sendCommand('sample/stopPreview').catch(() => {});
    cancelAnimationFrame(animFrameRef.current);
    startOffsetRef.current = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  }, [filePath, sendCommand]);

  const toggleReverse = useCallback(() => {
    setReverse(prev => !prev);
  }, []);

  return {
    play,
    pause,
    seek,
    isPlaying,
    duration,
    currentTime,
    peaks,
    isLoading,
    error,
    reverse,
    toggleReverse,
    stop,
  };
}
