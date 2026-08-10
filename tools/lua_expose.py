#!/usr/bin/env python3
"""Patch MK Slicer so a control surface can reach it while it is running.

A Lua script that draws its own window owns no track and no FX slot, so none
of the parameter machinery reaches it. What it does have is REAPER's ext
state, which it already uses to keep settings between runs — and which the
Spidercrab extension can now read and write.

Two things stop that being enough, and this script fixes exactly those two:

  1. MK Slicer reads ext state ONCE, at startup (its `GetExtState` calls all
     sit at the top of the file). Writing a key while it runs does nothing,
     because nothing is looking. The patch adds a tick to its main loop.

  2. The detected transients live in `Wave.Res_Points` and are redrawn from
     scratch every frame. Nothing outside the script can see them. The patch
     publishes them.

Deliberately NOT patched:

  * Importing audio and selecting the item. The extension already does that
    (`InsertMedia`, `SetMediaItemSelected`), and doing it here would
    reimplement working code in the fragile place.
  * The waveform itself. The extension can read it straight from the item's
    source with `PCM_Source_GetPeaks`, so shipping kilobytes of envelope
    through a text key would be silly.

Keeping the patch to those two things matters: MK Slicer is actively updated
(3.22 has a live changelog), and every line we add is a line that can conflict
with an upstream release.

Usage:
    python tools/lua_expose.py "<Scripts>/ReaTeam Scripts/Items Editing/cool_MK Slicer.lua"

Writes `cool_MK Slicer_spidercrab.lua` beside the original. The original is
untouched and keeps working; the copy appears as a separate action in REAPER.
"""

import argparse
import re
import sys
from pathlib import Path

# The ext-state section we talk over. Deliberately NOT the script's own
# 'MK_Slicer_3': that one is its settings store, it rewrites keys there as the
# user works, and a command of ours sitting in it would be read back as a
# setting on next launch.
SECTION = "MK_Slicer_SC"

# Controls we expose, as they are named in the source.
#
# Sliders take a normalised 0..1 value and then need their .onUp fired, which
# is what a mouse release does and what triggers re-analysis. Buttons just get
# .onClick. Selectors hold a 1-based index in .norm_val.
SLIDERS = [
    "HP_Freq", "LP_Freq", "Fltr_Gain",
    "Gate_Thresh", "Gate_Sensitivity", "Gate_Retrig", "Gate_ReducePoints",
    "Offset_Sld", "QStrength_Sld", "XFade_Sld",
]

BUTTONS = [
    "Get_Sel_Button", "Just_Slice", "Quantize_Slices",
    "Add_Markers", "Quantize_Markers", "Random", "Reset_All",
    "Set_Rate", "Create_MIDI",
]

SELECTORS = [
    "Guides", "Midi_Sampler", "RS_ObeyNoteOff", "RS_SamplerMode",
    "Create_Replace", "Pitch_Preset", "VeloMode",
]


def build_block() -> str:
    """The Lua we inject, as one self-contained chunk."""

    def lua_list(names):
        return ", ".join('["%s"] = %s' % (n, n) for n in names)

    return f'''
--------------------------------------------------------------------------------
-- Spidercrab bridge -----------------------------------------------------------
--
-- Added by tools/lua_expose.py. Nothing above this line is modified.
--
-- Talks over ext-state section '{SECTION}'. Two directions:
--
--   inbound   the iPad bumps a counter; we notice it changed, act once, and
--             remember the number. A counter rather than a flag because
--             Slice cuts up audio and must never run twice for one tap.
--
--   outbound  we publish the detected transients whenever they change, so a
--             remote display can draw the markers the script is drawing.
--
-- The waveform is NOT published here. The extension reads it from the item's
-- source directly, which is cheaper than pushing an envelope through text.
--------------------------------------------------------------------------------

-- Everything lives on one global table on purpose. This file already declares
-- 245 chunk-level locals and Lua allows 200 per function, so adding even a
-- handful more risks tipping it over into "too many local variables" — which
-- would fail at load, not at runtime, and take the whole script with it.
_SC = {{
  SECTION = '{SECTION}',

  -- Controls, by the names this script gives them. Sliders hold a normalised
  -- 0..1 value; selectors hold a 1-based index.
  sliders   = {{ {lua_list(SLIDERS)} }},
  buttons   = {{ {lua_list(BUTTONS)} }},
  selectors = {{ {lua_list(SELECTORS)} }},

  last_cmd = -1,
  last_set = -1,
  last_pub = "",
  pub_count = 0,
}}

function _SC.get(key)
  return r.GetExtState(_SC.SECTION, key)
end

function _SC.put(key, value)
  -- Never persisted. These are messages, not settings; writing them to
  -- reaper-extstate would churn the file and resurrect stale state on launch.
  r.SetExtState(_SC.SECTION, key, tostring(value), false)
end

--- Apply "name=value;name=value" to the controls, firing the same handler a
--- mouse would. Setting .norm_val alone changes the drawing but not the
--- analysis — .onUp is what recomputes it.
function _SC.apply(payload)
  for name, value in payload:gmatch("([%w_]+)=([^;]+)") do
    local num = tonumber(value)
    if num then
      local sld = _SC.sliders[name]
      local sel = _SC.selectors[name]
      if sld then
        sld.norm_val = math.max(0, math.min(1, num))
        if sld.onMove then sld.onMove() end
        if sld.onUp   then sld.onUp()   end
      elseif sel then
        sel.norm_val = math.floor(num)
        if sel.onClick then sel.onClick() end
      end
    end
  end
end

function _SC.run(cmd)
  local btn = _SC.buttons[cmd]
  if btn and btn.onClick then btn.onClick() end
end

--- Publish the detected transients.
---
--- Res_Points is a flat table: position in samples, then a {{RMS, peak}} pair,
--- repeating. Positions are relative to the analysed selection, so the
--- selection bounds go out with them or the receiver cannot place anything.
---
--- The sample rate is deliberately NOT published: `srate` here is a local
--- inside another function, not a global, and the extension can read the rate
--- straight off the item's source anyway.
function _SC.publish()
  local pts = Wave and Wave.Res_Points
  if not pts then return end

  local out = {{}}
  for i = 1, #pts, 2 do
    local pos = pts[i]
    local rms = pts[i + 1] and pts[i + 1][1] or 0
    if pos then
      out[#out + 1] = string.format("%d:%.3f", math.floor(pos), rms)
    end
  end
  local joined = table.concat(out, ",")

  -- Only write when something actually changed. This runs sixty times a
  -- second and ext state is shared with every other script in the process.
  if joined ~= _SC.last_pub then
    _SC.last_pub  = joined
    _SC.pub_count = _SC.pub_count + 1
    _SC.put('markers', joined)
    _SC.put('sel_start', Wave.sel_start or 0)
    _SC.put('sel_end',   Wave.sel_end or 0)
    -- Reduce's ceiling is computed at analysis time from the number of points
    -- found, so a remote fader cannot label itself without being told.
    _SC.put('reduce_max', (Gate_ReducePoints and Gate_ReducePoints.cur_max) or 0)
    _SC.put('markers_count', _SC.pub_count)
  end
end

function _SC_tick()
  local set_n = tonumber(_SC.get('set_count'))
  if set_n and set_n ~= _SC.last_set then
    _SC.last_set = set_n
    _SC.apply(_SC.get('set') or "")
  end

  local cmd_n = tonumber(_SC.get('cmd_count'))
  if cmd_n and cmd_n ~= _SC.last_cmd then
    _SC.last_cmd = cmd_n
    _SC.run(_SC.get('cmd') or "")
  end

  _SC.publish()
end

-- Tell anyone listening that a patched copy is up. Cleared on exit below.
r.SetExtState('{SECTION}', 'alive', '1', false)

--------------------------------------------------------------------------------
-- end Spidercrab bridge
--------------------------------------------------------------------------------

'''


