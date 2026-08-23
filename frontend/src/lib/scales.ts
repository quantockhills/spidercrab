// Scale/pitch math for the pad instrument.
//
// Pads are arranged like an Ableton-Push scale grid: pad index ascends
// left-to-right, bottom-to-top, and each step walks the scale's degrees,
// wrapping into the next octave. Pad 0 = root note at the base octave.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Scale definitions as semitone offsets from the root
export const SCALES: Record<string, number[]> = {
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  Major: [0, 2, 4, 5, 7, 9, 11],
  'Natural Minor': [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  'Major Pentatonic': [0, 2, 4, 7, 9],
  'Minor Pentatonic': [0, 3, 5, 7, 10],
};

export const SCALE_IDS = Object.keys(SCALES);

export const PAD_COUNT = 16;

export const ROOTS = NOTE_NAMES;

// MIDI pitch for a pad. `root` is the semitone (0-11), `octave` is the
// octave number of pad 0 (MIDI 60 = C4, i.e. octave 4).
export function padPitch(padIndex: number, scale: number[], root: number, octave: number): number {
  const len = scale.length;
  const degree = ((padIndex % len) + len) % len;
  const octaveShift = Math.floor(padIndex / len);
  return root + (octave + 1 + octaveShift) * 12 + scale[degree];
}

// Diatonic triad on the pad's scale degree: the root, third, and fifth
// scale degrees above it (0, +2, +4 steps in scale-index space). For a
// major scale this yields maj/min/min/maj/maj/min/dim around the cycle.
export function chordNotesFor(
  padIndex: number,
  chordType: ChordType,
  scale: number[],
  root: number,
  octave: number,
): number[] {
  if (!chordType.intervals) {
    return [0, 2, 4].map((d) => padPitch(padIndex + d, scale, root, octave));
  }
  const chordRoot = padPitch(padIndex, scale, root, octave);
  return chordType.intervals.map((i) => chordRoot + i);
}

// Chord symbol for the pad label, e.g. C, C7, Cm9, Csus4 (no octave —
// chord symbols don't carry one, the grid position implies it).
export function chordLabel(
  padIndex: number,
  chordType: ChordType,
  scale: number[],
  root: number,
  octave: number,
): string {
  const chordRoot = padPitch(padIndex, scale, root, octave);
  const semitone = ((chordRoot % 12) + 12) % 12;
  return NOTE_NAMES[semitone] + (chordType.suffix ?? '');
}

// MIDI pitch -> display name, e.g. 60 -> "C4"
export function noteName(pitch: number): string {
  const semitone = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  return `${NOTE_NAMES[semitone]}${octave}`;
}

// Chord voicings for chord mode. A chord type without `intervals` is the
// diatonic triad (follows the scale's maj/min/dim pattern per degree).
// Fixed-interval types build chromatically off the pad's pitch.
export interface ChordType {
  id: string;
  label: string;
  intervals?: number[]; // semitones above the root
  suffix?: string;      // chord symbol suffix for pad labels
}

export const CHORD_TYPES: ChordType[] = [
  { id: 'triad', label: 'Triad (key)' },
  { id: 'maj', label: 'Major', intervals: [0, 4, 7], suffix: '' },
  { id: 'min', label: 'Minor', intervals: [0, 3, 7], suffix: 'm' },
  { id: 'sus2', label: 'Sus2', intervals: [0, 2, 7], suffix: 'sus2' },
  { id: 'sus4', label: 'Sus4', intervals: [0, 5, 7], suffix: 'sus4' },
  { id: 'aug', label: 'Augmented', intervals: [0, 4, 8], suffix: 'aug' },
  { id: 'dim', label: 'Diminished', intervals: [0, 3, 6], suffix: 'dim' },
  { id: '6', label: '6th', intervals: [0, 4, 7, 9], suffix: '6' },
  { id: 'm6', label: 'Minor 6th', intervals: [0, 3, 7, 9], suffix: 'm6' },
  { id: '7', label: '7th', intervals: [0, 4, 7, 10], suffix: '7' },
  { id: 'maj7', label: 'Major 7th', intervals: [0, 4, 7, 11], suffix: 'maj7' },
  { id: 'm7', label: 'Minor 7th', intervals: [0, 3, 7, 10], suffix: 'm7' },
  { id: 'm7b5', label: 'Minor 7th b5', intervals: [0, 3, 6, 10], suffix: 'm7b5' },
  { id: 'dim7', label: 'Diminished 7th', intervals: [0, 3, 6, 9], suffix: 'dim7' },
  { id: '7sus4', label: '7 Sus4', intervals: [0, 5, 7, 10], suffix: '7sus4' },
  { id: '9', label: '9th', intervals: [0, 4, 7, 10, 14], suffix: '9' },
  { id: 'maj9', label: 'Major 9th', intervals: [0, 4, 7, 11, 14], suffix: 'maj9' },
  { id: 'm9', label: 'Minor 9th', intervals: [0, 3, 7, 10, 14], suffix: 'm9' },
  { id: 'add9', label: 'Add9', intervals: [0, 4, 7, 14], suffix: 'add9' },
];
