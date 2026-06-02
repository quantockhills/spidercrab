import { useState, useRef, useCallback, useEffect } from 'react';

export interface AudioDataResult {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  format: string;
  fileSize: number;
  dataSize: number;
  data: string; // base64-encoded PCM
}

export interface AudioPreviewState {
  /** Play/pause toggle */
  play: () => void;
  pause: () => void;
  /** Seek to fraction [0, 1] */
  seek: (fraction: number) => void;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Duration in seconds */
  duration: number;
  /** Current playback position in seconds */
  currentTime: number;
  /** Waveform peaks (downsampled for display) */
  peaks: Float32Array | null;
  /** Whether audio data is being fetched */
  isLoading: boolean;
  /** Error message if fetch/decoding failed */
  error: string | null;
  /** Reverse playback flag */
  reverse: boolean;
  /** Toggle reverse */
  toggleReverse: () => void;
  /** Reset/stop playback */
  stop: () => void;
}

interface AudioBufferData {
  buffer: AudioBuffer;
  peaks: Float32Array;
}

/**
 * Hook for fetching audio data from the backend, decoding it,
 * computing waveform peaks, and managing playback.
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

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const bufferDataRef = useRef<AudioBufferData | null>(null);
  const startTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Fetch audio data when filePath changes
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

    // Stop current playback
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setError(null);
    setIsLoading(true);

    const signal = abortControllerRef.current.signal;

    (async () => {
      try {
        if (signal.aborted) return;

        const resp = await sendCommand('sample/getAudioData', { path: filePath });
        if (signal.aborted) return;

        const payload = resp.payload as unknown as AudioDataResult;
        if (!payload.data) {
          throw new Error('No audio data in response');
        }

        // Decode base64 to binary
        const binaryStr = atob(payload.data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        // Create AudioContext
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }

        // Decode PCM data
        const audioBuffer = await audioContextRef.current.decodeAudioData(
          bytes.buffer.slice(0)
        );
        if (signal.aborted) return;

        // Compute waveform peaks (downsampled to ~2000 points)
        const rawData = audioBuffer.getChannelData(0);
        const numPeaks = Math.min(2000, Math.floor(rawData.length / 100));
        const peaksArray = new Float32Array(numPeaks);
        const samplesPerPeak = Math.max(1, Math.floor(rawData.length / numPeaks));
        for (let i = 0; i < numPeaks; i++) {
          let max = 0;
          const start = i * samplesPerPeak;
          const end = Math.min(start + samplesPerPeak, rawData.length);
          for (let j = start; j < end; j++) {
            const abs = Math.abs(rawData[j]);
            if (abs > max) max = abs;
          }
          peaksArray[i] = max;
        }

        bufferDataRef.current = { buffer: audioBuffer, peaks: peaksArray };
        setPeaks(peaksArray);
        setDuration(audioBuffer.duration);
        setError(null);
      } catch (err) {
        if (signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Failed to load audio';
        setError(msg);
        setPeaks(null);
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
  }, [filePath, sendCommand]);

  // Animation frame for updating currentTime
  const updatePosition = useCallback(() => {
    if (!bufferDataRef.current || !sourceNodeRef.current || !startTimeRef.current) {
      return;
    }
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const newTime = startOffsetRef.current + elapsed;
    const dur = bufferDataRef.current.buffer.duration;
    if (newTime >= dur) {
      setIsPlaying(false);
      setCurrentTime(dur);
      return;
    }
    setCurrentTime(newTime);
    animFrameRef.current = requestAnimationFrame(updatePosition);
  }, []);

  const play = useCallback(() => {
    if (!bufferDataRef.current || !audioContextRef.current) return;

    // Stop any current source
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
    }

    const ctx = audioContextRef.current;
    const buffer = bufferDataRef.current.buffer;

    // Create source
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Connect
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);

    // Apply reverse: playbackRate = -1 doesn't work in Web Audio
    // We'll just start from the offset
    const offset = startOffsetRef.current;

    source.start(0, offset);
    sourceNodeRef.current = source;
    gainNodeRef.current = gain;

    startTimeRef.current = Date.now();
    setIsPlaying(true);

    // Start position updates
    animFrameRef.current = requestAnimationFrame(updatePosition);
  }, [updatePosition]);

  const pause = useCallback(() => {
    if (sourceNodeRef.current && isPlaying) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
      cancelAnimationFrame(animFrameRef.current);
      // Update offset to current position
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      startOffsetRef.current = startOffsetRef.current + elapsed;
      setIsPlaying(false);
    }
  }, [isPlaying]);

  const seek = useCallback((fraction: number) => {
    if (!bufferDataRef.current) return;
    const dur = bufferDataRef.current.buffer.duration;
    const newTime = Math.max(0, Math.min(fraction, 1)) * dur;
    startOffsetRef.current = newTime;
    setCurrentTime(newTime);

    // If playing, restart at new position
    if (isPlaying && sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
      cancelAnimationFrame(animFrameRef.current);
      play();
    }
  }, [isPlaying, play]);

  const stop = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    cancelAnimationFrame(animFrameRef.current);
    startOffsetRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }, []);

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
