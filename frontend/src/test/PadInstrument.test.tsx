/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { PadInstrument } from '../components/PadInstrument';
import { resetPadConfigStore } from '../utils/padConfigStore';

beforeEach(() => {
  resetPadConfigStore();
  // jsdom lacks these pointer APIs
  HTMLElement.prototype.setPointerCapture = vi.fn();
  document.elementFromPoint = vi.fn(() => null) as any;
});

function pad(note: string): HTMLElement {
  const el = screen.getByLabelText(`Pad ${note}`);
  return el;
}

// Chord symbols repeat across octaves, so target pads by grid index.
// Pad 0 is bottom-left (the lowest pitch, e.g. C4 in key C).
function padByIndex(index: number): HTMLElement {
  const el = document.querySelector(`[data-pad="${index}"]`) as HTMLElement;
  if (!el) throw new Error(`no pad ${index}`);
  return el;
}

function press(el: HTMLElement, pointerId = 1, clientY = 0) {
  fireEvent.pointerDown(el, { pointerId, clientY });
}

function release(el: HTMLElement, pointerId = 1) {
  fireEvent.pointerUp(el, { pointerId });
}

describe('PadInstrument', () => {
  it('renders 16 pads plus controls', () => {
    render(<PadInstrument noteOn={vi.fn()} noteOff={vi.fn()} />);
    expect(screen.getByLabelText('Scale')).toBeDefined();
    expect(screen.getByLabelText('Root note')).toBeDefined();
    expect(screen.getByLabelText('Chord mode')).toBeDefined();
    expect(screen.getByLabelText('Hold')).toBeDefined();
    expect(screen.getAllByLabelText(/^Pad /)).toHaveLength(16);
  });

  it('plays a note on press and releases on release', () => {
    const noteOn = vi.fn();
    const noteOff = vi.fn();
    render(<PadInstrument noteOn={noteOn} noteOff={noteOff} />);

    const c4 = pad('C4'); // bottom-left pad
    press(c4);
    expect(noteOn).toHaveBeenCalledWith(60, expect.any(Number));

    release(c4);
    expect(noteOff).toHaveBeenCalledWith(60);
  });

  it('velocity comes from touch height (higher = louder)', () => {
    const noteOn = vi.fn();
    const { rerender } = render(<PadInstrument noteOn={noteOn} noteOff={vi.fn()} />);
    rerender(<PadInstrument noteOn={noteOn} noteOff={vi.fn()} />);

    // jsdom rects are 0x0; velocityFromEvent clamps to MIN_VELOCITY=40
    press(pad('C4'), 1, 0);
    expect(noteOn.mock.calls[0][1]).toBe(40);
  });

  it('octave up shifts the whole grid', () => {
    const noteOn = vi.fn();
    render(<PadInstrument noteOn={noteOn} noteOff={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Octave up'));
    press(pad('C5'));
    expect(noteOn).toHaveBeenCalledWith(72, expect.any(Number));
  });

  it('chord mode plays a triad per pad', () => {
    const noteOn = vi.fn();
    const noteOff = vi.fn();
    render(<PadInstrument noteOn={noteOn} noteOff={noteOff} />);
    fireEvent.click(screen.getByLabelText('Chord mode'));

    const c4 = padByIndex(0); // C4 — the pads now read "C" (no octave)
    press(c4);
    expect(noteOn).toHaveBeenCalledWith(60, expect.any(Number));
    expect(noteOn).toHaveBeenCalledWith(64, expect.any(Number));
    expect(noteOn).toHaveBeenCalledWith(67, expect.any(Number));

    release(c4);
    expect(noteOff).toHaveBeenCalledWith(60);
    expect(noteOff).toHaveBeenCalledWith(64);
    expect(noteOff).toHaveBeenCalledWith(67);
  });

  it('chord type selector plays sevenths and ninths', () => {
    const noteOn = vi.fn();
    const noteOff = vi.fn();
    render(<PadInstrument noteOn={noteOn} noteOff={noteOff} />);
    fireEvent.click(screen.getByLabelText('Chord mode'));

    const chordSelect = screen.getByLabelText('Chord type');
    fireEvent.change(chordSelect, { target: { value: '7' } });
    const c7 = padByIndex(0);
    press(c7);
    expect(noteOn).toHaveBeenCalledWith(60, expect.any(Number));
    expect(noteOn).toHaveBeenCalledWith(64, expect.any(Number));
    expect(noteOn).toHaveBeenCalledWith(67, expect.any(Number));
    expect(noteOn).toHaveBeenCalledWith(70, expect.any(Number));
    release(c7);
    expect(noteOff).toHaveBeenCalledWith(70);

    fireEvent.change(chordSelect, { target: { value: 'maj9' } });
    const cmaj9 = padByIndex(0);
    press(cmaj9);
    expect(noteOn).toHaveBeenCalledWith(74, expect.any(Number));
    release(cmaj9);
  });

  it('chord type selector is disabled unless chord mode is on', () => {
    render(<PadInstrument noteOn={vi.fn()} noteOff={vi.fn()} />);
    expect((screen.getByLabelText('Chord type') as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Chord mode'));
    expect((screen.getByLabelText('Chord type') as HTMLSelectElement).disabled).toBe(false);
  });

  it('hold latch sustains until toggled off', () => {
    const noteOn = vi.fn();
    const noteOff = vi.fn();
    render(<PadInstrument noteOn={noteOn} noteOff={noteOff} />);
    fireEvent.click(screen.getByLabelText('Hold'));

    const c4 = pad('C4');
    press(c4);
    release(c4);
    expect(noteOff).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/^Hold/));
    expect(noteOff).toHaveBeenCalledWith(60);
  });

  it('drops notes when disconnected and panics held ones', () => {
    const noteOn = vi.fn();
    const noteOff = vi.fn();
    const { rerender } = render(<PadInstrument noteOn={noteOn} noteOff={noteOff} connected />);

    press(pad('C4'));
    expect(noteOn).toHaveBeenCalled();

    rerender(<PadInstrument noteOn={noteOn} noteOff={noteOff} connected={false} />);
    expect(noteOff).toHaveBeenCalledWith(60);
  });

  it('glissando slides to the pad under the finger', () => {
    const noteOn = vi.fn();
    const noteOff = vi.fn();
    render(<PadInstrument noteOn={noteOn} noteOff={noteOff} />);

    const c4 = pad('C4');
    press(c4);

    // Finger moves onto the D4 pad
    const d4 = pad('D4');
    document.elementFromPoint = vi.fn(() => d4) as any;
    fireEvent.pointerMove(c4, { pointerId: 1, clientY: 10 });

    expect(noteOff).toHaveBeenCalledWith(60);
    expect(noteOn).toHaveBeenCalledWith(62, expect.any(Number));

    release(d4);
    expect(noteOff).toHaveBeenCalledWith(62);
  });

  it('hold sustains across pad presses in different octaves', () => {
    const noteOn = vi.fn();
    const noteOff = vi.fn();
    render(<PadInstrument noteOn={noteOn} noteOff={noteOff} />);
    fireEvent.click(screen.getByLabelText('Hold'));
    fireEvent.click(screen.getByLabelText('Octave down')); // octave 3 -> C3

    const c3 = padByIndex(0); // C3
    press(c3);
    release(c3);
    expect(noteOff).not.toHaveBeenCalled();

    const c4 = padByIndex(7); // C4 (major scale, one octave up)
    press(c4);
    release(c4);
    expect(noteOff).not.toHaveBeenCalled();
  });

  it('hold sustains the glide target note', () => {
    const noteOn = vi.fn();
    const noteOff = vi.fn();
    render(<PadInstrument noteOn={noteOn} noteOff={noteOff} />);
    fireEvent.click(screen.getByLabelText('Hold'));

    const c3 = padByIndex(0); // C4 at default octave
    press(c3);

    const c4 = padByIndex(7);
    document.elementFromPoint = vi.fn(() => c4) as any;
    fireEvent.pointerMove(c3, { pointerId: 1, clientY: 10 });

    release(c4);
    // The glide target (72 = C5 here) should be latched, not released
    expect(noteOff).not.toHaveBeenCalledWith(72);
  });

  it('changing octave does not release latched notes', () => {
    const noteOn = vi.fn();
    const noteOff = vi.fn();
    render(<PadInstrument noteOn={noteOn} noteOff={noteOff} />);
    fireEvent.click(screen.getByLabelText('Hold'));
    fireEvent.click(screen.getByLabelText('Octave down')); // octave 3

    const c3 = padByIndex(0);
    press(c3);
    release(c3);
    expect(noteOff).not.toHaveBeenCalled(); // latched

    // Go from C3 to C4 — the latched note must keep sustaining
    fireEvent.click(screen.getByLabelText('Octave up'));
    expect(noteOff).not.toHaveBeenCalledWith(48);

    // Toggling hold off finally releases it
    fireEvent.click(screen.getByLabelText(/^Hold/));
    expect(noteOff).toHaveBeenCalledWith(48);
  });

  it('remembers config across unmount/remount', () => {
    const { unmount } = render(<PadInstrument noteOn={vi.fn()} noteOff={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Scale'), { target: { value: 'Minor Pentatonic' } });
    fireEvent.change(screen.getByLabelText('Root note'), { target: { value: '7' } }); // G
    fireEvent.click(screen.getByLabelText('Octave up')); // octave 5
    fireEvent.click(screen.getByLabelText('Chord mode'));
    fireEvent.change(screen.getByLabelText('Chord type'), { target: { value: 'm7' } });
    fireEvent.click(screen.getByLabelText('Hold'));
    unmount();

    render(<PadInstrument noteOn={vi.fn()} noteOff={vi.fn()} />);
    expect((screen.getByLabelText('Scale') as HTMLSelectElement).value).toBe('Minor Pentatonic');
    expect((screen.getByLabelText('Root note') as HTMLSelectElement).value).toBe('7');
    expect(document.querySelector('[data-pad="0"]')?.textContent).toBe('Gm7'); // G root, m7, octave 5
    expect(screen.getByLabelText('Chord mode').className).toContain('accent-orange');
    expect((screen.getByLabelText('Chord type') as HTMLSelectElement).value).toBe('m7');
    expect(screen.getByLabelText(/^Hold/).className).toContain('accent-orange');
  });
});
