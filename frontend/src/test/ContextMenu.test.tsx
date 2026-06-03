import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu } from '../components/ContextMenu';
import type { ContextMenuItem } from '../components/ContextMenu';

// ── Tests ─────────────────────────────────────────────────────

describe('ContextMenu', () => {
  const mockOnClose = vi.fn();

  const defaultItems: ContextMenuItem[] = [
    { label: 'Send to Track', icon: '🎯', action: vi.fn() },
    { label: 'Start Drag to Slot', icon: '↗️', action: vi.fn() },
    { label: 'File Info', icon: 'ℹ️', action: vi.fn() },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders all menu items', () => {
    render(<ContextMenu items={defaultItems} x={100} y={100} onClose={mockOnClose} />);

    expect(screen.getByText('Send to Track')).toBeDefined();
    expect(screen.getByText('Start Drag to Slot')).toBeDefined();
    expect(screen.getByText('File Info')).toBeDefined();
  });

  it('renders icons for each menu item', () => {
    render(<ContextMenu items={defaultItems} x={100} y={100} onClose={mockOnClose} />);

    expect(screen.getByText('🎯')).toBeDefined();
    expect(screen.getByText('↗️')).toBeDefined();
    expect(screen.getByText('ℹ️')).toBeDefined();
  });

  it('calls item action and onClose when item clicked', () => {
    const itemAction = vi.fn();
    const items: ContextMenuItem[] = [
      { label: 'Test Action', action: itemAction },
    ];

    render(<ContextMenu items={items} x={100} y={100} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Test Action'));

    expect(itemAction).toHaveBeenCalledTimes(1);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not call action for disabled items', () => {
    const itemAction = vi.fn();
    const items: ContextMenuItem[] = [
      { label: 'Disabled Item', action: itemAction, disabled: true },
    ];

    render(<ContextMenu items={items} x={100} y={100} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Disabled Item'));

    expect(itemAction).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('calls onClose when clicking outside the menu', () => {
    render(<ContextMenu items={defaultItems} x={100} y={100} onClose={mockOnClose} />);

    // Click outside the menu
    fireEvent.mouseDown(document.body);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the menu', () => {
    render(<ContextMenu items={defaultItems} x={100} y={100} onClose={mockOnClose} />);

    // Click on a menu item
    fireEvent.click(screen.getByText('Send to Track'));

    // onClose should be called by item click handler, not by outside click
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('has role="menu" on container', () => {
    render(<ContextMenu items={defaultItems} x={100} y={100} onClose={mockOnClose} />);

    const menu = screen.getByRole('menu');
    expect(menu).toBeDefined();
  });

  it('has role="menuitem" on each item', () => {
    render(<ContextMenu items={defaultItems} x={100} y={100} onClose={mockOnClose} />);

    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBe(3);
  });

  it('positions at specified x,y coordinates', () => {
    render(<ContextMenu items={defaultItems} x={200} y={300} onClose={mockOnClose} />);

    const menu = screen.getByRole('menu');
    const style = menu.getAttribute('style');
    expect(style).toContain('left: 200px');
    expect(style).toContain('top: 300px');
  });

  it('renders items without icons', () => {
    const items: ContextMenuItem[] = [
      { label: 'No Icon', action: vi.fn() },
    ];

    render(<ContextMenu items={items} x={50} y={50} onClose={mockOnClose} />);

    expect(screen.getByText('No Icon')).toBeDefined();
  });
});
