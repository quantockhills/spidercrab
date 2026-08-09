#!/usr/bin/env python3
"""Add step window sliders to patched MIDI ARP. Uses explicit per-slider code."""
import io, re

SRC = "/mnt/c/Users/Tamura/AppData/Roaming/REAPER/Effects/Saike Tools/saike_midi_arp/saike_midi_arp_spidercrab.jsfx"

ROWS = [
    ('Speed', 'speed_values'),
    ('Vel',   'modulator2_values'),
    ('Mod',   'modulator1_values'),
    ('CC1',   'midi_cc_1'),
    ('CC2',   'midi_cc_2'),
    ('CC3',   'midi_cc_3'),
    ('CC4',   'midi_cc_4'),
    ('CC5',   'midi_cc_5'),
    ('CC6',   'midi_cc_6'),
    ('CC7',   'midi_cc_7'),
    ('CC8',   'midi_cc_8'),
]

STEP_BASE = 59
ROW_SEL = STEP_BASE + len(ROWS) * 8

src = io.open(SRC, encoding='utf-8', errors='replace').read()

last_slider = max(m.end() for m in re.finditer(r'^slider\d+:.*$', src, re.M))
slider_end = src.find('\n@gfx', src.find('\n@slider'))

# Step slider declarations
decls = []
for ri, (label, arr) in enumerate(ROWS):
    for s in range(8):
        n = STEP_BASE + ri * 8 + s
        decls.append(f'slider{n}:step_{ri}_{s}=0<0,1,0.000001>-{label} {s*4+1}-{s*4+4}')
decls.append(f'slider{ROW_SEL}:step_row=0<0,{len(ROWS)-1},1>-Step row')

# @slider sync code -- runs only when step_row changes (row selector).
# Copies the selected row's array values into the 8 window sliders.
# Uses explicit slider{N} references since EEL can't do dynamic names.
sync = ['', '// ---- Step grid window sync (generated) ----']
sync.append('step_row != step_row_old ? step_row_old = max(0, min(step_row | 0, ' + str(len(ROWS)-1) + '));')

for ri, (label, arr) in enumerate(ROWS):
    for s in range(8):
        sn = STEP_BASE + ri * 8 + s
        base = s * 4
        sync.append(f'step_row == {ri} ? (')
        sync.append(f'  _v{sn} = {arr}[{base}] + {arr}[{base+1}]*128 + {arr}[{base+2}]*16384 + {arr}[{base+3}]*2097152;')
        sync.append(f'  slider{sn} = _v{sn} / 268435455;')
        sync.append(');')

# Write-back: edited step slider -> pattern buffer
for ri, (label, arr) in enumerate(ROWS):
    for s in range(8):
        sn = STEP_BASE + ri * 8 + s
        base = s * 4
        sync.append(f'step_row == {ri} ? (')
        sync.append(f'  slider{sn} != _old_{sn} ? (')
        sync.append(f'    _old_{sn} = slider{sn};')
        sync.append(f'    _r{sn} = max(0, min(slider{sn}, 1)) * 268435455 | 0;')
        sync.append(f'    {arr}[{base}] = (_r{sn} - floor(_r{sn} / 128) * 128) | 0;')
        sync.append(f'    {arr}[{base+1}] = (floor(_r{sn} / 128) - floor(_r{sn} / 16384) * 128) | 0;')
        sync.append(f'    {arr}[{base+2}] = (floor(_r{sn} / 16384) - floor(_r{sn} / 2097152) * 128) | 0;')
        sync.append(f'    {arr}[{base+3}] = floor(_r{sn} / 2097152) | 0;')
        sync.append('  );')
        sync.append(');')

sync_code = '\n'.join(sync)

# Init
init_code = '\n'.join(f'_old_{STEP_BASE + ri * 8 + s} = 0;' for ri in range(len(ROWS)) for s in range(8))
init_code += '\nstep_row_old = -1;\n'

# Insert
out = src[:last_slider] + '\n' + '\n'.join(decls) + src[last_slider:]

init_pos = out.find('@init')
if init_pos >= 0:
    init_end = out.find('\n@', init_pos + 1)
    if init_end < 0: init_end = out.find('@slider')
    out = out[:init_end] + '\n' + init_code + out[init_end:]

if slider_end > 0:
    out = out[:slider_end] + '\n' + sync_code + out[slider_end:]
else:
    out += '\n' + sync_code

io.open(SRC, 'w', encoding='utf-8', newline='\n').write(out)
final = io.open(SRC, encoding='utf-8').read()
count = len(re.findall(r'^slider\d+:', final, re.M))
print(f'Total sliders: {count}')
PY