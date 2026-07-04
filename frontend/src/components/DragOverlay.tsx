import { useDragContext } from '../hooks/useDragContext';

export function DragOverlay() {
  const { payload, position, edgeReached, hoveredZoneId } = useDragContext();

  if (!payload || !position) return null;

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-none touch-none select-none"
      aria-hidden="true"
    >
      {/* Ghost overlay following touch */}
      <div
        className="absolute flex items-center gap-2 px-3 py-2 
          bg-[var(--accent-orange)]/90 text-black text-sm font-medium
          shadow-lg rounded-sm whitespace-nowrap
          transition-[width,height] duration-75"
        style={{
          left: position.x - 60,
          top: position.y - 24,
          transform: 'translate(0, 0)',
          maxWidth: '200px',
        }}
      >
        <span className="text-base">
          {payload.type === 'fx' ? '🔧' : payload.type === 'fxchain' ? '📦' : '🎵'}
        </span>
        <span className="truncate">{payload.name}</span>
      </div>

      {/* Edge reached indicator */}
      {edgeReached && (
        <div
          className="absolute right-2 top-1/2 -translate-y-1/2
            px-4 py-2 bg-[var(--accent-green)]/80 text-black text-xs font-bold
            rounded-sm shadow-lg animate-pulse"
        >
          Drop here →
        </div>
      )}

      {/* Active drop zone indicator */}
      {hoveredZoneId && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2
            px-4 py-1.5 bg-[var(--accent-green)]/70 text-black text-[10px] font-semibold
            rounded-sm shadow-md"
        >
          Drop over slot
        </div>
      )}
    </div>
  );
}
