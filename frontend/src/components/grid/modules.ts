// Module definitions for the Grid tab.
//
// A module is a hand-authored layout for a specific plugin: which of its
// parameters to show, as what kind of control, grouped into which panels.
// Panels run left to right at a fixed height, so a module that outgrows the
// screen is panned rather than shrunk.
//
// Controls reference JSFX slider numbers; resolveParam maps those onto
// whatever indices REAPER actually reports.

import { yutaniModule } from './yutani';
import { seqsModule } from './seqs';
import { midiArpModule } from './midiarp';

/**
 * The three modulation modes, named as the plugin's own buttons are.
 *
 * Every knob can have a depth per mode: how far velocity, the mod wheel or the
 * free LFO moves it. Those are separate parameters, but they aren't separate
 * controls — you reach them by latching a mode and dragging the parent knob.
 */
export const MODIFIER_KINDS = ['vel', 'mod', 'lfo'] as const;
export type ModifierKind = (typeof MODIFIER_KINDS)[number];

export const MODIFIER_LABELS: Record<ModifierKind, string> = {
  vel: 'VEL', mod: 'MOD', lfo: 'LINK',
};

export interface ModifierRef {
  kind: ModifierKind;
  slider: number;
  expect?: string;
}

interface ControlBase {
  /**
   * The JSFX slider number this control drives, 1-based as declared in the
   * source. Used as a hint, not a promise: see resolveParam.
   */
  slider: number;
  /**
   * The parameter name REAPER should report for that slider. Lets the
   * resolver confirm it found the right one, which matters because slider
   * numbering and REAPER's parameter indexing don't necessarily agree —
   * Yutani declares 1-66, 71-73 and 80-81, with gaps.
   */
  expect?: string;
  label: string;
  /**
   * Modulation depths edited through this control. Only knobs carry these —
   * a depth on a discrete choice would mean nothing.
   */
  modifiers?: ModifierRef[];
}

export interface KnobControl extends ControlBase {
  kind: 'knob';
  /** Overrides the plugin's own formatting. */
  format?: (v: number) => string;
}

export interface SegmentedControl extends ControlBase {
  kind: 'segmented';
  options: { value: number; label: string }[];
}

export interface FaderControl extends ControlBase {
  kind: 'fader';
  format?: (v: number) => string;
}

export interface ToggleControl extends ControlBase {
  kind: 'toggle';
}

/**
 * Horizontal slider like the Track Overview's ParamSlider. Used by the
 * auto-generated fallback panels for plugins without a hand-authored module.
 */
export interface ParamSliderControl extends ControlBase {
  kind: 'paramslider';
}

/**
 * A rectangular window onto a pattern buffer — the arp's note grid.
 *
 * One parameter per cell, laid out row-major from `firstSlider`. Unpacked, in
 * contrast to StepGridControl below: packing four steps into one float means a
 * single rounding anywhere in the host's parameter path corrupts all four, and
 * there is no need for it when the plugin has sliders to spare.
 *
 * Cells carry the plugin's own encoding: 0 is empty, a positive value starts a
 * note, and negatives continue the note before it. That is what lets a run of
 * cells read as one held note rather than several repeats.
 */
export interface NoteGridControl extends ControlBase {
  kind: 'notegrid';
  rows: number;
  cols: number;
  /** First cell parameter; cells run row-major from here. */
  firstSlider: number;
  /** Scrolls the window over the pattern's rows. */
  rowOffsetSlider: number;
  /** Pages the window across columns, for patterns longer than `cols`. */
  colPageSlider?: number;
  /**
   * Names for the pattern's fixed rows, keyed by absolute row index. The arp
   * keeps its modulators at 50-59; everything below is a note line.
   */
  rowNames?: Record<number, string>;
}

/**
 * A row of step cells for a sequencer pattern.
 *
 * Step values are packed into the slider params: 4 steps per slider, each step
 * occupying 1/4 of the slider's range. The patched JSFX handles the packing
 * on the @slider side, and this widget handles it on the frontend side.
 *
 * Multiple rows stack vertically to form the full sequencer grid, matching
 * how SEQS draws all effect rows at once.
 */
