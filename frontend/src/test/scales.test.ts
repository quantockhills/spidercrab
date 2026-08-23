import { describe, it, expect } from 'vitest';
import {
  SCALES, CHORD_TYPES, padPitch, chordNotesFor, chordLabel, noteName,
} from '../lib/scales';

function chord(id: string) {
  const found = CHORD_TYPES.find((c) => c.id === id);
  if (!found) throw new Error(`unknown chord type ${id}`);
  return found;
}

describe('padPitch', () => {
  it('walks the major scale from the root', () => {
    const major = SCALES.Major;
    expect(padPitch(0, major, 0, 4)).toBe(60); // C4
    expect(padPitch(1, major, 0, 4)).toBe(62); // D4
    expect(padPitch(6, major, 0, 4)).toBe(71); // B4
    expect(padPitch(7, major, 0, 4)).toBe(72); // C5 — wraps into the next octave
  });

  it('chromatic is one semitone per pad', () => {
    expect(padPitch(1, SCALES.Chromatic, 0, 4)).toBe(61);
    expect(padPitch(12, SCALES.Chromatic, 0, 4)).toBe(72);
  });

  it('respects root and octave', () => {
    expect(padPitch(0, SCALES.Major, 9, 3)).toBe(57); // A3
    expect(padPitch(0, SCALES.Major, 7, 5)).toBe(79); // G5
  });

  it('negative index wraps one octave below the root', () => {
    expect(padPitch(-1, SCALES.Major, 0, 4)).toBe(59); // B3 — degree 6, one octave down
  });
});

describe('chordNotesFor', () => {
  it('diatonic triad follows the scale', () => {
    expect(chordNotesFor(0, chord('triad'), SCALES.Major, 0, 4)).toEqual([60, 64, 67]); // C E G
    expect(chordNotesFor(0, chord('triad'), SCALES['Natural Minor'], 0, 4)).toEqual([60, 63, 67]); // C Eb G
    expect(chordNotesFor(6, chord('triad'), SCALES.Major, 0, 4)).toEqual([71, 74, 77]); // B D F
  });

  it('chromatic triads step the scale (root, +2, +4 semitones)', () => {
    expect(chordNotesFor(0, chord('triad'), SCALES.Chromatic, 0, 4)).toEqual([60, 62, 64]);
  });

  it('sus2 and sus4', () => {
    expect(chordNotesFor(0, chord('sus2'), SCALES.Major, 0, 4)).toEqual([60, 62, 67]);
    expect(chordNotesFor(0, chord('sus4'), SCALES.Major, 0, 4)).toEqual([60, 65, 67]);
  });

  it('augmented and diminished', () => {
    expect(chordNotesFor(0, chord('aug'), SCALES.Major, 0, 4)).toEqual([60, 64, 68]);
    expect(chordNotesFor(0, chord('dim'), SCALES.Major, 0, 4)).toEqual([60, 63, 66]);
  });

  it('sevenths', () => {
    expect(chordNotesFor(0, chord('7'), SCALES.Major, 0, 4)).toEqual([60, 64, 67, 70]);
    expect(chordNotesFor(0, chord('maj7'), SCALES.Major, 0, 4)).toEqual([60, 64, 67, 71]);
    expect(chordNotesFor(0, chord('m7'), SCALES.Major, 0, 4)).toEqual([60, 63, 67, 70]);
    expect(chordNotesFor(0, chord('m7b5'), SCALES.Major, 0, 4)).toEqual([60, 63, 66, 70]);
    expect(chordNotesFor(0, chord('dim7'), SCALES.Major, 0, 4)).toEqual([60, 63, 66, 69]);
  });

  it('ninths and beyond', () => {
    expect(chordNotesFor(0, chord('9'), SCALES.Major, 0, 4)).toEqual([60, 64, 67, 70, 74]);
    expect(chordNotesFor(0, chord('maj9'), SCALES.Major, 0, 4)).toEqual([60, 64, 67, 71, 74]);
    expect(chordNotesFor(0, chord('m9'), SCALES.Major, 0, 4)).toEqual([60, 63, 67, 70, 74]);
    expect(chordNotesFor(0, chord('add9'), SCALES.Major, 0, 4)).toEqual([60, 64, 67, 74]);
  });

  it('fixed-interval chords build off the pad pitch anywhere', () => {
    // A4 root on pad 0 (root A, octave 4), 7th chord
    expect(chordNotesFor(0, chord('7'), SCALES.Major, 9, 4)).toEqual([69, 73, 76, 79]);
  });
});

describe('chordLabel', () => {
  it('renders chord symbols without octaves', () => {
    expect(chordLabel(0, chord('triad'), SCALES.Major, 0, 4)).toBe('C');
    expect(chordLabel(0, chord('maj'), SCALES.Major, 0, 4)).toBe('C');
    expect(chordLabel(0, chord('7'), SCALES.Major, 0, 4)).toBe('C7');
    expect(chordLabel(0, chord('maj7'), SCALES.Major, 0, 4)).toBe('Cmaj7');
    expect(chordLabel(0, chord('m9'), SCALES.Major, 0, 4)).toBe('Cm9');
    expect(chordLabel(0, chord('sus4'), SCALES.Major, 0, 4)).toBe('Csus4');
  });
});

describe('noteName', () => {
  it('names MIDI pitches', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(48)).toBe('C3');
    expect(noteName(69)).toBe('A4');
  });
});
