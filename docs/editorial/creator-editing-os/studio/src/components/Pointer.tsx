/**
 * Pointer — an arrow that glides to a point and clicks with a ripple.
 * Usage: <Pointer targetX={400} targetY={300} clickAt={60} />
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { spring as springPresets, dur } from "@design/motion";
import { colors } from "@design/tokens";

export interface PointerProps {
  /** Starting X position (px). Defaults to 0. */
  fromX?: number;
  fromY?: number;
  /** Target X position (px). */
  targetX: number;
  targetY: number;
  /** Frame the pointer starts moving. */
  moveAt?: number;
  /** Frame the click happens. */
  clickAt?: number;
  color?: string;
  size?: number;
}

export const Pointer: React.FC<PointerProps> = ({
  fromX = 0,
  fromY = 0,
  targetX,
  targetY,
  moveAt = 0,
  clickAt,
  color = colors.accent,
  size = 40,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const moveProgress = spring({
    frame: frame - moveAt,
    fps,
    config: springPresets.smooth,
  });

  const p = Math.min(1, Math.max(0, moveProgress));
  const x = fromX + (targetX - fromX) * p;
  const y = fromY + (targetY - fromY) * p;

  // Click ripple
  let rippleScale = 0;
  let rippleOpacity = 0;
  if (clickAt !== undefined && frame >= clickAt) {
    const clickProgress = interpolate(
      frame - clickAt,
      [0, dur.medium],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
    rippleScale   = clickProgress * 3;
    rippleOpacity = 1 - clickProgress;
  }

  return (
    <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
      {/* Ripple */}
      {rippleScale > 0 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: size,
            height: size,
            borderRadius: "50%",
            border: `2px solid ${color}`,
            transform: `translate(-50%, -50%) scale(${rippleScale})`,
            opacity: rippleOpacity,
          }}
        />
      )}
      {/* Arrow cursor */}
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M4 2L20 12L12 13L8 22L4 2Z"
          fill={color}
          stroke="#000"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
};
