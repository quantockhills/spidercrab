# Designer Prompt — reaper-ipad App UI

## Context

You are designing the visual UI for **reaper-ipad** — a remote control app
for REAPER DAW running on iPad (2360×1640 landscape primary target). The
app lets users browse tracks, control FX parameters, and manage samples
wirelessly over WebSocket.

This is a **React + Tailwind** web app rendered in Safari on iPad. All
layout is CSS. No native UI toolkit.

## References

### 80gray v2.2 (Everforest Light)
A REAPER theme in the same visual family. Located in
`design/original-theme/`. Look at:
- `80gray v2.2 Everforest Light.ReaperThemeZip` — the theme file
  (unzip to see images + WALTER config)
- `80gray v2.0 Theme Adjuster.lua` — theme adjustment script

### Everforest Color Scheme
https://github.com/sainnhe/everforest — Vim color scheme, warm earthy
tones. The palette is defined in:
https://github.com/sainnhe/everforest/blob/master/palette.md

## Design Guidelines

Read `design/design-guidelines.md` for the full rules. Key points:
- **Square everything** — no rounded corners on buttons, cards, or panels
- **Everforest Light palette** — warm beige backgrounds, soft dark text,
  green/orange/red accents
- **DAW aesthetic** — dense but clean, alternating row backgrounds,
  generous touch targets (min 44pt)
- **Landscape-first** — 2360×1640, use the horizontal space for
  multi-panel layouts
- **Sans-serif system font** — no custom fonts
- **No pure white or pure black** — use warm off-whites and soft darks

## Current UI

The current frontend lives in `frontend/src/`. It's a basic mobile-first
layout with bottom tab navigation. Screenshots of the current state are
in `gui_testing/`. The target is to make it look like a professional
iPad DAW remote at 2360×1640 landscape.

## Deliverable

A Tailwind CSS theme or set of component stylesheets that implement the
Everforest Light palette and the square/no-rounding design rule across
all components:
- TrackOverview (track rows, transport bar, M/S/R buttons)
- FXBrowser (plugin list, search, grouping)
- ParamControl (sliders, knobs, param names)
- SampleBrowser (file browser)
- Navigation (tab bar, headers)
- Loading / empty states

The design should work at 2360×1640 landscape AND be responsive down to
phone portrait (390×844).
