/**
 * Motion tokens — all timing, easing and blur values live here.
 * Rule enforced by motion-lint: never hard-code durations; import from here.
 * Never use linear easing without a // motion-ok comment.
 */
import { interpolate, Easing } from "remotion";

// ─── Durations (in frames at 30fps unless noted) ─────────────────────────────
export const dur = {
  instant:    2,  //  ~67ms  snap cuts
  veryFast:   4,  // ~133ms
  fast:       8,  // ~267ms  label/badge entrances
  medium:    15,  // ~500ms  standard text entrance
  slow:      24,  //  ~800ms emphasis reveals
  verySlow:  36,  // 1200ms  hero word entrance
  fade:      10,  // ~333ms  standard fade
} as const;

// ─── Spring presets ──────────────────────────────────────────────────────────
// Use spring() from remotion — it automatically produces physics-based curves.
export const spring = {
  snappy:  { mass: 0.4, damping: 15, stiffness: 200 },
  smooth:  { mass: 0.8, damping: 20, stiffness: 120 },
  gentle:  { mass: 1.0, damping: 28, stiffness:  80 },
  bouncy:  { mass: 0.6, damping: 10, stiffness: 180 },
} as const;

// ─── Easing presets ──────────────────────────────────────────────────────────
// Prefer spring() over these; use easings only for non-spring interpolations.
export const easing = {
  easeOut:  Easing.out(Easing.quad),
  easeIn:   Easing.in(Easing.quad),
  easeInOut: Easing.inOut(Easing.cubic),
  snap:     Easing.out(Easing.exp),        // for quick arrivals
  decelerate: Easing.out(Easing.cubic),
} as const;

// ─── Blur ────────────────────────────────────────────────────────────────────
export const blur = {
  none:   0,
  subtle: 2,
  medium: 6,
  strong: 14,
  velocity: (pxPerFrame: number): number => Math.min(pxPerFrame * 0.4, 20),
} as const;

// ─── Stagger helpers ─────────────────────────────────────────────────────────
/**
 * Returns per-child delay in frames for a staggered entrance.
 * @param index  child index (0-based)
 * @param stride frames between each child's start
 */
export function staggerDelay(index: number, stride: number = 4): number {
  return index * stride;
}

/**
 * Clamped interpolate — wraps Remotion's interpolate with extrapolateLeft/Right
 * clamped, to prevent overshoot on simple value mappings.
 */
export function lerp(
  frame: number,
  inputRange: [number, number],
  outputRange: [number, number]
): number {
  return interpolate(frame, inputRange, outputRange, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easing.easeOut,
  });
}
