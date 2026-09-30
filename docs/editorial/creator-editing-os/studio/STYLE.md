# STYLE.md — House Style

This file is the source of truth for every visual and motion decision.
It grows with every video. CLAUDE.md rule: whenever I approve or reject something, add it here.
If a design decision is not covered here, default to the neutral look in src/design/tokens.ts.

---

## Identity

_Fill this in during Level 2 — your fonts, colours and brand personality._

- **Brand name**: [Your name / channel name]
- **Fonts**: Inter (placeholder — replace with your font in Level 2)
- **Primary colour**: #E8C96B (warm gold — neutral until Level 2)
- **Background**: #0A0A0A (near-black)
- **Emphasis**: Bold weight, accent colour on key word or number
- **Numbers**: Always digits (never "fourteen"; always "14")
- **Captions**: 42px / 46px, bold on active word, dimmed on context words

---

## Type Scale

| Element | 9:16 (px) | 16:9 (px) | Notes |
|---------|-----------|-----------|-------|
| Hero word | 130–220 | 200–320 | One to four words, fills the frame |
| Headline | ~100 | ~116 | Key point, can wrap one line |
| Big number | ~150 | ~170 | Rolling numbers, stats |
| Label | 32 | 40 | Uppercase, 0.18em tracking |
| Caption | 42 | 46 | Bold active, dimmed context |

Rule: if text needs to be bigger than this scale to feel important, the layout is wrong, not the size.

---

## Layout

- Text lives in the clear space — not over the face.
- 9:16: big text above head, captions at bottom above safe zone.
- 16:9: two-column when footage is talking-head; full-width for montages.
- All graphics drawn in code; only logos, photos, screenshots are images.
- Safe zones: 8% top, 12% bottom, 6% sides (see src/design/tokens.ts).

---

## Motion

- All entrances: spring-based, easing.easeOut or spring presets from motion.ts.
- Standard entrance: slide up 24px + fade in, medium spring (~0.5s).
- Stagger: 4 frames between each child in a list.
- No linear easing. No CSS transitions. No will-change.
- Zoom-through on every jump cut (brief 8% scale push, 12-frame ramp).
- Nothing snaps on instantly unless it is a hard cut.

---

## Sound

See CLAUDE.md §3g for the full audio standard.
Short version: voice untouched, effects ducked 6dB, -14 LUFS, TP -1dBTP.

---

## Colour

| Role | Value | Usage |
|------|-------|-------|
| Background | #0A0A0A | Frame fill |
| Surface | #161616 | Cards, panels |
| Text | #F0EDE8 | All body text |
| Text dim | #8A8480 | Labels, context captions |
| Accent | #E8C96B | Key words, numbers, marks |
| Accent dim | #7A6A38 | Highlight bar fill |
| Overlay | rgba(10,10,10,0.72) | Pill backgrounds |

---

## Approved Effects

| Name | What it looks like | First approved on |
|------|--------------------|-------------------|
| MaskReveal | Text wipes in behind a soft gradient from left | sample |
| HighlightMark | Gold bar wipes in behind a key phrase | sample |
| RollingNumber | Digits count up to the final value | sample |
| Presence | Slide + fade entrance with velocity blur | sample |

---

## Rejected

| What | Why | Which video |
|------|-----|-------------|
| _(none yet)_ | | |

---

_Version 1.0 — 2026-09-30. Grows with every video._
