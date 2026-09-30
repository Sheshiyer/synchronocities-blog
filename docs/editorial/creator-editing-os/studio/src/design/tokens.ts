/**
 * Design tokens — the single source of truth for every visual decision.
 * Edit this file in Level 2 to apply your brand; components pull from here only.
 */

// ─── Colour ──────────────────────────────────────────────────────────────────
export const colors = {
  bg: "#0A0A0A",         // near-black background
  surface: "#161616",    // slightly lifted surface (cards, panels)
  text: "#F0EDE8",       // off-white body text
  textDim: "#8A8480",    // secondary / label text
  accent: "#E8C96B",     // one accent (replace with your brand colour in Level 2)
  accentDim: "#7A6A38",  // dimmed accent for marks / underlines
  overlay: "rgba(10,10,10,0.72)", // semi-transparent overlay
  white: "#FFFFFF",
  black: "#000000",
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────
export const fonts = {
  primary: "Inter",
  weight: {
    regular: 400,
    medium: 500,
    semiBold: 600,
    bold: 700,
    extraBold: 800,
  },
} as const;

/**
 * Type scale for both formats.
 * Vertical (9:16 1080×1920), Horizontal (16:9 1920×1080).
 * Rule from STYLE.md: if text needs to be bigger than this scale to feel
 * important, the layout is wrong, not the size.
 */
export const typeScale = {
  // 9:16 vertical
  vertical: {
    heroWord:    200, // 130–220px range
    headline:    100,
    bigNumber:   150,
    label:        32, // uppercase, wide tracking
    caption:      42,
  },
  // 16:9 horizontal
  horizontal: {
    heroWord:    280, // 200–320px range
    headline:    116,
    bigNumber:   170,
    label:        40, // uppercase, wide tracking
    caption:      46,
  },
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const spacing = {
  xs: 8,
  sm: 16,
  md: 32,
  lg: 64,
  xl: 96,
  xxl: 128,
} as const;

// ─── Corner radii ────────────────────────────────────────────────────────────
export const radii = {
  sm: 4,
  md: 12,
  lg: 24,
  pill: 9999,
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────
export const shadows = {
  sm: "0 2px 8px rgba(0,0,0,0.4)",
  md: "0 4px 24px rgba(0,0,0,0.5)",
  lg: "0 8px 48px rgba(0,0,0,0.6)",
  glow: `0 0 32px ${colors.accent}44`,
} as const;

/**
 * Safe zones — keep all text and graphics inside these inset values.
 * Expressed as a fraction of the frame width/height.
 * These prevent text from hiding under app buttons in 9:16.
 */
export const safeZones = {
  top:    0.08,  // 8% from top
  bottom: 0.12,  // 12% from bottom (TikTok/Reels action buttons)
  left:   0.06,
  right:  0.06,
} as const;
