import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WaveformDisplay } from '../components/WaveformDisplay';

// Mock getComputedStyle to return CSS variable values
const mockCSSVars: Record<string, string> = {
  '--bg-tertiary': '#EDE5D0',
  '--accent-orange': '#E8A84C',
  '--text-secondary': '#859289',
  '--border': '#E0D8C4',
};

beforeEach(() => {
  // Set up mock CSS variables on document root
  Object.entries(mockCSSVars).forEach(([key, val]) => {
    document.documentElement.style.setProperty(key, val);
  });
});

// Mock canvas context for testing
function createMockCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    scale: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '' as CanvasTextAlign,
  } as unknown as CanvasRenderingContext2D;

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as any;
  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0,
    top: 0,
    width: 300,
    height: 100,
    right: 300,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));

  return ctx;
}

describe('WaveformDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    createMockCanvas();
    const { container } = render(
      <WaveformDisplay
        peaks={null}
        currentTime={0}
        duration={0}
        isPlaying={false}
      />
    );
    expect(container.querySelector('canvas')).toBeDefined();
  });

  it('renders with peaks data', () => {
    createMockCanvas();
    const peaks = new Float32Array([0.1, 0.5, 0.8, 0.3, 0.2]);
    const { container } = render(
      <WaveformDisplay
        peaks={peaks}
        currentTime={0}
        duration={10}
        isPlaying={false}
      />
    );
    expect(container.querySelector('canvas')).toBeDefined();
  });

  it('renders with custom height', () => {
    createMockCanvas();
    const { container } = render(
      <WaveformDisplay
        peaks={null}
        currentTime={0}
        duration={0}
        isPlaying={false}
        height={120}
      />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeDefined();
    expect(canvas?.style.height).toBe('120px');
  });

  it('shows reverse badge when reverse is true', () => {
    const ctx = createMockCanvas();
    const peaks = new Float32Array([0.1, 0.5, 0.8]);
    render(
      <WaveformDisplay
        peaks={peaks}
        currentTime={0}
        duration={10}
        isPlaying={false}
        reverse={true}
      />
    );
    // Canvas fillText should be called with '↔ REV'
    expect(ctx.fillText).toHaveBeenCalledWith(
      '↔ REV',
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('fires onSeek callback on pointer down', () => {
    createMockCanvas();
    const onSeek = vi.fn();
    const { container } = render(
      <WaveformDisplay
        peaks={new Float32Array([0.5, 0.5, 0.5])}
        currentTime={0}
        duration={10}
        isPlaying={false}
        onSeek={onSeek}
      />
    );
    const canvas = container.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { clientX: 150 });
    expect(onSeek).toHaveBeenCalled();
    // clientX 150 on a 300px canvas = fraction 0.5
    expect(onSeek).toHaveBeenCalledWith(0.5);
  });

  it('does not crash when no onSeek provided', () => {
    createMockCanvas();
    const { container } = render(
      <WaveformDisplay
        peaks={new Float32Array([0.5, 0.5])}
        currentTime={0}
        duration={10}
        isPlaying={false}
      />
    );
    const canvas = container.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { clientX: 100 });
    // Should not throw
  });

  it('applies className prop', () => {
    createMockCanvas();
    const { container } = render(
      <WaveformDisplay
        peaks={null}
        currentTime={0}
        duration={0}
        isPlaying={false}
        className="test-class"
      />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas?.className).toContain('test-class');
  });

  it('uses resolved CSS colors (not var() syntax) in canvas fillStyle when peaks exist', () => {
    const ctx = createMockCanvas();
    const peaks = new Float32Array([0.1, 0.5, 0.8, 0.3, 0.2]);
    render(
      <WaveformDisplay
        peaks={peaks}
        currentTime={0}
        duration={10}
        isPlaying={false}
      />
    );

    // fillRect should have been called (background + each peak)
    expect(ctx.fillRect).toHaveBeenCalled();

    // strokeStyle should be a real color, not a CSS var() string
    expect(ctx.strokeStyle.toString()).not.toContain('var(');

    // fillStyle should have been set to a valid hex color at some point
    const fillStyleStr = ctx.fillStyle.toString();
    expect(fillStyleStr).not.toContain('var(');
    expect(fillStyleStr).toMatch(/^#[0-9a-fA-F]{3,8}$|^rgb/);
  });

  it('uses resolved CSS colors when peaks is null (placeholder state)', () => {
    const ctx = createMockCanvas();
    render(
      <WaveformDisplay
        peaks={null}
        currentTime={0}
        duration={0}
        isPlaying={false}
      />
    );

    // strokeStyle for the placeholder line should not be var()
    expect(ctx.strokeStyle.toString()).not.toContain('var(');
    // fillStyle for placeholder text should not be var()
    expect(ctx.fillStyle.toString()).not.toContain('var(');
  });

  it('falls back to hardcoded colors when CSS variables are not set', () => {
    // Remove CSS variables
    Object.keys(mockCSSVars).forEach((key) => {
      document.documentElement.style.removeProperty(key);
    });

    const ctx = createMockCanvas();
    const peaks = new Float32Array([0.5, 0.5]);
    render(
      <WaveformDisplay
        peaks={peaks}
        currentTime={0}
        duration={10}
        isPlaying={false}
      />
    );

    // Should still draw (fillRect called)
    expect(ctx.fillRect).toHaveBeenCalled();
    // fillStyle should still be a valid color, not var()
    expect(ctx.fillStyle.toString()).not.toContain('var(');
  });
});
