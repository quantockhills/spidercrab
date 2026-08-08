#!/usr/bin/env python3
"""
Write a patched copy of a JSFX that exposes its internal state as parameters.

Some plugins keep most of their controls in variables that are never declared
as `sliderN:`. Those exist only inside the plugin's own GUI, so no host can
touch them — Yutani keeps 122 that way, including every section's on/off
switch. Since JSFX is source, they can be promoted.

Two insertions, and nothing existing is modified:

  1. Hidden slider declarations. A declaration prefixed with `-` stays out of
     the plugin's own UI while remaining automatable, so the patched copy looks
     identical in REAPER but has the extra parameters.

  2. A sync block appended to @gfx. Rather than adding slider_automate at every
     site the GUI writes a variable — a hundred-plus edits, each shaped
     differently — one generated block compares each promoted variable against
     its last published value once per frame and notifies on change. @gfx runs
     ~30x/sec, so it costs a comparison per control.

The result is written under a new filename, so it is a distinct plugin as far
as REAPER is concerned: existing projects keep loading the original untouched,
and the copy has no saved state to migrate. Imports resolve relative to the
file, so the copy belongs in the same directory as the original.

Usage:
    python tools/jsfx_expose.py "<path to .jsfx>" --suffix _spidercrab [--dry-run]
"""
import argparse
import io
import os
import re
import sys

# Variables that are bookkeeping rather than controls — exposing them would
# put meaningless parameters in the host and risk the plugin's own state
# machine being driven from outside.
SKIP = re.compile(
    r'^(VERSION|version|has_wavetable_data|microtuned|initialized|'
    r'estimate_pitch|last_\w+|.*_tmp)$')

MAX_SLIDER = 256

# The declared range decides what the host is allowed to set, so getting it
# wrong makes a control useless — declare 0..1 for something the GUI drives
# 0..48 and the iPad can only reach the bottom fiftieth of it. Most ranges are
# readable from how @gfx writes the variable; see infer_ranges.
#
# These are the ones no pattern catches, read out of the source by hand:
MANUAL_RANGES = {
    # ── Yutani ────────────────────────────────────────────────
    'c_lfo_type':           (0, 18, 1),
    'm_lfo_type':           (0, 18, 1),
    'f_lfo_type':           (0, 18, 1),
    'note_mode':            (0, 3, 1),
    'blep_type':            (0, 2, 2),
    'tempo_sync_envelopes': (0, 1, 1),
    'noise_decay':          (0, 1, 0),
    'noise_cutoff':         (0, 1, 0),
    # ── SEQS ──────────────────────────────────────────────────
    # Most are normalized 0-1 controls read through drawAndProcess.
    'value':                (0, 1, 0),
    'count':                (0, 1, 0),
    'validate':             (0, 1, 0),
    'sample_duration':      (0, 1, 0),
    'selected_details':     (0, 1, 0),
    'gate_start':           (0, 1, 0),
    'gate_stop':            (0, 1, 0),
    'gate_atk':             (0, 1, 0),
    'gate_decay':           (0, 1, 0),
    'gate_sustain':         (0, 1, 0),
    'verb_diffusion':       (0, 1, 0),
    'verb_decay':           (0, 1, 0),
    'verb_mod_depth':       (0, 1, 0),
    'verb_mod_rate':        (0, 1, 0),
    'verb_lowpass':         (0, 1, 0),
    'verb_highpass':        (0, 1, 0),
    'verb_dry':             (0, 1, 0),
    'verb_wet':             (0, 1, 0),
    'verb_gate_atk':        (0, 1, 0),
    'verb_gate_decay':      (0, 1, 0),
    'verb_gate_sustain':    (0, 1, 0),
    'tapestop_decay':       (0, 1, 0),
    'karplus_feedback':     (-1, 1, 0),
    'karplus_cutoff':       (0, 1, 0),
    'karplus_pitch':        (0, 1, 0),
    'karplus_wet':          (0, 1, 0),
    'karplus_dry':          (0, 1, 0),
    'shifter_dry':          (0, 1, 0),
    'shifter_wet':          (0, 1, 0),
    'filter2_type':         (0, 27, 1),
    'loop_point':           (0, 1, 0),
    'has_samples':          (0, 1, 1),
    'slowdown_scaling':     (0, 1, 1),
    'legacy_tapestop':      (0, 1, 1),
    'randomizing_modulator_a': (0, 1, 1),
    'randomizing_modulator_b': (0, 1, 1),
}


