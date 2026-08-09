#!/usr/bin/env python3
"""
Expose a JSFX pattern buffer as a rectangular window of host parameters.

Saike's MIDI ARP keeps its patterns in plain memory — 64 patterns of 60 rows
by 64 steps — and memory is invisible to a host. Only `sliderN:` declarations
cross that boundary, and there are 256 of them for a buffer of 245,760 values.
So the grid cannot be exposed; only a window onto it can.

This appends that window to an already-patched copy:

  * ROWS x COLS hidden sliders, one per cell. Not packed. An earlier attempt
    packed four steps into one float and read them back with
    `floor(value * 4)`; a single rounding anywhere in the host's parameter
    path corrupts all four, and there is no need for it with sliders to spare.

  * Two sliders that move the window: a row offset over the pattern's 60 rows,
    and a column page for patterns longer than COLS.

  * A sync block appended to @block, running both ways. A cell the host wrote
    goes into memory; a cell the plugin's own editor changed comes back out.
    Moving the window reloads every cell, since the previous contents describe
    somewhere else.

    @block rather than @gfx, for two reasons. @gfx only runs while the plugin
    window is open, and the point of this is to drive the plugin from a screen
    that is not showing that window — edits would silently do nothing. And
    @gfx is a different thread from the one reading the pattern to play it,
    so writing the buffer there races the sequencer. @block is the audio
    thread and always runs.

Cells are signed: 0 is empty, positive starts a note, negative continues the
one before it. That is how the plugin stores held notes, and why a step grid
drawn from this can show note length rather than just note-or-not.

Run this after jsfx_expose.py, on its output — expose regenerates from the
original and would drop these.

Usage:
    python tools/jsfx_stepgrid.py "<path to patched .jsfx>"
"""
import argparse
import io
import re
import sys

# The window. 5x32 covers the default polyphony of 5 across a 32-step loop,
# which is what the plugin itself shows at its default settings. Larger costs
# sliders that later promotions may want: this already brings the arp to 219
# of 256.
ROWS = 5
COLS = 32

# Rows 50-59 hold the modulators (Mod, Vel, CC1-8), so the offset has to reach
# 59 while leaving room for the window.
MAX_ROW = 60

# Notes are stored as 1, modulator rows as 8, and the mouse wheel raises them
# to a per-row maximum of 15. Sign carries note continuation, so the parameter
# has to be bipolar.
CELL_MIN, CELL_MAX = -16, 16

# Steps in a pattern, and voices the arp can hold.
MAX_SEGMENTS = 64
MAX_NOTES = 12


def declared_sliders(src):
    return {int(m.group(1)) for m in re.finditer(r'^slider(\d+):', src, re.M)}