export interface StepGridControl extends ControlBase {
  kind: 'stepgrid';
  /** Number of visible steps (3-64, default 32). */
  steps: number;
  /** Maximum value a step can hold (varies per effect row). */
  maxValue: number;
  /**
   * 8 slider indices that hold the packed step data.
   * Each slider packs 4 steps: `step = floor(sliderValue * 4)`.
   * slider 0 = steps 0-3, slider 1 = steps 4-7, etc.
   */
  stepSliders: [number, number, number, number, number, number, number, number];
  /**
   * The slider index that controls which effect row is loaded into the step
   * window sliders. Only used by the row selector at the top of the grid.
   */
  rowSelector?: number;
}

export type ModuleControl =
  | KnobControl | SegmentedControl | FaderControl | ToggleControl | StepGridControl
  | ParamSliderControl | NoteGridControl;

/** Minimal shape of what the backend reports per parameter. */
export interface ResolvableParam {
  index: number;
  name: string;
}

/**
 * Find the parameter a control refers to.
 *
 * A JSFX slider number is not necessarily REAPER's parameter index. Yutani
 * declares sliders 1-66, 71-73 and 80-81, and whether REAPER compacts those
 * gaps or preserves them changes every index past 66. Rather than depend on
 * which, this treats the slider number as a starting guess and confirms it
 * against the name the module expects.
 *
 * Falls back to searching by name, preferring the candidate nearest the
 * expected position when a plugin reuses a label — Yutani has three
 * parameters called "Detune [semitones]".
 */
export function resolveParam<T extends ResolvableParam>(
  params: T[],
  control: { slider: number; expect?: string },
): T | undefined {
  const guess = control.slider - 1;

  if (!control.expect) {
    return params.find((p) => p.index === guess);
  }

  const atGuess = params.find((p) => p.index === guess);
  if (atGuess?.name === control.expect) return atGuess;

  const matches = params.filter((p) => p.name === control.expect);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return matches.reduce((best, p) =>
      Math.abs(p.index - guess) < Math.abs(best.index - guess) ? p : best);
  }
  return undefined;
}

export interface ModulePanel {
  label: string;
  /**
   * Which tab this panel belongs to, as an index into ModuleDef.groups.
   * Absent means the module isn't tabbed and every panel is shown at once.
   */
  group?: number;
  controls: ModuleControl[];
  /** Lay the panel's controls out in a row (default) or a grid of N columns. */
  columns?: number;
  /**
   * The switch that turns the whole section on and off. Shown in the panel's
   * header and dimming its contents when off, which is what the plugin does
   * with the same parameter.
   */
  enable?: { slider: number; expect?: string };
}

export interface ModuleDef {
  /** Human name shown in the Grid header. */
  title: string;
  /**
   * Matched against the FX name REAPER reports, after the format prefix is
   * stripped. Kept deliberately loose — JSFX idents are file paths and vary
   * by install location.
   */
  match: (cleanName: string) => boolean;
  /**
   * Tab names, in order. Present only for modules big enough to need them:
   * Yutani's 22 panels are several screens wide, and panning through all of
   * them to reach the filter is worse than one tap.
   *
   * The split follows the plugin's own layout rows rather than categories we
   * invented — Yutani draws its sections in four rows, and those rows already
   * mean sources, filter, envelopes, modulation.
   */
  groups?: string[];
  panels: ModulePanel[];
}

// ── Cockos Chorus ────────────────────────────────────────────
//
// REAPER presents all six parameters as identical sliders, which hides the
// shape of the effect: voice count is a discrete choice, rate/depth/time are
// continuous motion controls, and the two mixes are levels. Ableton's
// equivalent splits them the same way — Taps as buttons, Time/Rate/Amount as
// knobs, levels separate.
//
// "Pitch Fudge Factor" is relabelled Depth: in the source it scales
// `csize = choruslen/numvoices * slider4`, i.e. how far each voice's delay
// swings. Depth is what it does.
const chorus: ModuleDef = {
  title: 'Chorus',
  match: (n) => n.toLowerCase() === 'chorus',
  panels: [
    {
      label: 'Voices',
      columns: 4,
      controls: [
        {
          kind: 'segmented',
          slider: 2,
          expect: 'Number Of Voices',
          label: 'Voices',
          options: Array.from({ length: 8 }, (_, i) => ({
            value: i + 1,
            label: String(i + 1),
          })),
        },
      ],
    },
    {
      label: 'Motion',
      controls: [
        { kind: 'knob', slider: 3, expect: 'Rate (Hz)', label: 'Rate', format: (v) => `${v.toFixed(2)} Hz` },
        { kind: 'knob', slider: 4, expect: 'Pitch Fudge Factor', label: 'Depth', format: (v) => `${Math.round(v * 100)}%` },
        { kind: 'knob', slider: 1, expect: 'Chorus Length (ms)', label: 'Time', format: (v) => `${Math.round(v)} ms` },
      ],
    },
    {
      label: 'Output',
      controls: [
        { kind: 'fader', slider: 5, expect: 'Wet Mix (dB)', label: 'Wet', format: (v) => `${Math.round(v)} dB` },
        { kind: 'fader', slider: 6, expect: 'Dry Mix (dB)', label: 'Dry', format: (v) => `${Math.round(v)} dB` },
      ],
    },
  ],
};

