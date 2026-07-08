import { useState, useEffect, useCallback } from 'react';
import { useDragContext } from '../hooks/useDragContext';

// ── TrackDropZone Component ───────────────────────────────────

interface TrackDropZoneProps {
  trackIdx: number;
  onDropFile?: (trackIdx: number, filePath: string) => Promise<boolean>;
  onDropPayload?: (trackIdx: number, filePath: string, type?: string) => Promise<boolean>;
}

export function TrackDropZone({ trackIdx, onDropFile, onDropPayload }: TrackDropZoneProps) {
  const [isOver, setIsOver] = useState(false);
  const { registerDropZone, hoveredZoneId } = useDragContext();

  // Register as a drop zone for custom touch-based drag from browsers
  useEffect(() => {
    if (!onDropPayload && !onDropFile) return;
    const zoneId = `track-${trackIdx}`;
    return registerDropZone(zoneId, async (payload) => {
      if (onDropPayload) {
        await onDropPayload(trackIdx, payload.path, payload.type);
      } else if (onDropFile) {
        await onDropFile(trackIdx, payload.path);
      }
    });
  }, [trackIdx, onDropPayload, onDropFile, registerDropZone]);

  const isHovered = hoveredZoneId === `track-${trackIdx}`;

  // Native HTML5 drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    // File.path is not available in browser - use name or webkitRelativePath for drag-and-drop
    const filePath = (file as any).path || file.name || file.webkitRelativePath || '';

    if (onDropFile) {
      await onDropFile(trackIdx, filePath);
    } else if (onDropPayload) {
      // Determine type from file extension
      const lower = filePath.toLowerCase();
      let type: string | undefined;
      if (lower.endsWith('.rfxchain') || lower.endsWith('.chain')) {
        type = 'fxchain';
      } else if (lower.endsWith('.vst3') || lower.endsWith('.dll') || lower.endsWith('.component') || lower.endsWith('.clap') || lower.endsWith('.jsfx')) {
        type = 'fx';
      }
      await onDropPayload(trackIdx, filePath, type);
    }
  }, [trackIdx, onDropFile, onDropPayload]);

  return null; // This component renders via data-drop-zone attribute on parent TrackRow
}
