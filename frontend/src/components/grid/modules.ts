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

export type ModuleControl =
  | KnobControl | SegmentedControl | FaderControl | ToggleControl;

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
  control: ModuleControl,
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
  controls: ModuleControl[];
  /** Lay the panel's controls out in a row (default) or a grid of N columns. */
  columns?: number;
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

const MODULES: ModuleDef[] = [chorus, yutaniModule];

/** Strip REAPER's format prefix, e.g. "JS: Chorus" -> "Chorus". */
export function cleanFxName(name: string): string {
  return name.replace(/^(VST3?i?:\s*|CLAPi?:\s*|AUi?:\s*|DX:\s*|JS:\s*)/, '').trim();
}

export function findModule(fxName: string): ModuleDef | null {
  const clean = cleanFxName(fxName);
  return MODULES.find((m) => m.match(clean)) ?? null;
}
