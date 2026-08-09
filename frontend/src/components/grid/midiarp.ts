// MIDI ARP Grid module.
// 147 parameters: 40 declared + 18 promoted + 88 step window + 1 row selector.
//
// Three tabs: Arp (Ableton-style performance controls), Sequencer (step grid),
// MIDI (I/O and utility).
import type { ModuleDef } from './modules';

// Step window slider base: 8 sliders per row, 11 rows (Speed, Vel, Mod, CC1-8)
const STEP_BASE = 59;
const ROW_SEL = 147;

function stepgrid(label: string, ri: number, mv: number): any {
  const sliders: [number, number, number, number, number, number, number, number] =
    [STEP_BASE + ri * 8, STEP_BASE + ri * 8 + 1, STEP_BASE + ri * 8 + 2, STEP_BASE + ri * 8 + 3,
     STEP_BASE + ri * 8 + 4, STEP_BASE + ri * 8 + 5, STEP_BASE + ri * 8 + 6, STEP_BASE + ri * 8 + 7];
  return {
    kind: 'stepgrid' as const,
    slider: sliders[0],
    label,
    steps: 32,
    maxValue: mv,
    stepSliders: sliders,
    rowSelector: ROW_SEL,
  };
}

export const midiArpModule: ModuleDef = {
  title: 'MIDI ARP',
  match: (n) => n.toLowerCase().indexOf('midi arp') >= 0,
  groups: ['Arp', 'Sequencer', 'MIDI'],
  panels: [
    // ── Arp tab (Ableton-style) ───────────────────────────
    {
      label: 'Engine',
      group: 0,
      controls: [
        { kind: 'knob', slider: 1, expect: 'Current speed', label: 'Rate', format: (v) => `${(v - 6).toFixed(0)}` },
        { kind: 'knob', slider: 2, expect: 'Current pattern', label: 'Pattern', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 23, expect: 'Swing', label: 'Swing', format: (v) => `${v.toFixed(0)}%` },
        { kind: 'knob', slider: 39, expect: 'Loop length', label: 'Loop', format: (v) => `${Math.round(v)}` },
      ],
    },
    {
      label: 'Voices',
      group: 0,
      controls: [
        { kind: 'knob', slider: 3, expect: 'Max Polyphony', label: 'Voices', format: (v) => `${Math.round(v)}` },
        { kind: 'segmented', slider: 4, expect: 'Poly Mode', label: 'Mode', options: [
          { value: 0, label: 'Ext' }, { value: 1, label: 'Rep' }, { value: 2, label: 'B/F' },
          { value: 3, label: 'Up' }, { value: 4, label: 'Dn' }, { value: 5, label: 'U/D' },
        ]},
        { kind: 'knob', slider: 5, expect: 'Extra octaves', label: 'Octaves', format: (v) => `${Math.round(v)}` },
        { kind: 'toggle', slider: 38, expect: 'Enable speed override', label: 'SpdOv' },
      ],
    },
    {
      label: 'Timing',
      group: 0,
      controls: [
        { kind: 'toggle', slider: 55, expect: 'Time Mode', label: 'Sync' },
        { kind: 'toggle', slider: 57, expect: 'Follow Current Pattern', label: 'Follow' },
        { kind: 'toggle', slider: 42, expect: 'Loop Point', label: 'LoopP' },
        { kind: 'toggle', slider: 43, expect: 'Enable Velocity', label: 'Vel' },
        { kind: 'toggle', slider: 44, expect: 'Enable Mod', label: 'Mod' },
      ],
    },

    // ── Sequencer tab (step grid) ─────────────────────────
    {
      label: 'Steps',
      group: 1,
      controls: [
        stepgrid('Speed', 0, 15),
        stepgrid('Vel', 1, 127),
        stepgrid('Mod', 2, 127),
      ],
    },
    {
      label: 'CC 1-4',
      group: 1,
      controls: [
        stepgrid('CC1', 3, 127),
        stepgrid('CC2', 4, 127),
        stepgrid('CC3', 5, 127),
        stepgrid('CC4', 6, 127),
      ],
    },
    {
      label: 'CC 5-8',
      group: 1,
      controls: [
        stepgrid('CC5', 7, 127),
        stepgrid('CC6', 8, 127),
        stepgrid('CC7', 9, 127),
        stepgrid('CC8', 10, 127),
      ],
    },

    // ── MIDI tab ──────────────────────────────────────────
    {
      label: 'MIDI IO',
      group: 2,
      controls: [
        { kind: 'knob', slider: 24, expect: 'In channel', label: 'In', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 25, expect: 'Out channel', label: 'Out', format: (v) => `${Math.round(v)}` },
        { kind: 'toggle', slider: 54, expect: 'Enable Midi Sort', label: 'Sort' },
        { kind: 'toggle', slider: 53, expect: 'Disable Midi', label: 'Mute' },
      ],
    },
    {
      label: 'Velocity',
      group: 2,
      controls: [
        { kind: 'knob', slider: 6, expect: 'Minimum Velocity', label: 'Min', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 7, expect: 'Maximum Velocity', label: 'Max', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 8, expect: 'Minimum Modwheel', label: 'ModMin', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 9, expect: 'Maximum Modwheel', label: 'ModMax', format: (v) => `${Math.round(v)}` },
      ],
    },
    {
      label: 'CC',
      group: 2,
      controls: [
        { kind: 'knob', slider: 10, expect: 'Assignable CC1', label: 'CC1', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 11, expect: 'Minimum Assignable CC1', label: 'CC1 Min' },
        { kind: 'knob', slider: 12, expect: 'Maximum Assignable CC1', label: 'CC1 Max' },
        { kind: 'toggle', slider: 45, expect: 'Enable Cc1', label: 'CC1 On' },
        { kind: 'knob', slider: 13, expect: 'Assignable CC2', label: 'CC2' },
        { kind: 'knob', slider: 14, expect: 'Minimum Assignable CC2', label: 'CC2 Min' },
        { kind: 'knob', slider: 15, expect: 'Maximum Assignable CC2', label: 'CC2 Max' },
        { kind: 'toggle', slider: 46, expect: 'Enable Cc2', label: 'CC2 On' },
      ],
    },
    {
      label: 'Reset',
      group: 2,
      controls: [
        { kind: 'toggle', slider: 58, expect: 'Reset On Cc', label: 'Rst CC' },
        { kind: 'knob', slider: 40, expect: 'CC which resets MIDI position', label: 'Rst Val', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 56, expect: 'Viewed Pattern Index', label: 'ViewPat' },
        { kind: 'knob', slider: 41, expect: 'File Version', label: 'Ver' },
      ],
    },
  ],
};