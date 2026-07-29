import { useState, useRef, useCallback, useEffect } from 'react';

export interface AudioInfoResult {
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: number[]; // downsampled peak amplitudes [0..1]
}

export interface PlayOptions {
  /** Region start, in seconds. Defaults to the current position (or 0). */
  start?: number;
  /** Region end, in seconds. Defaults to the full duration. */
  end?: number;
  /** Play the [start, end) region backwards (renders a reversed slice host-side). */
  reverse?: boolean;
  /** Restart from the beginning of the region when it finishes, instead of stopping. */
  loop?: boolean;
}

export interface AudioPreviewState {
  /** Play. With no arguments, behaves exactly as before (from current position to the end). */
  play: (opts?: PlayOptions) => void;
  /** Pause (stops host-side preview, remembers position) */
  pause: () => void;
  /** Seek to fraction [0, 1] */
  seek: (fraction: number) => void;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Duration in seconds */
  duration: number;
  /** Current playback position in seconds (simulated via animation frame).
   *  During reverse playback this counts DOWN, matching what's audibly
   *  happening relative to the (always-forward) waveform display. */
  currentTime: number;
  /** Waveform peaks (downsampled for display) */
  peaks: Float32Array | null;
  /** Whether audio info is being fetched */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether the last/current play() was a reverse play */
  reverse: boolean;
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
  sendCommand: (command: string, params?: Record<string, unknown>) => Promise<{ payload: Record<string, unknown> }>,
  autoplay = false
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
  const directionRef = useRef<1 | -1>(1); // 1 = forward, -1 = reverse (counts DOWN)
  const stopAtRef = useRef<number | null>(null); // where playback naturally ends; null = duration
  const loopRef = useRef(false);
  const restartRef = useRef<(() => void) | null>(null); // repeats the last play() call, for looping
  const animFrameRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;

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

  // Animation frame for updating currentTime. Forward playback counts up;
  // reverse playback counts DOWN (the playhead moves right-to-left over the
  // waveform, matching what's audibly happening — the waveform itself is
  // always drawn in its natural, forward order).
  const updatePosition = useCallback(() => {
    if (!startTimeRef.current) return;
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const dir = directionRef.current;
    const newTime = startOffsetRef.current + dir * elapsed;
    const stopAt = stopAtRef.current ?? (dir > 0 ? duration : 0);

    const finished = dir > 0 ? newTime >= stopAt : newTime <= stopAt;
    if (finished) {
      if (loopRef.current && restartRef.current) {
        // Loop: jump straight back to the start of the region and go again,
        // rather than stopping. restartRef repeats the exact same play() call.
        restartRef.current();
        return;
      }
      // Playback finished naturally
      setIsPlaying(false);
      setCurrentTime(Math.max(0, Math.min(stopAt, duration || stopAt)));
      sendCommand('sample/stopPreview').catch(() => {});
      return;
    }
    setCurrentTime(Math.max(0, Math.min(newTime, duration || Infinity)));
    animFrameRef.current = requestAnimationFrame(updatePosition);
  }, [duration, sendCommand]);

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

        if (autoplayRef.current && payload.peaks && payload.peaks.length > 0) {
          // Start at position 0
          startOffsetRef.current = 0;
          sendCommand('sample/preview', { path: filePath, startPos: '0' })
            .then(() => {
              startTimeRef.current = Date.now();
              setIsPlaying(true);
              animFrameRef.current = requestAnimationFrame(updatePosition);
            })
            .catch(() => {});
        }
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

  const play = useCallback((opts?: PlayOptions) => {
    if (!filePath) return;

    // Stop any existing preview first
    sendCommand('sample/stopPreview').catch(() => {});

    const doReverse = opts?.reverse ?? false;
    const regionStart = opts?.start ?? 0;
    const regionEnd = opts?.end ?? duration;
    setReverse(doReverse);
    loopRef.current = opts?.loop ?? false;
    // Capture the RESOLVED bounds (not the raw opts) so a loop restart is
    // always well-defined, even if the original call relied on a default.
    restartRef.current = () => play({ start: regionStart, end: regionEnd, reverse: doReverse, loop: true });

    if (doReverse) {
      // Host renders [regionStart, regionEnd) reversed and previews that.
      // The visual playhead counts DOWN from regionEnd to regionStart —
      // that's what's audibly happening relative to the (always-forward)
      // waveform drawing.
      directionRef.current = -1;
      startOffsetRef.current = regionEnd;
      stopAtRef.current = regionStart;
      setCurrentTime(regionEnd);

      sendCommand('sample/preview', {
        path: filePath,
        startPos: String(regionStart),
        regionEnd: String(regionEnd),
        reverse: 'true',
      })
        .then((resp) => {
          const effectiveDuration = resp.payload?.effectiveDuration as number | undefined;
          if (typeof effectiveDuration === 'number' && effectiveDuration > 0) {
            stopAtRef.current = regionEnd - effectiveDuration;
          }
          startTimeRef.current = Date.now();
          setIsPlaying(true);
          animFrameRef.current = requestAnimationFrame(updatePosition);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Failed to start reverse preview';
          setError(msg);
        });
      return;
    }

    // Forward playback (unchanged from before when called with no options —
    // starts from wherever we last were, plays to the end).
    directionRef.current = 1;
    const startPos = opts?.start ?? startOffsetRef.current;
    stopAtRef.current = opts?.end ?? null; // null → updatePosition falls back to `duration`
    startOffsetRef.current = startPos;

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
  }, [filePath, duration, sendCommand, updatePosition]);

  const pause = useCallback(() => {
    if (!filePath || !isPlaying) return;

    // Stop host preview
    sendCommand('sample/stopPreview').catch(() => {});

    // Record current offset (direction-aware: reverse counts down)
    const elapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
    startOffsetRef.current = startOffsetRef.current + directionRef.current * elapsed;
    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
    setCurrentTime(startOffsetRef.current);
  }, [filePath, isPlaying, sendCommand]);

  const seek = useCallback((fraction: number) => {
    if (!filePath || duration <= 0) return;
    const newTime = Math.max(0, Math.min(fraction, 1)) * duration;
    startOffsetRef.current = newTime;
    directionRef.current = 1;
    stopAtRef.current = null;
    setReverse(false);
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
    directionRef.current = 1;
    stopAtRef.current = null;
    setIsPlaying(false);
    setCurrentTime(0);
  }, [filePath, sendCommand]);

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
    stop,
  };
}
