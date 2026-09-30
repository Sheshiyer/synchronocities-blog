/**
 * FootageEdit — reusable shared footage-edit layout.
 *
 * Renders prepared footage (via Video) with:
 *   - Contain/cover fit (aspect-preserving)
 *   - Deterministic label overlay (top-left, always present)
 *   - Deterministic frame counter overlay (bottom-right, always present)
 *   - Optional Captions driven by WordTiming[] with opaque dark backing
 *
 * Imported by every named-job composition (SyntheticTestVertical, etc.) and by
 * Root.tsx when registering compositions from job-registry.json.
 *
 * No sales copy, no prices, no marketing language.
 */
import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  Video,
  staticFile,
} from "remotion";
import { colors, fonts, typeScale } from "@design/tokens";
import { Captions } from "@components/Captions";
import type { WordTiming } from "@components/Captions";

// ─── Fit mode ─────────────────────────────────────────────────────────────────
// "contain" — full frame visible, black bars where needed (no content hidden)
// "cover"   — fill frame, centred crop
export type FitMode = "contain" | "cover";

export interface OverlayLabel {
  /** Short label shown in the top-left info band. */
  topLabel: string;
  /** Short label shown in the bottom-right frame counter band (defaults to timecode). */
  bottomLabel?: string;
}

export interface FootageEditProps {
  /** staticFile()-compatible path to the prepared footage clip */
  clipPath: string;
  /** Word timings for captions (pass [] to suppress) */
  captions: WordTiming[];
  /** Format selects caption type scale */
  format: "vertical" | "horizontal";
  /** Overlay labels */
  labels: OverlayLabel;
  /** Fit mode (default: contain — preserves full frame) */
  fitMode?: FitMode;
  /** Playback rate (default 1) */
  playbackRate?: number;
}

export const FootageEdit: React.FC<FootageEditProps> = ({
  clipPath,
  captions,
  format,
  labels,
  fitMode = "contain",
  playbackRate = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = typeScale[format];

  const objectFitStyle: React.CSSProperties["objectFit"] =
    fitMode === "cover" ? "cover" : "contain";

  const labelPadV = Math.round(scale.label * 0.5);
  const labelPadH = Math.round(scale.label * 0.75);

  return (
    <AbsoluteFill style={{ background: colors.black }}>
      {/* ── Footage layer ───────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: colors.black,
        }}
      >
        <Video
          src={staticFile(clipPath)}
          playbackRate={playbackRate}
          style={{
            width: "100%",
            height: "100%",
            objectFit: objectFitStyle,
          }}
        />
      </div>

      {/* ── Top-left info label ──────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: `${labelPadV}px ${labelPadH}px`,
          background: "rgba(8,8,8,0.85)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: fonts.primary,
            fontWeight: fonts.weight.semiBold,
            fontSize: scale.label * 0.75,
            color: colors.textDim,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
          }}
        >
          {labels.topLabel}
        </span>
      </div>

      {/* ── Bottom-right frame counter ───────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          padding: `${Math.round(labelPadV * 0.85)}px ${labelPadH}px`,
          background: "rgba(8,8,8,0.85)",
        }}
      >
        <span
          style={{
            fontFamily: fonts.primary,
            fontWeight: fonts.weight.medium,
            fontSize: scale.label * 0.65,
            color: colors.accent,
            letterSpacing: "0.08em",
          }}
        >
          {labels.bottomLabel ?? `f${String(frame).padStart(4, "0")} / ${(frame / fps).toFixed(2)}s`}
        </span>
      </div>

      {/* ── Captions ────────────────────────────────────────────────────── */}
      <Captions
        words={captions}
        format={format}
        bottomOffset={Math.round(scale.label * 1.2)}
      />
    </AbsoluteFill>
  );
};
