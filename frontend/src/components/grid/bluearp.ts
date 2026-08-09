// BlueARP Grid module.
// 586 parameters spanning global controls, 16-step pattern grid with 5
// attribute lanes (octave, key, step type, gate, velocity), and MIDI IO.
//
// Three tabs: Arp (performance controls), Pattern (step grid), MIDI (IO).
import type { ModuleDef } from './modules';

export const bluearpModule: ModuleDef = {
  title: 'BlueARP',
  match: (n) => n.toLowerCase().indexOf('bluearp') >= 0,
  groups: ['Arp', 'Pattern', 'MIDI'],
  panels: [
    // ── Arp tab ──────────────────────────────────────────
    {
      label: 'Engine',
      group: 0,
      controls: [
        { kind: 'toggle', slider: 6, expect: 'ARP State', label: 'On' },
        { kind: 'knob', slider: 42, expect: 'Sync', label: 'Sync', format: (v) => syncLabel(v) },
        { kind: 'knob', slider: 41, expect: 'Gate', label: 'Gate', format: (v) => `${Math.round(v * 100)}%` },
        { kind: 'knob', slider: 43, expect: 'Latch', label: 'Latch' },
        { kind: 'knob', slider: 14, expect: 'Semitone range', label: 'Range', format: (v) => `${Math.round((v - 0.5) * 24)} st` },
      ],
    },
    {
      label: 'Chains',
      group: 0,
      controls: [
        { kind: 'knob', slider: 11, expect: 'Current chain', label: 'Chain' },
        { kind: 'knob', slider: 13, expect: 'Chain variation', label: 'Variation' },
        { kind: 'knob', slider: 12, expect: 'Chain quantize', label: 'Quantize' },
        { kind: 'knob', slider: 10, expect: 'Num. chains', label: 'Count' },
        { kind: 'knob', slider: 8, expect: 'Current program', label: 'Program', format: (v) => `${Math.round(v * 128)}` },
      ],
    },
    {
      label: 'Lane',
      group: 0,
      controls: [
        { kind: 'knob', slider: 9, expect: 'Selected lane', label: 'Lane' },
        { kind: 'knob', slider: 65, expect: 'Polyphonic octave', label: 'Poly Oct' },
        { kind: 'knob', slider: 66, expect: 'Polyphonic key sel.', label: 'Poly Key' },
        { kind: 'knob', slider: 69, expect: 'Gate lane mode', label: 'Gate Ln' },
      ],
    },

    // ── Pattern tab ──────────────────────────────────────
    // 16-step grid with 5 attribute lanes. Each lane is auto-generated
    // as paramsliders for now — the step grid widget will replace these
    // once the step window slider mechanism is wired up.
    {
      label: 'Octave',
      group: 1,
      controls: steps('Octave', 256, 16),
    },
    {
      label: 'Key',
      group: 1,
      controls: steps('Key', 320, 16),
    },
    {
      label: 'Type',
      group: 1,
      controls: steps('StepType', 384, 16),
    },
    {
      label: 'Gate',
      group: 1,
      controls: steps('GateStep', 448, 16),
    },
    {
      label: 'Velocity',
      group: 1,
      controls: steps('Velocity', 512, 16),
    },

    // ── MIDI tab ─────────────────────────────────────────
    {
      label: 'MIDI IO',
      group: 2,
      controls: [
        { kind: 'knob', slider: 1, expect: 'MIDI In Channel', label: 'In Ch' },
        { kind: 'knob', slider: 2, expect: 'MIDI Out Channel', label: 'Out Ch' },
        { kind: 'knob', slider: 3, expect: 'MIDI In Port', label: 'In Port' },
        { kind: 'knob', slider: 4, expect: 'MIDI Out Port', label: 'Out Port' },
      ],
    },
    {
      label: 'Input Filter',
      group: 2,
      controls: [
        { kind: 'knob', slider: 45, expect: 'Input range (low)', label: 'Lo Key' },
        { kind: 'knob', slider: 46, expect: 'Input range (high)', label: 'Hi Key' },
        { kind: 'knob', slider: 47, expect: 'Output rng wrap (low)', label: 'Out Lo' },
        { kind: 'knob', slider: 64, expect: 'Input rng wrap (high)', label: 'Out Hi' },
        { kind: 'knob', slider: 67, expect: 'Missing key transpose', label: 'Trnsp' },
        { kind: 'knob', slider: 44, expect: 'Missing key subst.', label: 'Subst' },
      ],
    },
    {
      label: 'Filters',
      group: 2,
      controls: [
        { kind: 'toggle', slider: 15, expect: 'Flt: Prog. chnage msg', label: 'PrgCh' },
        { kind: 'knob', slider: 74, expect: 'Flt: PBend msg', label: 'PBend' },
        { kind: 'knob', slider: 75, expect: 'Flt: MWheel msg', label: 'MW' },
        { kind: 'knob', slider: 76, expect: 'Flt: ATouch msg', label: 'AT' },
        { kind: 'knob', slider: 77, expect: 'Flt: Other CC msg', label: 'CC' },
        { kind: 'knob', slider: 78, expect: 'Flt: Sustain msg', label: 'Sust' },
        { kind: 'knob', slider: 79, expect: 'Flt: Sustain polarity', label: 'Pol' },
      ],
    },
  ],
};

function syncLabel(v: number): string {
  const labels = ['1/4', '1/8', '1/16', '1/32', '1/8t', '1/16t', '1/32t', '1/8.', '1/16.', '1/32.'];
  return labels[Math.round(v * (labels.length - 1))] ?? `${(v * 100).toFixed(0)}%`;
}

function steps(name: string, start: number, count: number): any[] {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      kind: 'paramslider' as const,
      slider: start + i,
      label: `${i + 1}`,
    });
  }
  return out;
}