# What the plugin calls each modulation mode. 1 and 2 are the VEL and MOD
# buttons on the right edge; 3 is the LINK button inside the Free LFO panel.
MOD_NAMES = {1: 'Vel', 2: 'Mod', 3: 'LFO'}


# Tooltips range from a name to a paragraph. Past this a hint has stopped
# being a label -- "Enabling this places the amplitude envelope before the
# filter" is documentation -- so the variable name is prettified instead.
MAX_LABEL = 26

# Called inside knob_set's arguments; not the variable being displayed.
FUNCS = {'sprintf', 'floor', 'ceil', 'min', 'max', 'abs', 'exp', 'log',
         'sqrt', 'pow', 'clamp', 'cl01', 'sin', 'cos', 'strcpy', 'gfx_measurestr'}


def _first_line(text):
    """Hints are multi-line; the first sentence is the name."""
    return text.split('\\n')[0].strip().rstrip('.').strip()


def _split_args(text):
    """Top-level comma-separated arguments, ignoring nesting and strings."""
    out, depth, cur, in_str, i = [], 0, [], False, 0
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == '\\':
                cur.append(text[i:i + 2]); i += 2; continue
            if ch == '"':
                in_str = False
            cur.append(ch)
        elif ch == '"':
            in_str = True; cur.append(ch)
        elif ch in '([':
            depth += 1; cur.append(ch)
        elif ch in ')]':
            depth -= 1; cur.append(ch)
        elif ch == ',' and depth == 0:
            out.append(''.join(cur)); cur = []
        else:
            cur.append(ch)
        i += 1
    out.append(''.join(cur))
    return out


def _first_var(expr):
    """The first thing in an expression that could be a variable."""
    for var in re.findall(r'[A-Za-z_]\w*', re.sub(r'"[^"]*"', '', expr)):
        if var not in FUNCS:
            return var
    return None


def _label_from(text):
    """A hint is only a label if it's short enough to be one."""
    first = _first_line(text)
    return first if 0 < len(first) <= MAX_LABEL else ''


def _instance_vars(gfx):
    """
    widget instance -> the variable it displays.

    knob_set(displayText, active, normalisedValue) — it's the third argument
    that carries the variable. The first is a format string that often mentions
    it too, but not always: knob_set("", !any_non_simple_active, fm_level)
    would otherwise name the knob after an unrelated flag.
    """
    out = {}
    for inst, args in re.findall(r'(\w+)\.knob_set\((.*?)\);', gfx, re.S):
        parts = _split_args(args)
        if len(parts) >= 3:
            var = _first_var(parts[2])
            if var:
                out.setdefault(inst, var)

    # Several knobs skip the setter and assign straight through, which is how
    # every LFO knob is written, often scaled on the way in:
    #     cutoffLFOSpeedKnob.value = c_lfo_speed / 20;
    for inst, expr in re.findall(r'(\w+)\.value\s*=\s*([^;=]+);', gfx):
        var = _first_var(expr)
        if var:
            out.setdefault(inst, var)
    return out


def knob_vars(src):
    """
    Variables the GUI draws as a knob, whatever their declaration says.

    Yutani declares `slider17:fm_level=0<0,1,1>` — a step of 1, which reads as
    a two-position switch — and then draws it as a continuous knob with three
    modulation depths hanging off it. The drawing is the truth about what the
    control is; the declared step is a slip in the plugin.
    """
    gfx = src[src.find('@gfx'):]
    drawn = set(re.findall(r'(\w+)\.drawKnob\(', gfx))
    return {v for i, v in _instance_vars(gfx).items() if i in drawn}


