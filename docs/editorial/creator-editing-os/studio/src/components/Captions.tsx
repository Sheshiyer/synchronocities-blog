/**
 * Captions — word-by-word captions driven by word timings.
 * Active word highlights; previous words dim.
 * Each word gets an opaque dark backing with padding for readability.
 * Captions hide when the same text is on screen as a graphic.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts, typeScale, safeZones } from "@design/tokens";

export interface WordTiming {
  word: string;
  startSec: number;
  endSec: number;
}

export interface CaptionsProps {
  words: WordTiming[];
  /** 'vertical' or 'horizontal' — selects the right type scale. */
  format?: "vertical" | "horizontal";
  /** Additional bottom margin above safe zone (in px). */
  bottomOffset?: number;
  /** Whether to suppress (hide) captions entirely — use when same text shows as graphic. */
  suppress?: boolean;
  style?: React.CSSProperties;
}

export const Captions: React.FC<CaptionsProps> = ({
  words,
  format = "vertical",
  bottomOffset = 0,
  suppress = false,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  if (suppress || words.length === 0) return null;

  const currentSec = frame / fps;

  const activeIdx = words.findIndex(
    (w) => currentSec >= w.startSec && currentSec < w.endSec
  );

  if (activeIdx === -1) return null;

  const windowStart = Math.max(0, activeIdx - 1);
  const windowEnd   = Math.min(words.length - 1, activeIdx + 2);
  const visible     = words.slice(windowStart, windowEnd + 1);

  const fontSize = typeScale[format].caption;
  const bottomSafe = height * safeZones.bottom + bottomOffset;

  // Backing padding scales with font size
  const padV = Math.round(fontSize * 0.18);
  const padH = Math.round(fontSize * 0.32);

  return (
    <div
      style={{
        position: "absolute",
        bottom: bottomSafe,
        left: `${safeZones.left * 100}%`,
        right: `${safeZones.right * 100}%`,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: `${Math.round(fontSize * 0.22)}px`,
        ...style,
      }}
    >
      {visible.map((w, i) => {
        const globalIdx = windowStart + i;
        const isActive = globalIdx === activeIdx;
        return (
          <span
            key={globalIdx}
            style={{
              fontFamily: fonts.primary,
              fontWeight: isActive ? fonts.weight.bold : fonts.weight.medium,
              fontSize,
              color: isActive ? colors.text : colors.textDim,
              lineHeight: 1.3,
              wordSpacing: "0.08em",
              background: isActive
                ? "rgba(6,6,6,0.92)"
                : "rgba(6,6,6,0.72)",
              borderRadius: 6,
              padding: `${padV}px ${padH}px`,
              transition: undefined, // motion-lint: no CSS transition
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};
