/**
 * MaskReveal — text wipes in from behind a soft-edged gradient mask.
 * Usage: <MaskReveal startAt={30}>Your headline here</MaskReveal>
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { spring as springPresets } from "@design/motion";

export interface MaskRevealProps {
  children: React.ReactNode;
  /** Frame the reveal starts on. */
  startAt?: number;
  /** Reveal duration in frames. */
  duration?: number;
  /** Direction the reveal wipes: 'left' wipes left→right, 'bottom' wipes up. */
  direction?: "left" | "right" | "bottom" | "top";
  /** Softness of the mask edge as a percentage (0 = hard, 30 = soft). */
  softness?: number;
  style?: React.CSSProperties;
  textStyle?: React.CSSProperties;
}

export const MaskReveal: React.FC<MaskRevealProps> = ({
  children,
  startAt = 0,
  duration: _duration = 0,
  direction = "left",
  softness = 20,
  style,
  textStyle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - startAt,
    fps,
    config: { ...springPresets.smooth, damping: 24 },
  });

  // Clamp to [0,1] — spring can overshoot slightly
  const p = Math.min(1, Math.max(0, progress));

  // Build a linear-gradient mask that reveals from the direction.
  const revealPct = p * 100;
  const softPct = softness;

  let gradientDir: string;
  let gradient: string;
  switch (direction) {
    case "right":
      gradientDir = "to left";
      gradient = `linear-gradient(${gradientDir}, transparent ${100 - revealPct}%, black ${Math.min(100, 100 - revealPct + softPct)}%)`;
      break;
    case "bottom":
      gradientDir = "to top";
      gradient = `linear-gradient(${gradientDir}, transparent ${100 - revealPct}%, black ${Math.min(100, 100 - revealPct + softPct)}%)`;
      break;
    case "top":
      gradientDir = "to bottom";
      gradient = `linear-gradient(${gradientDir}, transparent ${100 - revealPct}%, black ${Math.min(100, 100 - revealPct + softPct)}%)`;
      break;
    default: // "left" — standard left-to-right wipe
      gradient = `linear-gradient(to right, black ${revealPct}%, transparent ${Math.min(100, revealPct + softPct)}%)`;
      break;
  }

  return (
    <div style={{ position: "relative", display: "inline-block", overflow: "hidden", ...style }}>
      <div
        style={{
          WebkitMaskImage: gradient,
          maskImage: gradient,
          ...textStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
};
