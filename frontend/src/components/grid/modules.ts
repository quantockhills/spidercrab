// Module definitions for the Grid tab.
//
// A module is a hand-authored layout for a specific plugin: which of its
// parameters to show, as what kind of control, grouped into which panels.
// Panels run left to right at a fixed height, so a module that outgrows the
// screen is panned rather than shrunk.
//
// Parameter indices are REAPER's, which are 0-based — a JSFX `slider1:` is
// param 0.

export interface KnobControl {
  kind: 'knob';
  param: number;
  label: string;
  /** Overrides the plugin's own formatting. `{v}` is the value. */
  format?: (v: number) => string;
}

export interface SegmentedControl {
  kind: 'segmented';
  param: number;
  label: string;
  options: { value: number; label: string }[];
}

export interface FaderControl {
  kind: 'fader';
  param: number;
  label: string;
  format?: (v: number) => string;
}

export type ModuleControl = KnobControl | SegmentedControl | FaderControl;

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
          param: 1,
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
        { kind: 'knob', param: 2, label: 'Rate', format: (v) => `${v.toFixed(2)} Hz` },
        { kind: 'knob', param: 3, label: 'Depth', format: (v) => `${Math.round(v * 100)}%` },
        { kind: 'knob', param: 0, label: 'Time', format: (v) => `${Math.round(v)} ms` },
      ],
    },
    {
      label: 'Output',
      controls: [
        { kind: 'fader', param: 4, label: 'Wet', format: (v) => `${Math.round(v)} dB` },
        { kind: 'fader', param: 5, label: 'Dry', format: (v) => `${Math.round(v)} dB` },
      ],
    },
  ],
};

const MODULES: ModuleDef[] = [chorus];

/** Strip REAPER's format prefix, e.g. "JS: Chorus" -> "Chorus". */
export function cleanFxName(name: string): string {
  return name.replace(/^(VST3?i?:\s*|CLAPi?:\s*|AUi?:\s*|DX:\s*|JS:\s*)/, '').trim();
}

export function findModule(fxName: string): ModuleDef | null {
  const clean = cleanFxName(fxName);
  return MODULES.find((m) => m.match(clean)) ?? null;
}
