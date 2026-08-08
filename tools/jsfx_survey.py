#!/usr/bin/env python3
"""
Survey a REAPER Effects tree for JSFX worth giving a Grid module.

Two things make a plugin a good candidate, and both are readable from source:

  * a substantial `@gfx` section, meaning the author drew a real layout rather
    than letting REAPER stack sliders. That layout is what a module is
    truthful to; without one there's nothing to be truthful about.
  * controls the host can already see. A plugin that keeps its state in plain
    variables needs jsfx_expose first, which is a bigger job.

Usage:
    python tools/jsfx_survey.py "<Effects directory>" [--min-gfx 4000]
"""
import argparse
import collections
import io
import os
import re

# Rough shape of the widget vocabulary a hand-drawn GUI uses. Counting these
# separates "drew a panel layout" from "printed a value in the corner".
WIDGETS = re.compile(r'\b(drawKnob|drawPanel|drawToggle|drawSelectionButton|'
                     r'gfx_circle|gfx_arc|gfx_rect|gfx_triangle)\b')


def scan(path):
    try:
        src = io.open(path, encoding='utf-8', errors='replace').read()
    except OSError:
        return None
    desc = re.search(r'^desc:\s*(.+)$', src, re.M)
    if not desc:
        return None

    gfx_at = src.find('@gfx')
    gfx = src[gfx_at:] if gfx_at > 0 else ''

    # A promotable variable is one @serialize keeps but no slider declares:
    # state the plugin remembers that the host cannot reach.
    declared = {m.group(1) for m in
                re.finditer(r'^slider\d+:([A-Za-z_]\w*)', src, re.M)}
    ser_at = src.find('@serialize')
    serialized = set()
    if ser_at >= 0:
        end = min((p for p in (src.find('\n@' + s, ser_at + 1)
                               for s in ('init', 'slider', 'block', 'sample', 'gfx'))
                   if p > 0), default=len(src))
        serialized = set(re.findall(r'file_var\(\s*0\s*,\s*([A-Za-z_]\w*)\s*\)',
                                    src[ser_at:end]))

    return dict(
        path=path,
        desc=desc.group(1).strip(),
        sliders=len(re.findall(r'^slider\d+:', src, re.M)),
        gfx=len(gfx),
        widgets=len(WIDGETS.findall(gfx)),
        hidden=len(serialized - declared),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root')
    ap.add_argument('--min-gfx', type=int, default=4000)
    ap.add_argument('--min-widgets', type=int, default=20)
    a = ap.parse_args()

    rows = []
    for dirpath, _, names in os.walk(a.root):
        for name in names:
            if not name.lower().endswith(('.jsfx', '.jsfx-inc')) and '.' in name:
                continue
            if name.lower().endswith('.jsfx-inc'):
                continue
            r = scan(os.path.join(dirpath, name))
            if r:
                rows.append(r)

    good = [r for r in rows
            if r['gfx'] >= a.min_gfx and r['widgets'] >= a.min_widgets
            and r['sliders'] >= 3]
    good.sort(key=lambda r: -r['widgets'])

    print(f'{len(rows)} JSFX scanned, {len(good)} with a hand-drawn GUI\n')
    by_pack = collections.Counter(
        os.path.relpath(r['path'], a.root).replace('\\', '/').split('/')[0]
        for r in good)
    for pack, n in by_pack.most_common():
        print(f'  {n:4}  {pack}')
    print()
    print(f'{"sliders":>7} {"hidden":>7} {"widgets":>8}  name')
    for r in good:
        print(f'{r["sliders"]:>7} {r["hidden"]:>7} {r["widgets"]:>8}  {r["desc"][:58]}')


if __name__ == '__main__':
    main()
