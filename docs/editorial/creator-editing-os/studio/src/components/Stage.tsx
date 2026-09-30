/**
 * Stage — footage full screen with optional smooth zoom-through for jump cuts.
 * Usage: provide a staticFile() src and optional cutFrames list.
 * Each cutFrame triggers a brief push-zoom to disguise a hard cut.
 */
import React from "react";
import { useCurrentFrame, interpolate, Video, staticFile } from "remotion";
import { easing } from "@design/motion";

export interface JumpCut {
  /** Frame at which the cut occurs. */
  frame: number;
  /** Zoom scale at cut peak (default 1.08 = subtle push). */
  scale?: number;
}

export interface StageProps {
  src: string;
  /** List of jump-cut frames that get a zoom-through. */
  jumpCuts?: JumpCut[];
  /** Playback speed (default 1). */
  playbackRate?: number;
  style?: React.CSSProperties;
}

export const Stage: React.FC<StageProps> = ({
  src,
  jumpCuts = [],
  playbackRate = 1,
  style,
}) => {
  const frame = useCurrentFrame();

  // Compute zoom boost from nearest jump cut (if any is within ±8 frames)
  let zoomBoost = 1;
  for (const cut of jumpCuts) {
    const dist = frame - cut.frame;
    if (dist >= -4 && dist <= 8) {
      const maxScale = cut.scale ?? 1.08;
      // Quick push in then settle back
      const boostProgress = interpolate(
        dist,
        [-4, 0, 4, 8],
        [0, 1, 0.6, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easing.easeInOut }
      );
      zoomBoost = 1 + (maxScale - 1) * boostProgress;
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      <Video
        src={staticFile(src)}
        playbackRate={playbackRate}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${zoomBoost.toFixed(4)})`,
          transformOrigin: "center center",
        }}
      />
    </div>
  );
};