def harvest_labels(src, wanted):
    """
    variable -> human label, plus variable -> (parent variable, modifier id).

    A promoted variable has no declared label, so the generated declaration
    would name it after itself and the Grid would draw a knob called
    `noise_db`. But the plugin does have a name for it — in the drawing code
    rather than the declarations:

        noiseAmpKnob.knob_set(sprintf(1, "%.1f dB", noise_db - 48), ...);
        noiseAmpKnob.drawKnob(cX, cY, knobSize, "Amplitude", "Noise level.", 1.0);

    knob_set says which variable the widget shows; drawKnob says what it's
    called. Joining them on the widget's instance name recovers the label.
    Where drawKnob has no visible label — the small context-dependent knobs
    pass "" — the tooltip's first line stands in.

    The same join recovers which knob each modulation depth belongs to, since
    the depths are edited through their parent widget.
    """
    gfx = src[src.find('@gfx'):]

    # instance -> visible label
    inst_label = {}
    for inst, label, hint in re.findall(
            r'(\w+)\.drawKnob\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*'
            r'"([^"]*)"\s*,\s*"((?:[^"\\]|\\.)*)"', gfx):
        text = label.strip() or _label_from(hint)
        if text:
            inst_label.setdefault(inst, text)

    # instance -> the variable it displays. Not restricted to the promoted set:
    # a knob's base value is usually an already-declared slider, and it's that
    # join which names the modulation depths hanging off it.
    inst_var = _instance_vars(gfx)

    labels = {}
    for inst, var in inst_var.items():
        if inst in inst_label:
            labels[var] = inst_label[inst]

    # Toggles carry the variable as their fifth argument and the name in the
    # trailing hint: drawToggle(x, y, w, h, subosc_enabled, ...8 colours...,
    # "Enable sub oscillator.\n")
    for var, rest in re.findall(
            r'drawToggle\((?:\s*[^,]+,){4}\s*(\w+)\s*,(.*?)\);', gfx, re.S):
        if var not in wanted or var in labels:
            continue
        hints = re.findall(r'"((?:[^"\\]|\\.)*)"', rest)
        if hints and _label_from(hints[-1]):
            labels[var] = _label_from(hints[-1])

    # Modulation depths, edited through their parent knob while a mode is held:
    #   activeModifier == 3 ? ( osc1AmpKnob.knob_modifier_processMouse(
    #       0, osc1_db_flfo / 48) ? ( osc1_db_flfo = osc1AmpKnob.value * 48; );
    modifiers = {}
    for modid, inst, var in re.findall(
            # Written both as `activeModifier == 3 ?` and `(activeModifier == 3) ?`.
            r'activeModifier\s*==\s*(\d)\s*\)?\s*\?\s*\(\s*'
            r'(\w+)\.knob_modifier_processMouse\([^;]*?\(\s*(\w+)\s*=', gfx):
        parent = inst_var.get(inst)
        if var in wanted and parent:
            modifiers[var] = (parent, int(modid))
            labels.setdefault(
                var, f'{labels.get(parent, parent)} {MOD_NAMES[int(modid)]}')

    return labels, modifiers


def panel_enables(src, wanted):
    """
    variable -> True for the flags that switch a whole panel on and off.

        nextPanel = drawPanel(s_SOSC, cX, cY, w, h, subosc_enabled);

    The last argument is the panel's active state, which the plugin uses to
    dim it. Those belong in a panel header, not in the control list.
    """
    gfx = src[src.find('@gfx'):]
    # Match the call's own argument list only: balanced one level deep, and
    # never across a statement boundary. A looser pattern picks up the last
    # argument of whatever call happens to follow.
    found = set(re.findall(
        r'drawPanel\((?:[^();]|\([^()]*\))*?,\s*(\w+)\s*\)\s*;', gfx))

    # Yutani's own source has copy-paste slips here: the Free LFO and Smear
    # panels are both gated on c_lfo_enabled. Their switches still grey out
    # the section's widgets, which is the other half of the same idiom:
    #     freeLfoResetToggle.inactive = !f_lfo_enabled;
    found.update(re.findall(r'\.inactive\s*=\s*!\s*(\w+)\s*;', gfx))

    return {v for v in found if v in wanted}


# Word fragments the variable names use, for anything no draw call names.
PRETTY = {
    'lfo': 'LFO', 'osc': 'Osc', 'fm': 'FM', 'pwm': 'PWM', 'db': 'Level',
    'amnt': 'Amount', 'atk': 'Attack', 'vel': 'Velocity', 'flfo': 'Free LFO',
    'reso': 'Resonance', 'subosc': 'Sub Osc', 'sosc': 'Sub Osc', 'env': 'Env',
    'pos': 'Position', 'fb': 'Feedback', 'ap': 'Allpass', 'semi': 'Semitones',
    'blep': 'BLEP', 'dc': 'DC', 'wt': 'Wavetable',
}
# The LFOs are addressed by initial: c_ cutoff, m_ morph, f_ free.
PRETTY_LEAD = {'c': 'Cutoff', 'm': 'Morph', 'f': 'Free'}


def prettify(var):
    """Last resort: make a variable name readable rather than shipping it raw."""
    parts = var.split('_')
    if len(parts) > 1 and parts[0] in PRETTY_LEAD and parts[1] == 'lfo':
        parts[0] = PRETTY_LEAD[parts[0]]
    return ' '.join(PRETTY.get(p, p.capitalize()) for p in parts)


