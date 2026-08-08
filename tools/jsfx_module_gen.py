#!/usr/bin/env python3
"""
Generate a Grid module skeleton from a JSFX source file.

Hand-authoring a module for something like Yutani — 71 parameters across 22
panels — is slow and easy to get subtly wrong, and an off-by-one silently
drives the wrong control. This reads the plugin's own source instead:

  * `sliderN:` declarations give the parameter's range, enum options and label
  * `@gfx` draws panels in order, so scanning between `drawPanel` calls
    attributes each control to the section the plugin itself puts it in
  * the draw call names the widget: drawKnob, drawToggle, drawSelectionButton

Emits TypeScript for pasting into modules.ts. The grouping is the plugin's
own; the labels and ordering are worth a human pass afterwards.

Usage:
    python tools/jsfx_module_gen.py "<path to .jsfx>" [--title Name]
"""
import argparse
import io
import re
import sys

SELECT_CONST = re.compile(r'^\s*([A-Z][A-Z0-9_]*(?:SELECT|BUTTON))\s*=\s*(\d+)\s*;', re.M)
DECL = re.compile(
    r'^slider(\d+):([A-Za-z_]\w*)?\s*=?\s*([-\d.]*)\s*<([^>]*)>\s*-?(.*)$', re.M)


def parse_declarations(src):
    """slider number -> {var, min, max, step, options, label}"""
    out = {}
    for m in DECL.finditer(src):
        num, var, default, rng, label = m.groups()
        options = None
        body = rng
        if '{' in rng:
            body, _, opts = rng.partition('{')
            options = [o.strip() for o in opts.rstrip('}').split(',')]
        parts = [p.strip() for p in body.split(',') if p.strip()]
        try:
            lo = float(parts[0]); hi = float(parts[1])
        except (IndexError, ValueError):
            continue
        step = None
        if len(parts) > 2:
            try: step = float(parts[2])
            except ValueError: pass
        out[int(num)] = dict(var=var, min=lo, max=hi, step=step,
                             options=options, label=(label or var or f'Slider {num}').strip())
    return out


def panel_titles(gfx):
    """s_XXX identifier -> the string it's assigned, preferring the readable style."""
    titles = {}
    for ident, text in re.findall(r'(s_[A-Z0-9]+)\s*=\s*sprintf\(\d+,\s*"([^"]+)"', gfx):
        # The source assigns these several times, once per visual style. Keep the
        # first (title case) rather than the SHOUTING variants.
        titles.setdefault(ident, text)
    return titles


def widget_for(decl):
    if decl['options']:
        return 'segmented'
    if decl['min'] == 0 and decl['max'] == 1 and decl['step'] == 1:
        return 'toggle'
    return 'knob'


def generate(path, title=None):
    src = io.open(path, encoding='utf-8', errors='replace').read()
    gfx_at = src.find('@gfx')
    if gfx_at < 0:
        sys.exit('no @gfx section — nothing to derive a layout from')
    gfx = src[gfx_at:]

    decls = parse_declarations(src)
    if not decls:
        sys.exit('no slider declarations found')
    by_var = {d['var']: n for n, d in decls.items() if d['var']}
    selects = {name: int(num) for name, num in SELECT_CONST.findall(src)}
    titles = panel_titles(gfx)

    desc = re.search(r'^desc:\s*(.+)$', src, re.M)
    title = title or (desc.group(1).strip() if desc else 'Module')

    marks = [(m.start(), titles.get(m.group(1), m.group(1)))
             for m in re.finditer(r'drawPanel\(\s*(s_[A-Z0-9]+)', gfx)]

    panels, claimed = [], set()
    for i, (pos, name) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(gfx)
        body = gfx[pos:end]
        found = []

        # Selection buttons address a slider through a constant.
        for const, num in selects.items():
            if re.search(r'\b' + const + r'\b', body) and num in decls:
                found.append(num)
        # Knobs and toggles reference the slider's variable directly.
        for var, num in by_var.items():
            if re.search(r'\b' + re.escape(var) + r'\b', body):
                found.append(num)

        # First panel to mention a parameter owns it; several sections read
        # values they don't own (Filter reads drive, for instance).
        fresh = sorted({n for n in found if n not in claimed})
        claimed.update(fresh)
        if fresh:
            panels.append((name, fresh))

    missing = sorted(set(decls) - claimed)

    print(f'// Generated from {path.rsplit(chr(92), 1)[-1]}')
    print(f'// {len(decls)} parameters, {len(panels)} panels, '
          f'{len(missing)} unattributed')
    print('const module: ModuleDef = {')
    print(f'  title: {title!r},')
    print(f'  match: (n) => n.toLowerCase() === {title.lower()!r},')
    print('  panels: [')
    for name, nums in panels:
        print('    {')
        print(f'      label: {name!r},')
        print('      controls: [')
        for n in nums:
            d = decls[n]
            kind = widget_for(d)
            line = (f"        {{ kind: {kind!r}, slider: {n}, "
                    f"expect: {d['label']!r}, label: {d['label']!r}")
            if kind == 'segmented':
                opts = ', '.join(
                    '{ value: %d, label: %r }' % (i, o)
                    for i, o in enumerate(d['options']))
                line += f", options: [{opts}]"
            print(line + ' },')
        print('      ],')
        print('    },')
    print('  ],')
    print('};')

    if missing:
        print()
        print(f'// Declared but not attributed to any panel ({len(missing)}) —')
        print('// mostly parameters the GUI never draws. Review before shipping:')
        for n in missing:
            print(f'//   slider{n}: {decls[n]["label"]}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('jsfx')
    ap.add_argument('--title')
    a = ap.parse_args()
    generate(a.jsfx, a.title)
