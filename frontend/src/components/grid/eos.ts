// Eos Reverb (Audio Damage) — laid out the way its own window is.
//
// Eos draws two pictures and hangs numbers off them: a pre-delay circle and a
// size/decay oval along the top, a frequency-response curve at the bottom
// right. The numbers under each picture are the parameters, which is a lovely
// desktop interface and completely unreachable from a tablet.
//
// The panels below are those same groups, drawn as controls:
//
//   ┌────────────────────────────────────────┬────┐
//   │  (•—•)      ( ~~~~~~~~~ )              │ P1 │
//   │  predelay   size   decay               │ P2 │
//   │                                        │ SH │
//   ├──────────────────┬─────────────────────┴────┤
//   │ attack  diffusion│  low mult   hi mult      │
//   │ rate    depth    │  low cut    hi cut       │
//   │    modulation    │  infinite   mix          │
//   └──────────────────┴──────────────────────────┘
//
// Grouped as Ableton groups a reverb — what happens on the way in, the early
// part, the tail, and the output — which is nearly what Eos already does. The
// one change is splitting its bottom-right box in two: the cut filters act on
// the input, the multipliers act on the tail, and Eos only draws them together
// because they share one graph.
//
// Names are plain English rather than either plugin's. Eos's LOW MULT is
// Lexicon-era shorthand and Ableton's equivalent, the Lo Shelf gain, is EQ
// jargon; both control how long bass rings compared with the rest, so that is
// what the label says. Each help text names the original so a control here can
// still be found in Eos's own window.
//
// Two of these controls are in no Eos window at all. From its manual:
//
//   "If you're particularly technically inclined you might be wondering about
//    the corner frequencies of the low- and high-frequency multiplier filters
//    ... we've tucked them away in a couple of hidden parameters. They're not
//    visible in Eos's window, but you can find them ... in the list of
//    automatable parameters displayed by your host."
//
// They come back as Lo Xover and Hi Xover, so the Grid can offer something the
// plugin itself cannot.
//
// Values carry no `format`. Eos reports 0..1 and formats the number itself —
// "5.94k", "1.02", "42.0" — so the module supplies only the unit. Rescaling
// the raw value instead would mean guessing Eos's own mapping, and its
// frequency controls are plainly not linear.
import type { ModuleDef } from './modules';