def section_of(var):
    """
    The part of the plugin a variable belongs to, for disambiguating names.

    Three LFOs share every control name, and they're told apart in the source
    only by a leading initial — c_ cutoff, m_ morph, f_ free — so a one-letter
    qualifier is no use to anyone reading the Grid.
    """
    parts = var.split('_')
    if len(parts) > 1 and parts[0] in PRETTY_LEAD and parts[1] == 'lfo':
        return f'{PRETTY_LEAD[parts[0]]} LFO'
    return prettify(parts[0])


def infer_ranges(src):
    """
    variable -> (min, max, step) read from how @gfx writes it.

    Covers ~93% of Yutani's promotable variables. Anything missed falls back
    to MANUAL_RANGES, and anything in neither is reported rather than guessed.
    """
    gfx = src[src.find('@gfx'):]
    out = {}

    def note(var, lo, hi, step):
        out.setdefault(var, (lo, hi, step))

    # A toggle's value is whatever processMouseToggle returns: 0 or 1.
    for v in re.findall(r'(\w+)\s*=\s*\w+\.processMouseToggle', gfx):
        note(v, 0, 1, 1)
    # Bipolar knobs: X = 2 * knob.value - N
    for v, n in re.findall(r'(\w+)\s*=\s*2\s*\*\s*\w+\.value\s*-\s*([\d.]+)', gfx):
        note(v, -float(n), float(n), 0)
    # Offset knobs: X = knob.value * N - M
    for v, n, m in re.findall(r'(\w+)\s*=\s*\w+\.value\s*\*\s*([\d.]+)\s*-\s*([\d.]+)', gfx):
        note(v, -float(m), float(n) - float(m), 0)
    # Scaled knobs: X = knob.value * N
    for v, n in re.findall(r'(\w+)\s*=\s*\w+\.value\s*\*\s*([\d.]+)', gfx):
        note(v, 0, float(n), 0)
    # Plain knobs, already normalised.
    for v in re.findall(r'(\w+)\s*=\s*(?:cl01\()?\w+\.value\s*[;)]', gfx):
        note(v, 0, 1, 0)

    # SEQS-style drawAndProcess: the 6th argument is the value, always 0..1.
    # The variable may be dotted (filter.current_cutoff) or prefixed (current_).
    for v in re.findall(r'\.drawAndProcess\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([\w.]+)\s*,', gfx):
        clean = v.split('.')[-1].removeprefix('current_').removeprefix('tmp_')
        note(clean, 0, 1, 0)

    return out


def fmt_range(lo, hi, step):
    def n(x):
        return str(int(x)) if float(x).is_integer() else str(x)
    return f'{n(lo)},{n(hi)},{n(step) if step else "0.000001"}'


def read(path):
    return io.open(path, encoding='utf-8', errors='replace').read()


def declared_sliders(src):
    """slider number -> variable name (or None)."""
    out = {}
    for m in re.finditer(r'^slider(\d+):([A-Za-z_]\w*)?', src, re.M):
        out[int(m.group(1))] = m.group(2)
    return out


def serialized_vars(src):
    """Variables persisted in @serialize, in declaration order."""
    start = src.find('@serialize')
    if start < 0:
        return []
    end = min((p for p in (src.find('\n@' + s, start + 1)
                           for s in ('init', 'slider', 'block', 'sample', 'gfx'))
               if p > 0), default=len(src))
    seen, out = set(), []
    for v in re.findall(r'file_var\(\s*0\s*,\s*([A-Za-z_]\w*)\s*\)', src[start:end]):
        if v not in seen:
            seen.add(v)
            out.append(v)
    return out


def preset_width(jsfx_path):
    """
    Largest number of values any sibling preset library stores.

    Presets are positional: a .rpl entry is a run of slider values, and REAPER
    applies them from slider 1 upwards. Yutani's own presets were saved against
    older builds and store anywhere from 65 to 90 values, which is more than it
    currently declares (71, numbered up to 81).

    That matters because new sliders must not land inside that span. Filling
    Yutani's unused slots 67-70 and 74-79 looked tidy and would have been
    silently destructive: loading any preset with 67+ values would write its
    contents straight into the promoted controls.
    """
    import base64
    directory = os.path.dirname(jsfx_path) or '.'
    widest = 0
    for name in os.listdir(directory):
        if not name.lower().endswith('.rpl'):
            continue
        try:
            txt = read(os.path.join(directory, name))
        except OSError:
            continue
        for m in re.finditer(r'<PRESET `[^`]*`\n((?:\s+[A-Za-z0-9+/=]+\n)+)\s*>', txt):
            try:
                raw = base64.b64decode(''.join(m.group(1).split()))
            except Exception:
                continue
            widest = max(widest, len(raw.split(b'\x00')[0].decode('latin-1', 'replace').split()))
    return widest


