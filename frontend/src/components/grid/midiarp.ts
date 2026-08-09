// MIDI ARP — laid out as the plugin's own control bar, around its grid.
//
// Saike's arp declares all 40 of its sliders hidden (a `-` before the label),
// so REAPER shows none of them and neither does the plugin: everything is
// driven from its @gfx. That makes the source the only description of what
// the thing actually offers, and reading it gives a grid plus one row of
// controls:
//
//   [Sort] « pattern » [follow] ▲length▼ −speed+ [spd]
//   [Copy][Paste][Randomize] [poly] [oct] [Vel][Mod][CC] [swing]
//
// Copy, Paste and Randomize have no parameter behind them. They act on the
// pattern buffer directly from @gfx, so there is nothing for a host to drive
// and nothing this module can offer.
//
// Every control carries `help`, shown on a long press of its label. An arp is
// full of terms that mean nothing until someone tells you — CC, poly mode,
// swing — and a label alone leaves the reader to guess.
//
// Slider numbers follow the patched copy: 1-40 declared, 41-57 promoted by
// jsfx_expose.py, 58-219 the grid window from jsfx_stepgrid.py.
import type { ModuleDef } from './modules';

/** The plugin prints speed as a multiplier above 1x and a division below. */
const speed = (v: number) => (v > 0 ? `${Math.round(v)}` : `1/${Math.abs(Math.round(v)) + 2}`);
const whole = (v: number) => `${Math.round(v)}`;

const CC_WHAT = 'A CC (Continuous Controller) is a numbered MIDI message that '
  + 'carries a value from 0 to 127 alongside the notes. Synths let you attach '
  + 'one to a filter, a level, almost anything.';

const cc = (n: number, choice: number, min: number, max: number) => ({
  label: `CC ${n}`,
  group: 3,
  controls: [
    {
      kind: 'knob' as const, slider: choice, expect: `Assignable CC${n}`,
      label: 'Number', format: whole,
      help: `${CC_WHAT} This picks which number lane CC ${n} sends on, so it has `
        + 'to match whatever you want it to move at the other end.',
    },
    {
      kind: 'knob' as const, slider: min, expect: `Minimum Assignable CC${n}`,
      label: 'Min', format: whole,
      help: `The value sent when this lane's step is at the bottom. Raising it `
        + 'narrows the range the lane can reach, which is useful when the full '
        + '0-127 sweep is more than the target wants.',
    },
    {
      kind: 'knob' as const, slider: max, expect: `Maximum Assignable CC${n}`,
      label: 'Max', format: whole,
      help: 'The value sent when this lane\'s step is at the top. Set it below '
        + 'Min to invert the lane, so a tall step sends a low value.',
    },
  ],
});

/** One switch per lane the grid can show. */
const lane = (slider: number, expect: string, label: string, help: string) =>
  ({ kind: 'toggle' as const, slider, expect, label, help });

