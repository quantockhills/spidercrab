import { useCallback, useState } from 'react';
import type { DragPayload } from '../hooks/useDragContext';

interface TrackDropZoneProps {
  trackIdx: number;
  onDrop: (trackIdx: number, filePath: string) => Promise<boolean>;
  disabled?: boolean;
}

export function TrackDropZone({ trackIdx, onDrop, disabled = false }: TrackDropZoneProps) {
  const [isOver, setIsOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    
    // Get the file path from the drag data
    const filePath = e.dataTransfer.getData('text/plain');
    if (!filePath) return;

    try {
      const success = await onDrop(trackIdx, filePath);
      if (success) {
        // Clear drag state
        setIsDragging(false);
      }
    } catch (error) {
      console.error('Drop failed:', error);
    }
  }, [trackIdx, onDrop]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  return (
    <div
      className={`
        absolute inset-0 rounded-lg border-2 border-dashed transition-all duration-200 pointer-events-none
        ${isOver 
          ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)]/20 scale-105' 
          : 'border-transparent bg-transparent'
        }
        ${disabled ? 'opacity-50' : ''}
      `}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    />
  );
}

// Hook for managing drag state from the drag context
export function useTrackDropZone(trackIdx: number, onDrop: (trackIdx: number, filePath: string) => Promise<boolean>) {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsOver(false);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    
    const filePath = e.dataTransfer.getData('text/plain');
    if (!filePath) return;

    await onDrop(trackIdx, filePath);
  }, [trackIdx, onDrop]);

  return {
    isOver,
    dragOverProps: {
      onDragOver: handleDragOver,
      onDragEnter: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}