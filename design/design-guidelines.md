# Design Guidelines — reaper-ipad Vibe & Visual Language

**This should feel like:** A warm, cozy DAW on an iPad. Like sitting in a
sunlit room with a cup of tea, tweaking a mix. Soft pastels on warm paper.
Inter font keeping everything crisp and modern. No sharp edges, no harsh
contrasts, no cold tech vibes. DAW power wrapped in Studio Ghibli warmth.

Everforest philosophy: "Comfortable & Pleasant" — that's the whole ethos.

---

## Reference Styles

### 1. 80gray v2.2 (Everforest Light variant)
- **File:** `original-theme/80gray v2.2 Everforest Light.ReaperThemeZip`
- **Theme adjuster:** `original-theme/80gray v2.0 Theme Adjuster.lua`
- **Type:** REAPER theme (WALTER layout + color scheme)
- **Notable:** Muted, warm, low-contrast UI. Uses square buttons, clean
  track separators, and legible typography (Inter / system sans).

### 2. Everforest (Vim color scheme)
- **Repo:** https://github.com/sainnhe/everforest
- **Palette:** https://github.com/sainnhe/everforest/blob/master/palette.md
- **Philosophy:** "Comfortable & Pleasant" — warm, earthy tones, reduced
  eye strain, optimized for long sessions.
- **Preferred mode:** Light (warm beige, not cold white).

### 3. Vibes (not technical, but essential)
- Studio Ghibli warmth — think Howl's Moving Castle interior, Kiki's seaside
- Watercolor on warm paper — nothing flat or digital-feeling
- A cozy music studio with wooden desks and warm lamps
- Clean and modern (Inter font) but not sterile (pastel colors)
- 

---

## Current Design Rules

### Overall Vibe (most important rule)
- **Pastel everything.** Muted, desaturated versions of the Everforest colors.
  Nothing should shout. Think watercolor, not acrylic.
- **Minimal.** Less UI chrome, more content. No redundant borders, no
  decorative elements, no shadows unless they serve a functional purpose
  (active state indicators).
- **Warm.** Even error states are warm red, not cold red. Every color has
  a touch of beige/cream in it.
- **Cozy DAW.** It should feel like a professional tool that someone
  thoughtfully crafted, not a cold industrial panel.

### Shape & Form
- **Square everything — no rounded corners.** But soften with color and
  spacing, not radius. The squareness should feel intentional, not harsh.
- Buttons are rectangular, cards are rectangular, panels are rectangular.
  No pill shapes, no border-radius anywhere.
- Active states: subtle color fill, no box-shadows.
- Hover/tap feedback: subtle brightness shift, no scale animations.

### Color Palette (Everforest Light, pastel-adjusted)
- **Background:** warm off-white `#FDF6E3` (like unbleached paper)
- **Secondary bg:** slightly warmer `#F5EBD9` (alternating rows, cards)
- **Tertiary bg:** `#EDE5D0` (hover states, pressed buttons)
- **Text primary:** soft dark `#5C6A72` (not black — think pencil on paper)
- **Text secondary:** `#859289` (labels, hints, less important info)
- **Accent green:** `#A6C48A` (play, active, on states) — pastel green
- **Accent red:** `#E67A6F` (stop, delete, errors) — pastel red
- **Accent orange:** `#E8A84C` (warnings, selection) — pastel orange
- **Accent yellow:** `#D4B96A` (solo, attention) — pastel yellow
- **Accent blue:** `#7BB3C9` (info, links) — pastel blue
- **Avoid pure white (#FFF) and pure black (#000)** everywhere.

### Typography
- **Primary font: Inter** — clean, highly legible at small sizes
  Download: [rsms.me/inter](https://rsms.me/inter/) or Google Fonts
- **Weights:** Regular 400 for body, Semi-Bold 600 for headings
- **Inter Mono** for parameter values, dB readouts, numeric displays
- **Loading:** CSS @font-face from Google Fonts CDN
- **Fallback:** system sans-serif stack (SF Pro on iPad)
- **Size scale:** 10-12px for metadata/labels, 13-15px for body,
  16-20px for headings. Dense but readable.

### Layout Principles
- **Landscape-first:** 2360×1640 iPad Pro. Two-panel layouts preferred:
  master/detail (track list on left, detail on right).
- **Dense but airy:** DAW density with breathing room. Generous padding
  (12-16px) but compact data (tight type, minimal whitespace between lines).
- **Touch targets:** minimum 44×44pt. iPad fingers, not mouse cursors.
- **Alternating row backgrounds** for track lists and FX lists.
  Use the secondary bg color, not stripes or borders.

### Icons
- **Minimal monoline** — thin, consistent stroke weight throughout
- **Pastel tones only** — no fully saturated colors on icons
- Inactive states: reduce opacity to ~40%, don't change color
- Active states: use the matching pastel accent color
- **Icon set:**
  - Transport: ▶ (play, pastel green), ■ (stop, pastel red), ⏸ (pause)
  - Track: 🔊 (speaker), 🔴 (record arm, pastel red)
  - FX: 🎛️ (knob icon)
  - Navigation: 📂 (media), 🎛️ (FX), 🎚️ (tracks), ⚙️ (settings)
  - Misc: ← (back), ↻ (refresh), ＋ (add), ✕ (close)

---

## Future Considerations

(To be filled as the design evolves.)
