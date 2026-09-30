/**
 * HighlightMark — an accent marker that wipes in behind a key phrase.
 * Usage: wrap the phrase you want highlighted.
 *   <HighlightMark startAt={45}>key phrase</HighlightMark>
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { spring as springPresets } from "@design/motion";
import { colors, radii } from "@design/tokens";

export interface HighlightMarkProps {
  children: React.ReactNode;
  /** Frame the wipe starts on. */
  startAt?: number;
  /** Accent colour (defaults to design token accent). */
  color?: string;
  /** Vertical offset of the mark (negative = higher). */
  yOffset?: number;
  /** Height of the mark as a fraction of line height (default 0.35). */
  heightFraction?: number;
  style?: React.CSSProperties;
}

export const HighlightMark: React.FC<HighlightMarkProps> = ({
  children,
  startAt = 0,
  color = colors.accent,
  yOffset = 4,
  heightFraction = 0.35,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - startAt,
    fps,
    config: springPresets.snappy,
  });

  const scaleX = Math.min(1, Math.max(0, progress));

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        zIndex: 0,
        ...style,
      }}
    >
      {/* The highlight bar behind the text */}
      <span
        style={{
          position: "absolute",
          bottom: yOffset,
          left: 0,
          width: "100%",
          height: `${heightFraction * 100}%`,
          backgroundColor: color,
          borderRadius: radii.sm,
          transformOrigin: "left center",
          transform: `scaleX(${scaleX})`,
          zIndex: -1,
          opacity: 0.8,
        }}
      />
      {/* Text sits on top */}
      <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
    </span>
  );
};
