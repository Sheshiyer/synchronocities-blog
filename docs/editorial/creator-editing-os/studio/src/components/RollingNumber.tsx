/**
 * RollingNumber — digits roll from one value to another on a configurable curve.
 * Usage: <RollingNumber from={0} to={1499} startAt={30} prefix="₹" />
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { spring as springPresets, easing } from "@design/motion";
import { colors, fonts } from "@design/tokens";

export interface RollingNumberProps {
  /** Starting value. */
  from?: number;
  /** Target value to roll to. */
  to: number;
  /** Frame the roll starts. */
  startAt?: number;
  /** Duration in frames (ignored when using spring). Set 0 for spring mode. */
  duration?: number;
  /** Whether to format with locale commas (e.g. 1,499). */
  format?: boolean;
  /** Decimal places to show. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: React.CSSProperties;
}

export const RollingNumber: React.FC<RollingNumberProps> = ({
  from = 0,
  to,
  startAt = 0,
  duration = 0,
  format = true,
  decimals = 0,
  prefix = "",
  suffix = "",
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let progress: number;

  if (duration > 0) {
    // Frame-counted interpolation with decelerate easing
    progress = interpolate(
      frame - startAt,
      [0, duration],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easing.decelerate }
    );
  } else {
    // Spring-based (feels heavier / more physical)
    progress = spring({
      frame: frame - startAt,
      fps,
      config: springPresets.smooth,
    });
    progress = Math.min(1, Math.max(0, progress));
  }

  const current = from + (to - from) * progress;
  const displayValue = format
    ? current.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : current.toFixed(decimals);

  return (
    <span
      style={{
        fontFamily: fonts.primary,
        fontWeight: fonts.weight.bold,
        fontVariantNumeric: "tabular-nums",
        color: colors.text,
        ...style,
      }}
    >
      {prefix}{displayValue}{suffix}
    </span>
  );
};
