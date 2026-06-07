import { useEffect, useRef, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────

export interface ContextMenuItem {
  label: string;
  icon?: string;
  action: () => void;
  disabled?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────

export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Clamp position to viewport
  const clampedX = Math.min(x, window.innerWidth - 180);
  const clampedY = Math.min(y, window.innerHeight - items.length * 44 - 16);

  // Close on click outside
  const handleClickOutside = useCallback(
    (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  // Close on scroll
  const handleScroll = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    // Use mousedown instead of click for more responsive dismiss
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [handleClickOutside, handleScroll]);

  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (!item.disabled) {
        item.action();
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[160px] bg-[var(--bg-secondary)] 
        border border-[var(--border)] shadow-xl py-1"
      style={{ left: clampedX, top: clampedY }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          onClick={() => handleItemClick(item)}
          disabled={item.disabled}
          className={`
            w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
            transition-colors active:brightness-95 min-h-[44px]
            ${item.disabled
              ? 'text-[var(--text-secondary)]/40 cursor-not-allowed'
              : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }
          `}
        >
          {item.icon && <span className="text-base flex-shrink-0">{item.icon}</span>}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