def build(src):
    used = declared_sliders(src)
    if not used:
        sys.exit('no slider declarations to append to')
    if any(v.startswith('sg_') for v in re.findall(r'^slider\d+:(\w+)', src, re.M)):
        sys.exit('this file already has a step grid — regenerate from jsfx_expose first')

    first = max(used) + 1
    row_slider = first
    page_slider = first + 1
    cell_base = first + 2
    # Read-outs, published by the plugin and never driven from the host: where
    # the sequencer is, and which note each row is currently playing. Both are
    # drawn by the plugin's own grid, and without them the copy on the iPad is
    # a diagram rather than a view of what is happening.
    play_slider = cell_base + ROWS * COLS
    note_base = play_slider + 1
    last = note_base + MAX_NOTES - 1
    if last > 256:
        sys.exit(f'window needs slider {last}, past the 256 limit')

    decls = [
        '',
        '// ---- Step grid window (generated) ----',
        '// A view onto the pattern buffer, which is memory and so invisible to',
        '// the host. Hidden from the plugin\'s own UI; it draws the real grid.',
        f'slider{row_slider}:sg_row=0<0,{MAX_ROW - ROWS},1>-Grid row offset',
        f'slider{page_slider}:sg_page=0<0,1,1>-Grid column page',
    ]
    for r in range(ROWS):
        for c in range(COLS):
            n = cell_base + r * COLS + c
            decls.append(
                f'slider{n}:sg_{r}_{c}=0<{CELL_MIN},{CELL_MAX},1>-Step {r},{c}')
    decls.append(f'slider{play_slider}:sg_play=0<0,{MAX_SEGMENTS - 1},1>-Playhead')
    for i in range(MAX_NOTES):
        decls.append(f'slider{note_base + i}:sg_note_{i}=0<0,127,1>-Voice {i} note')

    anchor = None
    for m in re.finditer(r'^slider\d+:.*$', src, re.M):
        anchor = m
    out = src[:anchor.end()] + '\n' + '\n'.join(decls) + src[anchor.end():]

    sync = [
        '', '',
        '// ---- Step grid sync (generated) ----',
        '// Runs both ways: a cell the host wrote goes into the pattern, a cell',
        '// the plugin\'s editor changed comes back out. Edits target the viewed',
        '// pattern rather than the playing one, which is what the grid on',
        '// screen is bound to.',
        '_sg_base = pattern_buffer + viewed_pattern_index * pattern_size'
        ' + sg_row * max_segments + sg_page * %d;' % COLS,
        '',
        '// Moving the window invalidates every cached value at once, so reload',
        '// rather than letting the per-cell comparison below write stale',
        '// contents into their new home.',
        '_sg_base != _sg_last ? (',
        '  _sg_last = _sg_base;',
    ]
    for r in range(ROWS):
        for c in range(COLS):
            off = f'{r} * max_segments + {c}'
            sync.append(f'  sg_{r}_{c} = _pub_sg_{r}_{c} = _sg_base[{off}];')
            sync.append(f'  slider_automate(sg_{r}_{c});')
    sync.append(') : (')
    for r in range(ROWS):
        for c in range(COLS):
            off = f'{r} * max_segments + {c}'
            sync.append(
                f'  sg_{r}_{c} != _pub_sg_{r}_{c} ? ('
                f' _pub_sg_{r}_{c} = sg_{r}_{c}; _sg_base[{off}] = sg_{r}_{c}; )'
                f' : _sg_base[{off}] != _pub_sg_{r}_{c} ? ('
                f' _pub_sg_{r}_{c} = _sg_base[{off}]; sg_{r}_{c} = _pub_sg_{r}_{c};'
                f' slider_automate(sg_{r}_{c}); );')
    sync.append(');')

    sync += [
        '',
        '// Read-outs. Published only — anything the host writes here is',
        '// overwritten on the next block, which is what makes them read-outs.',
        '_pub_sg_play != sequencer_index ? ('
        ' sg_play = _pub_sg_play = sequencer_index; slider_automate(sg_play); );',
        '',
        '// current_arp is zero until something is played, and reading through',
        '// a null pointer would publish whatever sits at address zero.',
        'current_arp ? (',
    ]
    for i in range(MAX_NOTES):
        sync.append(
            f'  _pub_sg_note_{i} != current_arp[{i}] ? ('
            f' sg_note_{i} = _pub_sg_note_{i} = current_arp[{i}];'
            f' slider_automate(sg_note_{i}); );')
    sync.append(');')

    # End of @block, which is where the next section starts.
    start = out.find('\n@block')
    if start < 0:
        sys.exit('no @block section to append the sync block to')
    end = min((p for p in (out.find('\n@' + s, start + 1)
                           for s in ('sample', 'gfx', 'serialize', 'init', 'slider'))
               if p > 0), default=len(out))
    return (out[:end] + '\n' + '\n'.join(sync) + out[end:],
            row_slider, page_slider, cell_base, play_slider, note_base)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('jsfx')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    src = io.open(a.jsfx, encoding='utf-8', errors='replace').read()
    patched, row_slider, page_slider, cell_base, play_slider, note_base = build(src)

    print(f'window          : {ROWS} rows x {COLS} steps')
    print(f'row offset      : slider{row_slider}')
    print(f'column page     : slider{page_slider}')
    print(f'cells           : slider{cell_base}-{cell_base + ROWS * COLS - 1}')
    print(f'playhead        : slider{play_slider}')
    print(f'voice notes     : slider{note_base}-{note_base + MAX_NOTES - 1}')
    print(f'total sliders   : {note_base + MAX_NOTES - 1} of 256')

    if a.dry_run:
        return
    io.open(a.jsfx, 'w', encoding='utf-8', newline='\n').write(patched)
    print(f'\nwrote {a.jsfx}')


if __name__ == '__main__':
    main()