export const midiArpModule: ModuleDef = {
  title: 'MIDI ARP',
  match: (n) => n.toLowerCase().includes('midi arp'),
  groups: ['Pattern', 'Arp', 'Setup', 'CC'],
  panels: [
    // ── Pattern: the grid, and everything that changes what it shows ──
    {
      label: 'Steps',
      group: 0,
      controls: [
        {
          kind: 'notegrid',
          slider: 60,
          label: 'Pattern',
          help: 'Tap an empty step to start a note. Drag sideways to hold it '
            + 'across several steps. Tap a note to remove it. Each row is one '
            + 'voice of the chord you play in. Dimmed steps sit past the loop '
            + 'length and never play — shorten Length for an eight-step pattern.',
          rows: 5,
          cols: 32,
          firstSlider: 60,
          rowOffsetSlider: 58,
          colPageSlider: 59,
          loopLengthSlider: 39,
          rowNames: {
            50: 'Mod', 51: 'Vel',
            52: 'CC1', 53: 'CC2', 54: 'CC3', 55: 'CC4',
            56: 'CC5', 57: 'CC6', 58: 'CC7', 59: 'CC8',
          },
        },
      ],
    },
    {
      label: 'View',
      group: 0,
      controls: [
        {
          kind: 'knob', slider: 58, expect: 'Grid row offset', label: 'Rows from', format: whole,
          help: 'Which row of the pattern the grid starts at. The note rows come '
            + 'first; rows 50 upwards are the extra lanes, so raise this to reach '
            + 'them.',
        },
        {
          kind: 'segmented', slider: 59, expect: 'Grid column page', label: 'Steps',
          help: 'The grid shows 32 steps at a time. Switch pages to reach the rest '
            + 'of a pattern longer than that.',
          options: [
            { value: 0, label: '1-32' },
            { value: 1, label: '33-64' },
          ],
        },
        {
          kind: 'knob', slider: 55, expect: 'Viewed Pattern Index', label: 'Pattern', format: whole,
          help: 'Which of the 64 stored patterns the grid is showing. With Follow '
            + 'off this is only what you are looking at, not what is playing, so '
            + 'you can write one pattern while another sounds.',
        },
        {
          kind: 'knob', slider: 39, expect: 'Loop length', label: 'Length', format: whole,
          help: 'How many steps the pattern plays before it starts again. Set it to '
            + '8 for an eight-step pattern; the steps past it dim in the grid and '
            + 'never sound, but keep whatever you drew there.',
        },
        {
          kind: 'toggle', slider: 56, expect: 'Follow Current Pattern', label: 'Follow',
          help: 'On, the grid always shows the pattern that is playing. Off, it '
            + 'stays where you left it, so you can edit one pattern while another '
            + 'sounds.',
        },
      ],
    },
    {
      // Adding a lane puts another row in the grid, so these sit beside it.
      // The CC lanes live on the CC tab with the assignments they need.
      label: 'Lanes',
      group: 0,
      controls: [
        lane(42, 'Enable Velocity', 'Vel',
          'Adds a row for drawing how hard each step plays. Taller step, louder note.'),
        lane(43, 'Enable Mod', 'Mod',
          'Adds a row that sends the mod wheel. Whatever the mod wheel moves on '
          + 'your synth, this row can move it per step.'),
      ],
    },

    // ── Arp: the rest of the plugin's control bar, in its order ──
    {
      label: 'Speed',
      group: 1,
      controls: [
        {
          kind: 'knob', slider: 1, expect: 'Current speed', label: 'Speed', format: speed,
          help: 'How fast the pattern advances. Above 1 it runs that many steps per '
            + 'beat; below, it shows as a fraction and each step lasts longer.',
        },
        {
          kind: 'toggle', slider: 38, expect: 'Enable speed override', label: 'Override',
          help: 'Lets the pattern carry its own speed changes on a Speed row, '
            + 'instead of running at one rate throughout.',
        },
        {
          kind: 'knob', slider: 23, expect: 'Swing', label: 'Swing', format: (v) => `${Math.round(v)}%`,
          help: 'Delays every other step, so the rhythm lilts rather than sitting '
            + 'square on the beat. Zero is dead straight.',
        },
      ],
    },
    {
      label: 'Clock',
      group: 1,
      controls: [
        // The plugin draws these as Host, Free, MIDI but numbers them 0, 2, 1.
        {
          kind: 'segmented', slider: 54, expect: 'Time Mode', label: 'Clock',
          help: 'What drives the sequencer. Host follows the project timeline, so '
            + 'the pattern always lands in the same place. Free runs on its own '
            + 'from when playback starts. MIDI restarts the pattern each time you '
            + 'play a note.',
          options: [
            { value: 0, label: 'Host' },
            { value: 2, label: 'Free' },
            { value: 1, label: 'MIDI' },
          ],
        },
      ],
    },
    {
      label: 'Notes',
      group: 1,
      controls: [
        {
          kind: 'knob', slider: 3, expect: 'Max Polyphony', label: 'Voices', format: whole,
          help: 'How many notes of the chord the arp can use, and so how many rows '
            + 'the grid has per octave.',
        },
        {
          kind: 'knob', slider: 5, expect: 'Extra octaves', label: 'Octaves', format: whole,
          help: 'Adds rows above the chord you played, so a pattern can reach one '
            + 'or two octaves higher than your fingers.',
        },
        // Three, not six. The declaration reads <0,5,1> but the GUI only ever
        // draws buttons for 0, 1 and 2.
        {
          kind: 'segmented', slider: 4, expect: 'Poly Mode', label: 'Repeat',
          help: 'What to do when the pattern has more rows than your chord has '
            + 'notes. Once leaves the extra rows silent. Rep starts the chord '
            + 'again from the bottom. Bidi walks back down instead.',
          options: [
            { value: 0, label: 'Once' },
            { value: 1, label: 'Rep' },
            { value: 2, label: 'Bidi' },
          ],
        },
        {
          kind: 'toggle', slider: 53, expect: 'Enable Midi Sort', label: 'Sort notes',
          help: 'Assigns the chord to rows by pitch rather than by the order you '
            + 'pressed the keys, so the same chord always maps the same way.',
        },
      ],
    },

    // ── Setup: what the plugin keeps behind right-click menus ──
    {
      label: 'MIDI',
      group: 2,
      controls: [
        {
          kind: 'knob', slider: 24, expect: 'In channel', label: 'In',
          format: (v) => (v < 1 ? 'All' : whole(v)),
          help: 'Which MIDI channel to listen on. All accepts every channel, which '
            + 'is usually what you want unless several things share one track.',
        },
        {
          kind: 'knob', slider: 25, expect: 'Out channel', label: 'Out', format: whole,
          help: 'Which MIDI channel the arp sends on. Matters when the synth after '
            + 'it is listening to one channel in particular.',
        },
        {
          kind: 'toggle', slider: 52, expect: 'Disable Midi', label: 'Passthrough',
          help: 'Passes your playing straight through alongside the arp, so you '
            + 'hear the chord you are holding as well as the pattern.',
        },
      ],
    },
    {
      label: 'Ranges',
      group: 2,
      controls: [
        {
          kind: 'knob', slider: 6, expect: 'Minimum Velocity', label: 'Vel min', format: whole,
          help: 'The velocity a step at the bottom of the Vel row plays at. Raise '
            + 'it to keep quiet steps from disappearing entirely.',
        },
        {
          kind: 'knob', slider: 7, expect: 'Maximum Velocity', label: 'Vel max', format: whole,
          help: 'The velocity a step at the top of the Vel row plays at.',
        },
        {
          kind: 'knob', slider: 8, expect: 'Minimum Modwheel', label: 'Mod min', format: whole,
          help: 'The mod wheel value the bottom of the Mod row sends.',
        },
        {
          kind: 'knob', slider: 9, expect: 'Maximum Modwheel', label: 'Mod max', format: whole,
          help: 'The mod wheel value the top of the Mod row sends.',
        },
      ],
    },
    {
      label: 'Reset',
      group: 2,
      controls: [
        {
          kind: 'toggle', slider: 57, expect: 'Reset On Cc', label: 'On CC',
          help: 'Lets an incoming CC restart the pattern from step one. Useful in '
            + 'Free mode, where nothing else lines it up.',
        },
        {
          kind: 'knob', slider: 40, expect: 'CC which resets MIDI position', label: 'CC',
          format: whole,
          help: `Which CC number restarts the pattern. ${CC_WHAT}`,
        },
      ],
    },
    {
      // A lane is no use without saying what it sends, so the switches sit with
      // the assignments rather than beside the grid.
      label: 'Lanes',
      group: 3,
      controls: [
        lane(44, 'Enable Cc1', 'CC 1', `Adds a row that sends CC 1. ${CC_WHAT}`),
        lane(45, 'Enable Cc2', 'CC 2', `Adds a row that sends CC 2. ${CC_WHAT}`),
        lane(46, 'Enable Cc3', 'CC 3', `Adds a row that sends CC 3. ${CC_WHAT}`),
        lane(47, 'Enable Cc4', 'CC 4', `Adds a row that sends CC 4. ${CC_WHAT}`),
        lane(48, 'Enable Cc5', 'CC 5', `Adds a row that sends CC 5. ${CC_WHAT}`),
        lane(49, 'Enable Cc6', 'CC 6', `Adds a row that sends CC 6. ${CC_WHAT}`),
        lane(50, 'Enable Cc7', 'CC 7', `Adds a row that sends CC 7. ${CC_WHAT}`),
        lane(51, 'Enable Cc8', 'CC 8', `Adds a row that sends CC 8. ${CC_WHAT}`),
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
