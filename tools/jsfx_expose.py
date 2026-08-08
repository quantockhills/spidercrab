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
    # Cycled with += 1 and wrapped at max_lfo_types, which the LFO include
    # sets to 18.
    'c_lfo_type':           (0, 18, 1),
    'm_lfo_type':           (0, 18, 1),
    'f_lfo_type':           (0, 18, 1),
    # Four selection buttons: Legato, Retrig, ParaLeg, ParaTrig.
    'note_mode':            (0, 3, 1),
    # blep_type = 2 * toggle, so it is 0 or 2 rather than 0 or 1.
    'blep_type':            (0, 2, 2),
    # Assigned from a toggle via a _tmp intermediate, so the toggle pattern
    # doesn't see it.
    'tempo_sync_envelopes': (0, 1, 1),
    # Knobs clamped with cl01(), i.e. normalised.
    'noise_decay':          (0, 1, 0),
    'noise_cutoff':         (0, 1, 0),
}


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

    decls = ['', '// ---- Exposed for host control (generated) ----',
             '// Hidden from this plugin\'s own UI with a leading "-", so it looks',
             '// unchanged in REAPER while these remain automatable. Ranges are',
             '// taken from how @gfx writes each variable.']
    for num, var, lo, hi, step in resolved:
        # JSFX zeroes every variable on load, so an unpatched instance starts
        # these at 0. Declaring the minimum as the default would change that —
        # a bipolar control would come up at -1 instead of centred. Use 0
        # wherever the range contains it.
        default = 0 if lo <= 0 <= hi else lo
        decls.append(f'slider{num}:{var}={default:g}<{fmt_range(lo, hi, step)}>-{var}')

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
    for num, var, lo, hi, step in resolved[:10]:
        print(f'  slider{num}:{var} <{fmt_range(lo, hi, step)}>')
    if len(resolved) > 10:
        print(f'  ... and {len(resolved) - 10} more')

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
            if not name.lower().endswith('.rpl'):
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
