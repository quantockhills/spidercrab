import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────

export interface DragPayload {
  /** Absolute file path being dragged */
  path: string;
  /** Display name of the file */
  name: string;
  /** Optional type hint for the drop target to determine action */
  type?: 'sample' | 'fx' | 'fxchain';
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
  /** Register a drop zone callback identified by DOM data-drop-zone attribute value */
  registerDropZone: (zoneId: string, handler: (payload: DragPayload) => void) => () => void;
  /** Current hovered drop zone id (set by position checks) */
  hoveredZoneId: string | null;
}

// ── Context ──────────────────────────────────────────────────

const DragContext = createContext<DragState>({
  payload: null,
  position: null,
  edgeReached: false,
  startDrag: () => {},
  updatePosition: () => {},
  endDrag: () => {},
  registerDropZone: () => () => {},
  hoveredZoneId: null,
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

/**
 * Find the nearest ancestor with a data-drop-zone attribute and return its value.
 */
function findDropZoneId(element: Element | null): string | null {
  if (!element) return null;
  const zoneEl = element.closest('[data-drop-zone]');
  return zoneEl ? zoneEl.getAttribute('data-drop-zone') : null;
}

export function DragProvider({
  children,
  edgeThreshold = 0.8,
  onEdgeReached,
}: DragProviderProps) {
  const [payload, setPayload] = useState<DragPayload | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [edgeReached, setEdgeReached] = useState(false);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const edgeFiredRef = useRef(false);
  const payloadRef = useRef<DragPayload | null>(null);
  const positionRef = useRef<{ x: number; y: number } | null>(null);
  const dropHandlersRef = useRef<Map<string, (payload: DragPayload) => void>>(new Map());

  const registerDropZone = useCallback((zoneId: string, handler: (payload: DragPayload) => void) => {
    dropHandlersRef.current.set(zoneId, handler);
    return () => {
      dropHandlersRef.current.delete(zoneId);
    };
  }, []);

  // Hit-test using elementFromPoint + DOM traversal
  const hitTestDropZones = useCallback((x: number, y: number): string | null => {
    // Temporarily hide drag overlay to get real element
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    // Walk up to find data-drop-zone
    const zoneId = findDropZoneId(el);
    return zoneId;
  }, []);

  const startDrag = useCallback((p: DragPayload) => {
    setPayload(p);
    payloadRef.current = p;
    setEdgeReached(false);
    edgeFiredRef.current = false;
    setHoveredZoneId(null);
  }, []);

  const updatePosition = useCallback((x: number, y: number) => {
    setPosition({ x, y });
    positionRef.current = { x, y };

    // Update hover state using elementFromPoint
    const hitId = hitTestDropZones(x, y);
    setHoveredZoneId(hitId);

    // Check edge threshold
    if (!edgeFiredRef.current && payloadRef.current) {
      const windowWidth = window.innerWidth;
      if (x / windowWidth >= edgeThreshold) {
        edgeFiredRef.current = true;
        setEdgeReached(true);
        onEdgeReached?.(payloadRef.current);
      }
    }
  }, [edgeThreshold, onEdgeReached, hitTestDropZones]);

  const endDrag = useCallback(() => {
    const currentPayload = payloadRef.current;
    const currentPosition = positionRef.current;

    // If we have a payload and position, hit-test drop zones
    if (currentPayload && currentPosition) {
      const hitId = hitTestDropZones(currentPosition.x, currentPosition.y);
      if (hitId) {
        const handler = dropHandlersRef.current.get(hitId);
        if (handler) {
          handler(currentPayload);
        }
      }
    }

    setPayload(null);
    payloadRef.current = null;
    setPosition(null);
    positionRef.current = null;
    setEdgeReached(false);
    edgeFiredRef.current = false;
    setHoveredZoneId(null);
  }, [hitTestDropZones]);

  return (
    <DragContext.Provider
      value={{
        payload,
        position,
        edgeReached,
        startDrag,
        updatePosition,
        endDrag,
        registerDropZone,
        hoveredZoneId,
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
  payload: dragPayload,
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
      startDrag(dragPayload);
      updatePosition(e.clientX, e.clientY);
    }, threshold);
  }, [enabled, threshold, dragPayload, startDrag, updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragActive.current) {
      updatePosition(e.clientX, e.clientY);
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
