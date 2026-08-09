// MIDI ARP Grid module.
// 58 parameters: 40 declared + 18 promoted.
// The native JSFX GUI handles pattern editing — this module provides
// real-time parameter control on the iPad.
import type { ModuleDef } from './modules';

export const midiArpModule: ModuleDef = {
  title: 'MIDI ARP',
  match: (n) => n.toLowerCase().indexOf('midi arp') >= 0,
  groups: ['Arp', 'MIDI'],
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

    // ── MIDI tab ──────────────────────────────────────────
    {
      label: 'IO',
      group: 1,
      controls: [
        { kind: 'knob', slider: 24, expect: 'In channel', label: 'In Ch', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 25, expect: 'Out channel', label: 'Out Ch', format: (v) => `${Math.round(v)}` },
        { kind: 'toggle', slider: 54, expect: 'Enable Midi Sort', label: 'Sort' },
        { kind: 'toggle', slider: 53, expect: 'Disable Midi', label: 'Mute' },
      ],
    },
    {
      label: 'Velocity',
      group: 1,
      controls: [
        { kind: 'knob', slider: 6, expect: 'Minimum Velocity', label: 'Vel Min', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 7, expect: 'Maximum Velocity', label: 'Vel Max', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 8, expect: 'Minimum Modwheel', label: 'Mod Min', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 9, expect: 'Maximum Modwheel', label: 'Mod Max', format: (v) => `${Math.round(v)}` },
      ],
    },
    {
      label: 'CC',
      group: 1,
      controls: [
        { kind: 'knob', slider: 10, expect: 'Assignable CC1', label: 'CC1', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 11, expect: 'Minimum Assignable CC1', label: 'CC1 Min' },
        { kind: 'knob', slider: 12, expect: 'Maximum Assignable CC1', label: 'CC1 Max' },
        { kind: 'toggle', slider: 45, expect: 'Enable Cc1', label: 'CC1 On' },
        { kind: 'knob', slider: 13, expect: 'Assignable CC2', label: 'CC2' },
        { kind: 'knob', slider: 14, expect: 'Minimum Assignable CC2', label: 'CC2 Min' },
        { kind: 'knob', slider: 15, expect: 'Maximum Assignable CC2', label: 'CC2 Max' },
        { kind: 'toggle', slider: 46, expect: 'Enable Cc2', label: 'CC2 On' },
        { kind: 'knob', slider: 16, expect: 'Assignable CC3', label: 'CC3' },
        { kind: 'knob', slider: 17, expect: 'Minimum Assignable CC3', label: 'CC3 Min' },
        { kind: 'knob', slider: 18, expect: 'Maximum Assignable CC3', label: 'CC3 Max' },
        { kind: 'toggle', slider: 47, expect: 'Enable Cc3', label: 'CC3 On' },
        { kind: 'knob', slider: 19, expect: 'Assignable CC4', label: 'CC4' },
        { kind: 'knob', slider: 20, expect: 'Minimum Assignable CC4', label: 'CC4 Min' },
        { kind: 'knob', slider: 21, expect: 'Maximum Assignable CC4', label: 'CC4 Max' },
        { kind: 'toggle', slider: 48, expect: 'Enable Cc4', label: 'CC4 On' },
      ],
    },
    {
      label: 'CC 2',
      group: 1,
      controls: [
        { kind: 'knob', slider: 26, expect: 'Assignable CC5', label: 'CC5' },
        { kind: 'knob', slider: 27, expect: 'Minimum Assignable CC5', label: 'CC5 Min' },
        { kind: 'knob', slider: 28, expect: 'Maximum Assignable CC5', label: 'CC5 Max' },
        { kind: 'toggle', slider: 49, expect: 'Enable Cc5', label: 'CC5 On' },
        { kind: 'knob', slider: 29, expect: 'Assignable CC6', label: 'CC6' },
        { kind: 'knob', slider: 30, expect: 'Minimum Assignable CC6', label: 'CC6 Min' },
        { kind: 'knob', slider: 31, expect: 'Maximum Assignable CC6', label: 'CC6 Max' },
        { kind: 'toggle', slider: 50, expect: 'Enable Cc6', label: 'CC6 On' },
        { kind: 'knob', slider: 32, expect: 'Assignable CC7', label: 'CC7' },
        { kind: 'knob', slider: 33, expect: 'Minimum Assignable CC7', label: 'CC7 Min' },
        { kind: 'knob', slider: 34, expect: 'Maximum Assignable CC7', label: 'CC7 Max' },
        { kind: 'toggle', slider: 51, expect: 'Enable Cc7', label: 'CC7 On' },
        { kind: 'knob', slider: 35, expect: 'Assignable CC8', label: 'CC8' },
        { kind: 'knob', slider: 36, expect: 'Minimum Assignable CC8', label: 'CC8 Min' },
        { kind: 'knob', slider: 37, expect: 'Maximum Assignable CC8', label: 'CC8 Max' },
        { kind: 'toggle', slider: 52, expect: 'Enable Cc8', label: 'CC8 On' },
      ],
    },
    {
      label: 'Reset',
      group: 1,
      controls: [
        { kind: 'toggle', slider: 58, expect: 'Reset On Cc', label: 'Rst CC' },
        { kind: 'knob', slider: 40, expect: 'CC which resets MIDI position', label: 'Rst Val', format: (v) => `${Math.round(v)}` },
        { kind: 'knob', slider: 56, expect: 'Viewed Pattern Index', label: 'View Pat' },
        { kind: 'knob', slider: 41, expect: 'File Version', label: 'Ver' },
      ],
    },
  ],
};