// ── ReaDelay / Stock delay ──────────────────────────────────
//
// The classic Cockos multi-tap delay. REAPER exposes its taps as a flat list
// of parameters with a "N:" prefix, making it hard to see what belongs to
// which tap and leaving the time mode unlabelled — note divisions and raw
// milliseconds share the same value range.
//
// Layout follows Ableton's Delay: time on the left, character in the middle,
// mix on the right.
const stockDelayModule: ModuleDef = {
  title: 'Stock delay',
  match: (n) => n.toLowerCase().includes('stock delay'),
  panels: [
    {
      label: 'Time',
      controls: [
        { kind: 'knob', slider: 3, expect: '1: Length (time)', label: 'ms', format: (v) => `${Math.round(v * 5000)} ms` },
        { kind: 'knob', slider: 4, expect: '1: Length (musical)', label: 'Notes' },
      ],
    },
    {
      label: 'Character',
      controls: [
        { kind: 'knob', slider: 5, expect: '1: Feedback', label: 'Feedback', format: (v) => `${Math.round(v * 100)}%` },
        { kind: 'knob', slider: 6, expect: '1: Lowpass', label: 'Low cut', format: (v) => `${Math.round(v * 20000)} Hz` },
        { kind: 'knob', slider: 7, expect: '1: Hipass', label: 'High cut', format: (v) => `${Math.round(v * 20000)} Hz` },
        { kind: 'knob', slider: 8, expect: '1: Resolution', label: 'Bits', format: (v) => `${Math.round(v * 24) || 1} bit` },
        { kind: 'knob', slider: 9, expect: '1: Stereo width', label: 'Width', format: (v) => `${(v * 100).toFixed(0)}%` },
      ],
    },
    {
      label: 'Mix',
      controls: [
        { kind: 'fader', slider: 0, expect: 'Wet', label: 'Wet', format: (v) => `${Math.round((v - 1) * 100)}%` },
        { kind: 'fader', slider: 1, expect: 'Dry', label: 'Dry', format: (v) => `${Math.round((v - 1) * 100)}%` },
        { kind: 'knob', slider: 10, expect: '1: Volume', label: 'Vol', format: (v) => `${Math.round((v - 1) * 100)}%` },
        { kind: 'knob', slider: 11, expect: '1: Pan', label: 'Pan', format: (v) => `${((v - 0.5) * 2 * 100).toFixed(0)}%` },
      ],
    },
    {
      label: 'Options',
      controls: [
        { kind: 'toggle', slider: 2, expect: '1: Enabled', label: 'Tap on' },
        { kind: 'toggle', slider: 12, expect: 'Bypass', label: 'Bypass' },
        { kind: 'fader', slider: 13, expect: 'Wet', label: 'Wet %', format: (v) => `${Math.round(v * 100)}%` },
      ],
    },
  ],
};

