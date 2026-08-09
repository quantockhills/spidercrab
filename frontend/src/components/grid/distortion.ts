// Distortion Workbench — REAPER's three waveshapers as one device.
//
// Cockos ships Distortion, Distortion (Fuzz) and the Graphical Waveshaper.
// All three are memoryless: output depends only on the current input, through
// a curve y = f(x). They differ only in that curve, so jsfx/spidercrab_
// distortion.jsfx offers all three around one drive, ceiling and mix — and
// gives every one of them the oversampling only the Graphical Waveshaper had.
//
// The curve itself is drawn. A memoryless shaper is exactly the case where the
// picture can be computed rather than measured, so it is exact and costs
// nothing: the same three formulas, evaluated across the input range.
//
// Which controls matter depends on the shape — Hardness does nothing to Fuzz —
// and the module shows them all rather than hiding them, since a control that
// vanishes is harder to find again than one that is simply inert.
import type { ModuleDef } from './modules';
import { isPatched } from './patched';

const db = (v: number) => `${v.toFixed(1)} dB`;
const whole = (v: number) => `${Math.round(v)}`;

export const distortionModule: ModuleDef = {
  title: 'Distortion',
  match: (n) => isPatched(n) && n.toLowerCase().includes('distortion workbench'),
  panels: [
    {
      label: 'Curve',
      controls: [
        {
          kind: 'curve',
          slider: 2,
          label: 'Transfer',
          help: 'What the distortion does to the signal. Input runs left to '
            + 'right, output bottom to top, and the dotted diagonal is what no '
            + 'distortion looks like — so the gap between the curve and that '
            + 'line is the effect. Drive is included, so this is the curve the '
            + 'signal actually meets.',
          drive: 1,
          shape: 2,
          knee: 3,
          hardness: 4,
          fuzz: 5,
          ceiling: 7,
          mirror: 6,
          points: 12,
        },
      ],
    },
    {
      label: 'Shape',
      controls: [
        {
          kind: 'segmented', slider: 2, expect: 'Shape', label: 'Shape',
          help: 'Which curve. Soft stays clean until the knee then bends — the '
            + 'gentlest of the three. Fuzz distorts quiet material as hard as '
            + 'loud, which is why it sounds like a fuzz pedal rather than an '
            + 'overdriven amp. Curve follows the points you set, so it can be '
            + 'anything at all.',
          options: [
            { value: 0, label: 'Soft' },
            { value: 1, label: 'Fuzz' },
            { value: 2, label: 'Curve' },
          ],
        },
        {
          kind: 'knob', slider: 1, expect: 'Drive (dB)', label: 'Drive', format: db,
          help: 'How hard the signal is pushed into the curve. Everything about '
            + 'how distorted this sounds starts here; the shape controls only '
            + 'decide what kind of distortion you get.',
        },
        {
          kind: 'knob', slider: 7, expect: 'Ceiling (dB)', label: 'Ceiling', format: db,
          help: 'A hard limit after the shaping, whichever curve is in use. Soft '
            + 'bends towards its own asymptote and Fuzz has none at all, so this '
            + 'is what stops either running away.',
        },
      ],
    },
    {
      label: 'Soft',
      controls: [
        {
          kind: 'knob', slider: 3, expect: 'Soft: Knee (dB)', label: 'Knee', format: db,
          help: 'Where Soft stops being clean. Below this the signal passes '
            + 'untouched, above it the excess is squeezed. Only affects the Soft '
            + 'shape.',
        },
        {
          kind: 'knob', slider: 4, expect: 'Soft: Hardness', label: 'Hardness',
          format: (v) => v.toFixed(1),
          help: 'How abruptly Soft bends once past the knee. Low is a gradual '
            + 'saturation, high approaches a hard clip. Only affects the Soft '
            + 'shape.',
        },
      ],
    },
    {
      label: 'Fuzz',
      controls: [
        {
          kind: 'knob', slider: 5, expect: 'Fuzz: Shape', label: 'Shape', format: whole,
          help: 'How steep the Fuzz curve is near zero. High settings make even '
            + 'quiet passages distort fully, which is the characteristic fuzz '
            + 'behaviour — it does not clean up when you play softer. Only '
            + 'affects the Fuzz shape.',
        },
        {
          kind: 'segmented', slider: 6, expect: 'Curve: Negative half', label: 'Negative',
          help: 'Whether the Curve shape mirrors its positive half onto negative '
            + 'inputs, or uses its own points for them. Separate halves give an '
            + 'asymmetric curve, which adds even harmonics — the difference '
            + 'between a valve and a transistor. Only affects the Curve shape.',
          options: [
            { value: 0, label: 'Separate' },
            { value: 1, label: 'Mirrored' },
          ],
        },
      ],
    },
    {
      label: 'Output',
      controls: [
        {
          kind: 'knob', slider: 10, expect: 'Oversampling', label: 'Oversample',
          format: (v) => `${Math.round(v)}×`,
          help: 'Distortion creates harmonics above what the sample rate can '
            + 'hold, and those fold back down as tuneless noise. Running the '
            + 'curve at a multiple of the rate and filtering moves them out of '
            + 'the way. The originals had none of this except the graphical one.',
        },
        {
          kind: 'segmented', slider: 11, expect: 'Channels', label: 'Channels',
          help: 'Which sides get distorted. Leaving one clean is a cheap way to '
            + 'widen a sound, since the two sides then differ in harmonics '
            + 'rather than only in level.',
          options: [
            { value: 0, label: 'L' },
            { value: 1, label: 'R' },
            { value: 2, label: 'Both' },
          ],
        },
        {
          kind: 'fader', slider: 8, expect: 'Wet (dB)', label: 'Wet', format: db,
          help: 'How much of the distorted signal reaches the output.',
        },
        {
          kind: 'fader', slider: 9, expect: 'Dry (dB)', label: 'Dry', format: db,
          help: 'How much of the original passes through alongside. Blending a '
            + 'little dry back in keeps transients that heavy distortion would '
            + 'otherwise flatten.',
        },
      ],
    },
  ],
};
