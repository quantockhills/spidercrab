# Design Guidelines

This file defines the visual design direction for the reaper-ipad app.
It evolves over time as decisions are made. **AGENTS.md** points here.

---

## Reference Styles

### 1. 80gray v2.2 (Everforest Light variant)
- **File:** `original-theme/80gray v2.2 Everforest Light.ReaperThemeZip`
- **Theme adjuster:** `original-theme/80gray v2.0 Theme Adjuster.lua`
- **Type:** REAPER theme (WALTER layout + color scheme)
- **Notable:** Muted, warm, low-contrast UI. Uses square buttons, clean
  track separators, and legible typography (Calibri / Arial).
- **Everforest Light** variant applies the Everforest color palette:
  warm beige backgrounds (`#FDF6E3`), green accents (`#8DA101`),
  and soft muted foregrounds (`#5C6A72`).

### 2. Everforest (Vim color scheme)
- **Repo:** https://github.com/sainnhe/everforest
- **Palette:** https://github.com/sainnhe/everforest/blob/master/palette.md
- **Philosophy:** "Comfortable & Pleasant" — warm, earthy tones, reduced
  eye strain, optimized for long sessions.
- **Key colors (light):**
  - Background: `#FDF6E3` (medium)
  - Foreground: `#5C6A72`
  - Red: `#F85552` — errors, deletes
  - Orange: `#F57D26` — operators, labels
  - Yellow: `#DFA000` — types, warnings
  - Green: `#8DA101` — functions, strings
  - Aqua: `#35A77C` — constants
  - Blue: `#3A94C5` — identifiers, info
  - Purple: `#DF69BA` — special
- **Available in both dark and light variants**, with hard/medium/soft
  contrast sub-variants.
- **Preferred mode:** Light (Everforest Light) — warm beige, not cold white.

---

## Current Design Rules

### Shape & Form
- **Square buttons, no rounded corners.** Everything should be
  rectilinear. No pill buttons, no radius on cards, no curved edges.
- Sharp corners reinforce the utilitarian/DAW aesthetic.

### Color
- Base palette: Everforest Light (80gray variant)
- Backgrounds: warm beige/off-white (`#FDF6E3` range)
- Text: soft dark (`#5C6A72` range)
- Accents: use Everforest accent colors (green for active, orange for
  warnings, red for errors)
- Avoid pure white (#FFFFFF) and pure black (#000000) — use warm
  off-whites and soft darks instead.

### Typography
- Sans-serif, clean, legible at small sizes
- Current: Calibri / Arial family
- For the iPad app (React): system font stack, no custom fonts

### Layout Principles
- DAW-inspired: dense but not cluttered
- Clear hierarchy with background shading (alternating row colors)
- Generous touch targets for iPad (min 44pt tap area)
- Landscape-first: two-panel layouts preferred when possible

### Icons
- Simple, monoline icons
- Same stroke weight throughout
- Semantic colors (green = playing/active, gray = idle)

---

## Future Considerations

(To be filled as the design evolves.)