// ── ReaPitch / Stock pitch shifter ──────────────────────────
//
// Pitch, formant, and mix — three panels, no tabs. The pitch section
// exposes all four shift modes (octaves, semitones, cents, full range)
// alongside the tap on/off so you can dial in the exact interval and
// fine-tune it without switching modes.
const pitchShiftModule: ModuleDef = {
  title: 'Stock pitch shifter',
  match: (n) => n.toLowerCase().includes('stock pitch shifter'),
  panels: [
    {
      label: 'Pitch',
      controls: [
        { kind: 'knob', slider: 6, expect: '1: Shift (oct)', label: 'Oct', format: (v) => `${Math.round((v - 0.5) * 4)}` },
        { kind: 'knob', slider: 5, expect: '1: Shift (semitones)', label: 'Semi', format: (v) => `${v >= 0.5 ? '+' : ''}${Math.round((v - 0.5) * 24)}` },
        { kind: 'knob', slider: 4, expect: '1: Shift (cents)', label: 'Cents', format: (v) => `${v >= 0.5 ? '+' : ''}${Math.round((v - 0.5) * 200)}` },
        { kind: 'knob', slider: 3, expect: '1: Shift (full range)', label: 'Range', format: (v) => `${v >= 0.5 ? '+' : ''}${Math.round((v - 0.5) * 100)}%` },
        { kind: 'toggle', slider: 2, expect: '1: Enabled', label: 'On' },
      ],
    },
    {
      label: 'Formant',
      controls: [
        { kind: 'knob', slider: 7, expect: '1: Formant adjust (full range)', label: 'Range', format: (v) => `${v >= 0.5 ? '+' : ''}${Math.round((v - 0.5) * 100)}%` },
        { kind: 'knob', slider: 8, expect: '1: Formant adjust (cents)', label: 'Cents', format: (v) => `${v >= 0.5 ? '+' : ''}${Math.round((v - 0.5) * 200)}` },
        { kind: 'knob', slider: 9, expect: '1: Formant adjust (semitones)', label: 'Semi', format: (v) => `${v >= 0.5 ? '+' : ''}${Math.round((v - 0.5) * 24)}` },
      ],
    },
    {
      label: 'Mix',
      controls: [
        { kind: 'fader', slider: 0, expect: 'Wet', label: 'Wet', format: (v) => `${(v >= 1 ? '+' : '')}${Math.round((v - 1) * 100)}%` },
        { kind: 'fader', slider: 1, expect: 'Dry', label: 'Dry', format: (v) => `${(v >= 1 ? '+' : '')}${Math.round((v - 1) * 100)}%` },
        { kind: 'knob', slider: 10, expect: '1: Volume', label: 'Vol', format: (v) => `${(v >= 1 ? '+' : '')}${Math.round((v - 1) * 100)}%` },
        { kind: 'knob', slider: 11, expect: '1: Pan', label: 'Pan', format: (v) => `${((v - 0.5) * 2 * 100).toFixed(0)}%` },
      ],
    },
  ],
};

const MODULES: ModuleDef[] = [chorus, yutaniModule, stockDelayModule, seqsModule, pitchShiftModule, midiArpModule];

/** Strip REAPER's format prefix, e.g. "JS: Chorus" -> "Chorus". */
export function cleanFxName(name: string): string {
  return name.replace(/^(VST3?i?:\s*|CLAPi?:\s*|AUi?:\s*|DX:\s*|JS:\s*)/, '').trim();
}

export function findModule(fxName: string): ModuleDef | null {
  const clean = cleanFxName(fxName);
  return MODULES.find((m) => m.match(clean)) ?? null;
}

// ── Fallback: auto-generated panels for plugins without a module ──

export function autoControlType(
  min: number, max: number, step?: number,
): 'paramslider' | 'toggle' {
  if (min === 0 && max === 1 && (step ?? 0.000001) >= 1) return 'toggle';
  if (max - min <= 1 && (step ?? 0.000001) >= 0.5) return 'toggle';
  return 'paramslider';
}

/**
 * Generate panels from a raw parameter list. Used when a plugin has no
 * hand-authored module — every parameter becomes a control, grouped into
 * a single panel labelled after the plugin.
 */
export function fallbackModule(params: { index: number; name: string; min: number; max: number }[], fxName: string): ModuleDef {
  const clean = cleanFxName(fxName);
  return {
    title: clean,
    match: () => false,
    panels: params.length > 0 ? [{
      label: 'Controls',
      controls: params.map((p) => {
        const kind = autoControlType(p.min, p.max);
        if (kind === 'toggle') {
          return { kind: 'toggle' as const, slider: p.index + 1, expect: p.name, label: p.name };
        }
        return { kind: 'paramslider' as const, slider: p.index + 1, expect: p.name, label: p.name };
      }),
    }] : [],
  };
}
