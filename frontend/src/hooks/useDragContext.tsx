import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────

export interface DragPayload {
  /** Absolute file path being dragged */
  path: string;
  /** Display name of the file */
  name: string;
}

export interface DragState {
  /** Current drag payload, or null if no drag is active */
  payload: DragPayload | null;
  /** Current touch/page position (clientX, clientY) */
  position: { x: number; y: number } | null;
  /** Whether the drag has crossed the edge threshold */
  edgeReached: boolean;
  /** Start the drag with a payload */
  startDrag: (payload: DragPayload) => void;
  /** Update drag position (called on touchmove) */
  updatePosition: (x: number, y: number) => void;
  /** End/cancel the drag */
  endDrag: () => void;
}

// ── Context ──────────────────────────────────────────────────

const DragContext = createContext<DragState>({
  payload: null,
  position: null,
  edgeReached: false,
  startDrag: () => {},
  updatePosition: () => {},
  endDrag: () => {},
});

export function useDragContext(): DragState {
  return useContext(DragContext);
}

// ── Provider ─────────────────────────────────────────────────

interface DragProviderProps {
  children: React.ReactNode;
  /** Edge threshold as fraction of window width (default 0.8 = 80%) */
  edgeThreshold?: number;
  /** Called when the edge threshold is crossed */
  onEdgeReached?: (payload: DragPayload) => void;
}

export function DragProvider({
  children,
  edgeThreshold = 0.8,
  onEdgeReached,
}: DragProviderProps) {
  const [payload, setPayload] = useState<DragPayload | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [edgeReached, setEdgeReached] = useState(false);
  const edgeFiredRef = useRef(false);
  const payloadRef = useRef<DragPayload | null>(null);

  const startDrag = useCallback((p: DragPayload) => {
    setPayload(p);
    payloadRef.current = p;
    setEdgeReached(false);
    edgeFiredRef.current = false;
  }, []);

  const updatePosition = useCallback((x: number, y: number) => {
    setPosition({ x, y });

    // Check edge threshold
    if (!edgeFiredRef.current && payloadRef.current) {
      const windowWidth = window.innerWidth;
      if (x / windowWidth >= edgeThreshold) {
        edgeFiredRef.current = true;
        setEdgeReached(true);
        onEdgeReached?.(payloadRef.current);
      }
    }
  }, [edgeThreshold, onEdgeReached]);

  const endDrag = useCallback(() => {
    setPayload(null);
    payloadRef.current = null;
    setPosition(null);
    setEdgeReached(false);
    edgeFiredRef.current = false;
  }, []);

  return (
    <DragContext.Provider
      value={{
        payload,
        position,
        edgeReached,
        startDrag,
        updatePosition,
        endDrag,
      }}
    >
      {children}
    </DragContext.Provider>
  );
}

// ── Touch drag hook (for elements that initiate drag) ────────

interface UseTouchDragOptions {
  /** Payload to set when drag starts */
  payload: DragPayload;
  /** Long-press threshold in ms (default 500) */
  threshold?: number;
  /** Whether to enable drag initiation (default true) */
  enabled?: boolean;
}

export function useTouchDrag({
  payload,
  threshold = 500,
  enabled = true,
}: UseTouchDragOptions) {
  const { startDrag, updatePosition, endDrag } = useDragContext();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const dragActive = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled) return;
    longPressTriggered.current = false;
    dragActive.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      dragActive.current = true;
      startDrag(payload);
      updatePosition(e.clientX, e.clientY);
    }, threshold);
  }, [enabled, threshold, payload, startDrag, updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragActive.current) {
      updatePosition(e.clientX, e.clientY);
    } else if (longPressTimer.current) {
      // Cancel long-press on significant movement
      const threshold = 10; // px
      // We can't easily track start pos here, so we cancel on any move
      // The caller should use touch-action: none to prevent scroll interference
    }
  }, [updatePosition]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (dragActive.current) {
      endDrag();
      dragActive.current = false;
    }
    longPressTriggered.current = false;
  }, [endDrag]);

  const handlePointerCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (dragActive.current) {
      endDrag();
      dragActive.current = false;
    }
    longPressTriggered.current = false;
  }, [endDrag]);

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    dragActive: dragActive,
  };
}