export const eosModule: ModuleDef = {
  title: 'Eos Reverb',
  match: (n) => n.toLowerCase().includes('eos'),
  panels: [
    {
      // Eos calls these input filters, and they are: they shape what reaches
      // the reverberators rather than the tail. Ableton's Input Processing.
      label: 'Input',
      controls: [
        {
          kind: 'knob', slider: 9, expect: 'Lo Cut', label: 'Low cut', unit: 'Hz',
          help: 'Rolls bass off before it reaches the reverb. Low frequencies '
            + 'take up a lot of room in a tail and muddy everything under them, '
            + 'so cutting here keeps the reverb out of the way of the bass.',
        },
        {
          kind: 'knob', slider: 12, expect: 'Hi Cut', label: 'High cut', unit: 'Hz',
          help: 'Rolls treble off before the reverb. Real rooms absorb high '
            + 'frequencies rather than reflecting them, so pulling this down is '
            + 'most of what makes a reverb sound like a place rather than an '
            + 'effect.',
        },
      ],
    },
    {
      // The top strip of Eos's window, pictures and all.
      label: 'Space',
      controls: [
        {
          kind: 'knob', slider: 1, expect: 'Predelay', label: 'Predelay', unit: 'ms',
          help: 'How long before the reverb starts. A gap here keeps the dry '
            + 'sound clear of its own tail, and reads as a bigger room — the '
            + 'further away the walls, the longer the sound takes to come back.',
        },
        {
          kind: 'knob', slider: 2, expect: 'Size', label: 'Size', unit: 'm',
          help: 'How big the simulated space or plate is, from 1 to 60 metres. '
            + 'Together with Decay this is most of the reverb’s character: a '
            + 'long decay in a small size is a sound no real room makes.',
        },
        {
          kind: 'knob', slider: 3, expect: 'Decay', label: 'Decay', unit: 's',
          help: 'How long the tail takes to fade away, 0.1 to 10 seconds. The '
            + 'single control with the most effect on how the reverb sounds.',
        },
        {
          // Three algorithms. Eos reports the parameter as 0..1 and names the
          // current one itself, so the readout stays right whatever the
          // mapping — but the values below assume the three sit evenly across
          // the range, which matches SuperHall reading exactly 1.
          kind: 'segmented', slider: 14, expect: 'Type', label: 'Type',
          help: 'Which reverb algorithm. Plate One sums to mono and suits '
            + 'single sounds; Plate Two keeps the stereo image and is denser; '
            + 'SuperHall is the long, gently moving concert-hall tail.',
          options: [
            { value: 0, label: 'Plate 1' },
            { value: 0.5, label: 'Plate 2' },
            { value: 1, label: 'SuperHall' },
          ],
        },
      ],
    },
    {
      // Ableton's Early Reflections: the first part of the tail, before it
      // smears into a wash.
      label: 'Early',
      controls: [
        {
          kind: 'knob', slider: 4, expect: 'Attack', label: 'Attack',
          help: 'How the tail begins. High settings give an immediate, present '
            + 'reverb; low ones make it fade in instead. On SuperHall, a large '
            + 'Size with a short Decay and Attack at minimum runs the tail '
            + 'almost backwards.',
        },
        {
          kind: 'knob', slider: 5, expect: 'Diffuse', label: 'Diffusion',
          help: 'How quickly the early echoes pile up into a wash. High suits '
            + 'percussion, where separate echoes sound like flutter; lower '
            + 'keeps vocals and full mixes from clogging.',
        },
      ],
    },
    {
      // Eos draws these on the same graph as the cut filters, but they act on
      // the tail rather than the input — Ableton keeps that distinction.
      label: 'Tail tone',
      controls: [
        {
          kind: 'knob', slider: 8, expect: 'Lo Mult', label: 'Bass decay', unit: '×',
          help: 'How long bass rings compared with everything else, 0.5× to 2×. '
            + 'Above 1 the low end hangs on after the rest has gone — the '
            + '"bloom" of 1980s hardware reverbs. Eos calls this LOW MULT; '
            + 'Ableton does the same job with the Lo Shelf gain.',
        },
        {
          kind: 'knob', slider: 11, expect: 'Hi Mult', label: 'Treble decay', unit: '×',
          help: 'How long treble rings compared with everything else, 0.5× to '
            + '1×. Below 1 the tail darkens as it fades, which is what happens '
            + 'in a room full of soft things. Eos calls this HI MULT; Ableton '
            + 'calls it the Hi Shelf gain.',
        },
        {
          kind: 'knob', slider: 10, expect: 'Lo Xover', label: 'Bass below', unit: 'Hz',
          help: 'Where bass ends and the rest of the sound begins, for the '
            + 'control above. Eos calls this the low crossover and hides it: it '
            + 'appears nowhere in the plugin’s own window, only in the list of '
            + 'parameters it offers a host.',
        },
        {
          kind: 'knob', slider: 13, expect: 'Hi Xover', label: 'Treble above', unit: 'Hz',
          help: 'Where treble begins, for the control above. Also hidden in '
            + 'Eos’s own window — this is the high crossover.',
        },
      ],
    },
    {
      label: 'Motion',
      controls: [
        {
          kind: 'knob', slider: 6, expect: 'Mod Rate', label: 'Rate', unit: 'Hz',
          help: 'How fast the delay lines inside the reverb wander, 0 to 5 Hz. '
            + 'A little stops the tail ringing metallically; a lot turns it '
            + 'into a chorus.',
        },
        {
          kind: 'knob', slider: 7, expect: 'Mod Dpth', label: 'Depth', unit: '%',
          help: 'How far they wander. Small amounts make the reverb sound less '
            + 'artificial by keeping its timbre moving; large amounts bend the '
            + 'pitch audibly.',
        },
      ],
    },
    {
      label: 'Output',
      controls: [
        {
          kind: 'toggle', slider: 15, expect: 'Infinite', label: 'Infinite',
          help: 'Holds the tail forever, freezing whatever is in the reverb. '
            + 'Anything you play while it is on keeps being added, so it builds '
            + 'up and eventually distorts — sparse material works best.',
        },
        {
          kind: 'fader', slider: 16, expect: 'Mix', label: 'Mix', unit: '%',
          help: '100% on a send, where the dry signal is already in the mix. '
            + 'Somewhere around 30-50% as an insert. Eos deliberately keeps '
            + 'this setting when you change preset.',
        },
      ],
    },
  ],
};