def plan(src, jsfx_path=None):
    sliders = declared_sliders(src)
    existing_vars = {v for v in sliders.values() if v}
    used = set(sliders)

    # Start above everything already spoken for: the declared sliders, and the
    # span any existing preset writes into.
    floor = max(used) if used else 0
    if jsfx_path:
        floor = max(floor, preset_width(jsfx_path))
    free = (n for n in range(floor + 1, MAX_SLIDER + 1) if n not in used)

    promote = []
    for var in serialized_vars(src):
        if var in existing_vars or SKIP.match(var):
            continue
        try:
            promote.append((next(free), var))
        except StopIteration:
            sys.exit(f'ran out of slider slots at {var} — {MAX_SLIDER} is the limit')
    return sliders, promote


def ranges_for(src, promote):
    """(num, var, lo, hi, step) per promoted variable, plus anything unresolved."""
    inferred = infer_ranges(src)
    resolved, unknown = [], []
    for num, var in promote:
        r = MANUAL_RANGES.get(var) or inferred.get(var)
        if r is None:
            unknown.append(var)
        else:
            resolved.append((num, var, *r))
    return resolved, unknown


def declared_labels(src):
    """The labels the plugin's own declarations already use."""
    return {m.group(1).strip() for m in
            re.finditer(r'^slider\d+:[^<]*<[^>]*>\s*-?(.*)$', src, re.M)
            if m.group(1).strip()}


def label_map(src, promote):
    """
    variable -> the label its generated declaration will carry.

    Names are what the host shows, so they have to be both readable and
    distinct: two parameters sharing a name leaves the Grid's resolver
    guessing which one a control meant.
    """
    wanted = {v for _, v in promote}
    harvested, modifiers = harvest_labels(src, wanted)
    enables = panel_enables(src, wanted)

    taken = declared_labels(src)
    out = {}
    for _, var in promote:
        if var in enables:
            # Named from the section rather than the tooltip. Yutani's own
            # hints disagree with each other here — f_lfo_enabled is captioned
            # "Reset LFO on note on." — and three LFOs all captioned "Enable
            # LFO" would need disambiguating anyway.
            name = f'Enable {section_of(var)}'
        else:
            name = harvested.get(var) or prettify(var)
        if name in taken:
            # Several knobs genuinely are called "Amplitude". Qualify with the
            # section the variable name leads with — which is how the plugin
            # groups them anyway, so "Noise Amplitude" rather than "Amplitude 2".
            lead = section_of(var)
            if not name.startswith(lead):
                name = f'{lead} {name}'
        n = 2
        while name in taken:
            name = f'{name} {n}' if n == 2 else re.sub(r' \d+$', f' {n}', name)
            n += 1
        taken.add(name)
        out[var] = name
    return out, modifiers, enables


