/**
 * SampleVertical — 5-second neutral synthetic sample in 9:16 (1080×1920).
 * Component demonstration only: Presence, MaskReveal, HighlightMark, RollingNumber.
 * No footage; rendered purely in code from design tokens.
 * No sales copy, no prices, no marketing language.
 */
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { colors, fonts, typeScale, safeZones } from "@design/tokens";
import { Presence }       from "@components/Presence";
import { MaskReveal }     from "@components/MaskReveal";
import { HighlightMark }  from "@components/HighlightMark";
import { RollingNumber }  from "@components/RollingNumber";

// Frame schedule (at 30fps, 150 frames total = 5 seconds)
const SCHEDULE = {
  bgFade:      0,
  labelIn:     8,
  headlineIn: 20,
  numberIn:   55,
  subIn:      70,
  highlightIn: 80,
  ctaIn:      110,
} as const;

export const SampleVertical: React.FC = () => {
  const { width, height } = useVideoConfig();

  const safeLeft   = width  * safeZones.left;
  const safeRight  = width  * safeZones.right;
  const safeTop    = height * safeZones.top;
  const safeBottom = height * safeZones.bottom;

  const scale = typeScale.vertical;

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        fontFamily: fonts.primary,
        overflow: "hidden",
      }}
    >
      {/* Subtle gradient wash */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${colors.accentDim}22, transparent 70%)`,
        }}
      />

      {/* Content area, inset to safe zones */}
      <div
        style={{
          position: "absolute",
          top: safeTop,
          left: safeLeft,
          right: safeRight,
          bottom: safeBottom,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          paddingTop: 40,
          paddingBottom: 40,
        }}
      >
        {/* ── LABEL (top) ── */}
        <Presence enterAt={SCHEDULE.labelIn} direction="down" slideDistance={20}>
          <div
            style={{
              fontFamily: fonts.primary,
              fontWeight: fonts.weight.semiBold,
              fontSize: scale.label,
              color: colors.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
            }}
          >
            Synthetic studio test
          </div>
        </Presence>

        {/* ── HEADLINE (centre-ish) ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 24 }}>
          <MaskReveal startAt={SCHEDULE.headlineIn} duration={22}>
            <div
              style={{
                fontFamily: fonts.primary,
                fontWeight: fonts.weight.extraBold,
                fontSize: scale.heroWord,
                color: colors.text,
                lineHeight: 0.95,
              }}
            >
              Frame-
              <br />
              <span style={{ color: colors.accent }}>driven.</span>
            </div>
          </MaskReveal>

          {/* Rolling number — 5 seconds, labelled neutral */}
          <Presence enterAt={SCHEDULE.numberIn} direction="up" slideDistance={28}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <RollingNumber
                from={0}
                to={5}
                startAt={SCHEDULE.numberIn}
                style={{
                  fontSize: scale.bigNumber,
                  color: colors.accent,
                  fontWeight: fonts.weight.extraBold,
                }}
              />
              <span
                style={{
                  fontSize: scale.label * 1.2,
                  color: colors.textDim,
                  fontWeight: fonts.weight.medium,
                }}
              >
                seconds
              </span>
            </div>
          </Presence>

          {/* Highlighted subtitle */}
          <Presence enterAt={SCHEDULE.subIn} direction="up" slideDistance={20}>
            <div
              style={{
                fontFamily: fonts.primary,
                fontWeight: fonts.weight.semiBold,
                fontSize: scale.headline * 0.7,
                color: colors.text,
                lineHeight: 1.4,
              }}
            >
              Component{" "}
              <HighlightMark startAt={SCHEDULE.highlightIn} color={colors.accent}>
                demonstration.
              </HighlightMark>
            </div>
          </Presence>
        </div>

        {/* ── CTA (bottom) ── */}
        <Presence enterAt={SCHEDULE.ctaIn} direction="up" slideDistance={16}>
          <div
            style={{
              fontFamily: fonts.primary,
              fontWeight: fonts.weight.medium,
              fontSize: scale.caption,
              color: colors.textDim,
              letterSpacing: "0.04em",
            }}
          >
            No publication · synthetic only
          </div>
        </Presence>
      </div>
    </AbsoluteFill>
  );
};