def patch(src: str) -> str:
    """Insert the bridge and its call site."""

    # The bridge closes over the control locals, so it has to be defined after
    # them. Every control is created well before mainloop, so immediately
    # before `function mainloop()` is both late enough and unambiguous.
    anchor = re.search(r"^function mainloop\(\)", src, re.M)
    if not anchor:
        sys.exit("could not find 'function mainloop()' — has the script changed?")

    src = src[: anchor.start()] + build_block() + src[anchor.start() :]

    # Call it once per frame, right after the script's own update. MAIN() has
    # run by then, so Res_Points reflects this frame rather than the last one.
    call_site = re.search(r"^(\s*)MAIN\(\)\s*--\s*main function\s*$", src, re.M)
    if not call_site:
        sys.exit("could not find the MAIN() call in mainloop — has the script changed?")

    indent = call_site.group(1)
    src = (
        src[: call_site.end()]
        + f"\n{indent}_SC_tick() -- Spidercrab bridge"
        + src[call_site.end() :]
    )

    # Drop the alive flag when the window closes, so a stale flag doesn't make
    # the surface think the script is still up.
    src = src.replace(
        "        Wave:Destroy_Track_Accessor()",
        "        r.DeleteExtState('%s', 'alive', false)\n"
        "        Wave:Destroy_Track_Accessor()" % SECTION,
        1,
    )

    # Rename the action so REAPER lists it separately and the original keeps
    # loading untouched.
    src = re.sub(
        r"^-- @description (.+)$",
        r"-- @description \1 [Spidercrab]",
        src,
        count=1,
        flags=re.M,
    )
    src = re.sub(
        r'^(\s*Wnd_Title\s*=\s*)(["\'])(.*?)\2',
        r"\1\2\3 [Spidercrab]\2",
        src,
        count=1,
        flags=re.M,
    )
    return src


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("script", type=Path, help="path to cool_MK Slicer.lua")
    ap.add_argument("-o", "--output", type=Path, default=None)
    args = ap.parse_args()

    if not args.script.is_file():
        sys.exit(f"no such file: {args.script}")

    src = args.script.read_text(encoding="utf-8", errors="surrogateescape")
    if "_SC_tick" in src:
        sys.exit("already patched — run against the original, not the copy")

    patched = patch(src)

    # Syntax-check before writing. A Lua error in a deferred script surfaces
    # as a dialog when the user runs it, long after this tool has forgotten
    # about it, so it is worth catching here. Optional dependency: if
    # luaparser isn't installed we say so rather than pretending we checked.
    try:
        from luaparser import ast as lua_ast
    except ImportError:
        print("note: luaparser not installed — output NOT syntax-checked "
              "(pip install luaparser)", file=sys.stderr)
    else:
        try:
            lua_ast.parse(patched)
        except Exception as exc:  # noqa: BLE001 — any parse failure is fatal here
            sys.exit(f"generated Lua does not parse: {type(exc).__name__}: {exc}")

    out = args.output or args.script.with_name(args.script.stem + "_spidercrab.lua")
    out.write_text(patched, encoding="utf-8", errors="surrogateescape")

    print(f"wrote {out}")
    print(f"  section   {SECTION}")
    print(f"  sliders   {len(SLIDERS)}")
    print(f"  buttons   {len(BUTTONS)}")
    print(f"  selectors {len(SELECTORS)}")


if __name__ == "__main__":
    main()
