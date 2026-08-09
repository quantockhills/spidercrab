// MIDI ARP — laid out as the plugin's own control bar.
//
// Saike's arp declares all 40 of its sliders hidden (a `-` before the label),
// so REAPER shows none of them and neither does the plugin: everything is
// driven from its @gfx. That makes the source the only description of what
// the thing actually offers, and reading it gives a single row of controls:
//
//   [Sort] « pattern » [follow] ▲length▼ −speed+ [spd]
//   [Copy][Paste][Randomize] [poly] [oct] [Vel][Mod][CC] [swing]
//
// This module is that row, in that order. What it deliberately leaves out of
// the first tab is the CC assignment plumbing — eight sets of number, minimum
// and maximum. Those are not performance controls; in the plugin they are
// per-row settings behind a right-click menu, and putting all 24 on the main
// surface buries the dozen controls that matter.
//
// Copy, Paste and Randomize have no parameter behind them. They act on the
// pattern buffer directly from @gfx, so there is nothing for a host to drive
// and nothing this module can offer.
//
// Slider numbers follow the patched copy: 1-40 as declared, 41-57 promoted.
import type { ModuleDef } from './modules';

/** The plugin prints speed as a multiplier above 1x and a division below. */
const speed = (v: number) => (v > 0 ? `${Math.round(v)}` : `1/${Math.abs(Math.round(v)) + 2}`);

const cc = (n: number, choice: number, min: number, max: number) => ({
  label: `CC ${n}`,
  group: 1,
  controls: [
    { kind: 'knob' as const, slider: choice, expect: `Assignable CC${n}`, label: 'Number', format: (v: number) => `${Math.round(v)}` },
    { kind: 'knob' as const, slider: min, expect: `Minimum Assignable CC${n}`, label: 'Min', format: (v: number) => `${Math.round(v)}` },
    { kind: 'knob' as const, slider: max, expect: `Maximum Assignable CC${n}`, label: 'Max', format: (v: number) => `${Math.round(v)}` },
  ],
});

export const midiArpModule: ModuleDef = {
  title: 'MIDI ARP',
  match: (n) => n.toLowerCase().includes('midi arp'),
  groups: ['Arp', 'Setup'],
  panels: [
    // ── Arp: the plugin's control bar, in its own order ──────
    {
      label: 'Pattern',
      group: 0,
      controls: [
        { kind: 'knob', slider: 55, expect: 'Viewed Pattern Index', label: 'Pattern', format: (v) => `${Math.round(v)}` },
        // Decoupling what you see from what you hear is the point of this
        // switch, so it belongs next to the pattern it governs.
        { kind: 'toggle', slider: 56, expect: 'Follow Current Pattern', label: 'Follow' },
        { kind: 'knob', slider: 39, expect: 'Loop length', label: 'Length', format: (v) => `${Math.round(v)}` },
      ],
    },
    {
      label: 'Speed',
      group: 0,
      controls: [
        { kind: 'knob', slider: 1, expect: 'Current speed', label: 'Speed', format: speed },
        { kind: 'toggle', slider: 38, expect: 'Enable speed override', label: 'Override' },
        { kind: 'knob', slider: 23, expect: 'Swing', label: 'Swing', format: (v) => `${Math.round(v)}%` },
      ],
    },
    {
      label: 'Clock',
      group: 0,
      controls: [
        // The plugin draws these as Host, Free, MIDI but numbers them 0, 2, 1.
        { kind: 'segmented', slider: 54, expect: 'Time Mode', label: 'Clock', options: [
          { value: 0, label: 'Host' },
          { value: 2, label: 'Free' },
          { value: 1, label: 'MIDI' },
        ] },
      ],
    },
    {
      label: 'Notes',
      group: 0,
      controls: [
        { kind: 'knob', slider: 3, expect: 'Max Polyphony', label: 'Voices', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 5, expect: 'Extra octaves', label: 'Octaves', format: (v) => `${Math.round(v)}` },
        // Three, not six. The declaration reads <0,5,1> but the GUI only ever
        // draws buttons for 0, 1 and 2.
        { kind: 'segmented', slider: 4, expect: 'Poly Mode', label: 'Repeat', options: [
          { value: 0, label: 'Once' },
          { value: 1, label: 'Rep' },
          { value: 2, label: 'Bidi' },
        ] },
        { kind: 'toggle', slider: 53, expect: 'Enable Midi Sort', label: 'Sort notes' },
      ],
    },
    {
      // Which rows the pattern grid shows. In the plugin one "CC" button adds
      // the next row and right-click removes the last, so these eight are
      // really a count — but they are eight parameters, and eight switches is
      // the honest way to drive them from here.
      label: 'Grid rows',
      group: 0,
      controls: [
        { kind: 'toggle', slider: 42, expect: 'Enable Velocity', label: 'Vel' },
        { kind: 'toggle', slider: 43, expect: 'Enable Mod', label: 'Mod' },
        { kind: 'toggle', slider: 44, expect: 'Enable Cc1', label: 'CC 1' },
        { kind: 'toggle', slider: 45, expect: 'Enable Cc2', label: 'CC 2' },
        { kind: 'toggle', slider: 46, expect: 'Enable Cc3', label: 'CC 3' },
        { kind: 'toggle', slider: 47, expect: 'Enable Cc4', label: 'CC 4' },
        { kind: 'toggle', slider: 48, expect: 'Enable Cc5', label: 'CC 5' },
        { kind: 'toggle', slider: 49, expect: 'Enable Cc6', label: 'CC 6' },
        { kind: 'toggle', slider: 50, expect: 'Enable Cc7', label: 'CC 7' },
        { kind: 'toggle', slider: 51, expect: 'Enable Cc8', label: 'CC 8' },
      ],
    },

    // ── Setup: what the plugin keeps behind right-click menus ──
    {
      label: 'MIDI',
      group: 1,
      controls: [
        { kind: 'knob', slider: 24, expect: 'In channel', label: 'In', format: (v) => (v < 1 ? 'All' : `${Math.round(v)}`) },
        { kind: 'knob', slider: 25, expect: 'Out channel', label: 'Out', format: (v) => `${Math.round(v)}` },
        { kind: 'toggle', slider: 52, expect: 'Disable Midi', label: 'Passthrough' },
      ],
    },
    {
      label: 'Ranges',
      group: 1,
      controls: [
        { kind: 'knob', slider: 6, expect: 'Minimum Velocity', label: 'Vel min', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 7, expect: 'Maximum Velocity', label: 'Vel max', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 8, expect: 'Minimum Modwheel', label: 'Mod min', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 9, expect: 'Maximum Modwheel', label: 'Mod max', format: (v) => `${Math.round(v)}` },
      ],
    },
    {
      label: 'Reset',
      group: 1,
      controls: [
        { kind: 'toggle', slider: 57, expect: 'Reset On Cc', label: 'On CC' },
        { kind: 'knob', slider: 40, expect: 'CC which resets MIDI position', label: 'CC', format: (v) => `${Math.round(v)}` },
      ],
    },
    cc(1, 10, 11, 12),
    cc(2, 13, 14, 15),
    cc(3, 16, 17, 18),
    cc(4, 19, 20, 21),
    cc(5, 26, 27, 28),
    cc(6, 29, 30, 31),
    cc(7, 32, 33, 34),
    cc(8, 35, 36, 37),
  ],
};
