/**
 * Presence — entrance and exit wrapper with automatic velocity motion blur.
 * Usage: wrap any element. It fades + slides in, and fades + slides out.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { spring as springPresets, dur, blur } from "@design/motion";

export interface PresenceProps {
  children: React.ReactNode;
  /** Frame at which entrance starts. Defaults to 0. */
  enterAt?: number;
  /** Frame at which exit starts. Pass undefined to never exit. */
  exitAt?: number;
  /** Exit lasts this many frames. */
  exitDuration?: number;
  /** Direction of entrance slide: 'up' | 'down' | 'left' | 'right' | 'none' */
  direction?: "up" | "down" | "left" | "right" | "none";
  /** Slide distance in pixels. */
  slideDistance?: number;
  style?: React.CSSProperties;
  className?: string;
}

export const Presence: React.FC<PresenceProps> = ({
  children,
  enterAt = 0,
  exitAt,
  exitDuration = dur.fast,
  direction = "up",
  slideDistance = 24,
  style,
  className,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Entrance ──
  const enterProgress = spring({
    frame: frame - enterAt,
    fps,
    config: springPresets.smooth,
  });

  // ── Exit ──
  let exitProgress = 0;
  if (exitAt !== undefined) {
    exitProgress = interpolate(
      frame - exitAt,
      [0, exitDuration],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
  }

  const opacity = enterProgress * (1 - exitProgress);

  // ── Velocity motion blur (proportional to movement speed this frame) ──
  const enterProgressPrev = spring({
    frame: frame - enterAt - 1,
    fps,
    config: springPresets.smooth,
  });
  const velocity = Math.abs(enterProgress - enterProgressPrev) * slideDistance;
  const motionBlur = blur.velocity(velocity);

  // ── Translate ──
  const translateValue = (1 - enterProgress) * slideDistance;
  const translateCSS = (() => {
    if (direction === "none") return "none";
    if (direction === "up")    return `translateY(${translateValue}px)`;
    if (direction === "down")  return `translateY(${-translateValue}px)`;
    if (direction === "left")  return `translateX(${translateValue}px)`;
    if (direction === "right") return `translateX(${-translateValue}px)`;
    return "none";
  })();

  return (
    <div
      className={className}
      style={{
        opacity,
        transform: translateCSS,
        filter: motionBlur > 0.5
          ? `blur(${motionBlur.toFixed(1)}px)`
          : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