def build(src, promote):
    # Declarations go after the last existing one, keeping the block together.
    last = None
    for m in re.finditer(r'^slider\d+:.*$', src, re.M):
        last = m
    if not last:
        sys.exit('no slider declarations to anchor to')

    resolved, unknown = ranges_for(src, promote)
    if unknown:
        sys.exit('no range for: ' + ', '.join(unknown) +
                 '\nAdd them to MANUAL_RANGES — declaring a wrong range silently '
                 'limits what the control can reach.')

    labels, _, _ = label_map(src, promote)

    decls = ['', '// ---- Exposed for host control (generated) ----',
             '// Hidden from this plugin\'s own UI with a leading "-", so it looks',
             '// unchanged in REAPER while these remain automatable. Ranges are',
             '// taken from how @gfx writes each variable, and names from the',
             '// labels and tooltips its draw calls already carry.']
    for num, var, lo, hi, step in resolved:
        # JSFX zeroes every variable on load, so an unpatched instance starts
        # these at 0. Declaring the minimum as the default would change that —
        # a bipolar control would come up at -1 instead of centred. Use 0
        # wherever the range contains it.
        default = 0 if lo <= 0 <= hi else lo
        decls.append(f'slider{num}:{var}={default:g}'
                     f'<{fmt_range(lo, hi, step)}>-{labels[var]}')

    out = src[:last.end()] + '\n' + '\n'.join(decls) + src[last.end():]

    # Sync block at the very end of @gfx.
    sync = ['', '', '// ---- Publish GUI-driven changes to the host (generated) ----',
            '// The GUI writes these directly, so the host would otherwise never',
            '// learn they changed. One comparison each, once per frame, rather',
            '// than a slider_automate call at every write site.']
    for _, var in promote:
        sync.append(
            f'_pub_{var} != {var} ? ( _pub_{var} = {var}; slider_automate({var}); );')

    gfx = out.find('@gfx')
    if gfx < 0:
        sys.exit('no @gfx section to append the sync block to')
    return out.rstrip() + '\n' + '\n'.join(sync) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('jsfx')
    ap.add_argument('--suffix', default='_spidercrab')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    src = read(a.jsfx)
    sliders, promote = plan(src, a.jsfx)

    print(f'existing parameters : {len(sliders)}')
    print(f'promoting           : {len(promote)}')
    print(f'slots used          : {min(n for n, _ in promote)}'
          f'-{max(n for n, _ in promote)} of {MAX_SLIDER}' if promote else '')
    print()
    resolved, unknown = ranges_for(src, promote)
    inferred = infer_ranges(src)
    print(f'ranges inferred     : {sum(1 for _, v in promote if v in inferred)}')
    print(f'ranges by hand      : {sum(1 for _, v in promote if v in MANUAL_RANGES)}')
    if unknown:
        print(f'ranges UNKNOWN      : {len(unknown)} -> {", ".join(unknown)}')
    print()
    labels, modifiers, enables = label_map(src, promote)
    named = sum(1 for _, v in promote if v in harvest_labels(src, {v})[0])
    print(f'names from the GUI  : {named}')
    print(f'names prettified    : {len(promote) - named}')
    print(f'modulation depths   : {len(modifiers)}')
    print(f'panel switches      : {len(enables)}')
    print()
    for num, var, lo, hi, step in resolved[:10]:
        print(f'  slider{num}:{var} <{fmt_range(lo, hi, step)}> {labels[var]}')
    if len(resolved) > 10:
        print(f'  ... and {len(resolved) - 10} more')

    if a.dry_run:
        print()
        print('all labels:')
        for _, var in promote:
            mark = ' [panel]' if var in enables else (
                ' [mod of %s]' % modifiers[var][0] if var in modifiers else '')
            print(f'  {var:32} {labels[var]}{mark}')

    if a.dry_run:
        return

    root, ext = os.path.splitext(a.jsfx)
    dest = f'{root}{a.suffix}{ext}'
    patched = build(src, promote)
    # desc: is what REAPER lists it under — distinguish the copy.
    patched = re.sub(r'^desc:\s*(.+)$', lambda m: f'desc:{m.group(1)} [Spidercrab]',
                     patched, count=1, flags=re.M)
    io.open(dest, 'w', encoding='utf-8', newline='\n').write(patched)
    print()
    print(f'wrote {dest}')

    # Presets are keyed by the plugin's desc line, so the copy sees none of the
    # original's. Since the patch only appends sliders, the stored values still
    # line up — the libraries just need retargeting.
    old_desc = re.search(r'^desc:\s*(.+)$', src, re.M)
    new_desc = re.search(r'^desc:\s*(.+)$', patched, re.M)
    if old_desc and new_desc:
        directory = os.path.dirname(a.jsfx) or '.'
        base = os.path.basename(os.path.splitext(a.jsfx)[0])
        carried = 0
        for name in sorted(os.listdir(directory)):
            # Skip our own output from a previous run, or re-running the tool
            # stacks the suffix: ..._spidercrab_spidercrab.jsfx.rpl.
            if not name.lower().endswith('.rpl') or a.suffix in name:
                continue
            lib = read(os.path.join(directory, name))
            if old_desc.group(1).strip() not in lib:
                continue
            out = lib.replace(old_desc.group(1).strip(), new_desc.group(1).strip())
            target = name.replace(base, base + a.suffix) if base in name \
                else f'{base}{a.suffix}_{name}'
            io.open(os.path.join(directory, target), 'w',
                    encoding='utf-8', newline='\n').write(out)
            print(f'  presets: {name} -> {target}')
            carried += 1
        if not carried:
            print('  no preset libraries matched this plugin')

    print()
    print('The original is untouched. Imports resolve relative to the file, so')
    print('the copy must stay in the same directory.')


if __name__ == '__main__':
    main()
