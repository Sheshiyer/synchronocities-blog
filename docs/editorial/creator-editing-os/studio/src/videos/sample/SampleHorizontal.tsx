/**
 * SampleHorizontal — 5-second neutral synthetic sample in 16:9 (1920×1080).
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

const SCHEDULE = {
  bgFade:      0,
  labelIn:     8,
  headlineIn: 20,
  numberIn:   55,
  subIn:      70,
  highlightIn: 80,
  ctaIn:      110,
} as const;

export const SampleHorizontal: React.FC = () => {
  const { width, height } = useVideoConfig();

  const safeLeft   = width  * safeZones.left;
  const safeRight  = width  * safeZones.right;
  const safeTop    = height * safeZones.top;
  const safeBottom = height * safeZones.bottom;

  const scale = typeScale.horizontal;

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        fontFamily: fonts.primary,
        overflow: "hidden",
      }}
    >
      {/* Gradient wash */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 60% 90% at 25% 50%, ${colors.accentDim}20, transparent 65%)`,
        }}
      />

      {/* Two-column layout */}
      <div
        style={{
          position: "absolute",
          top: safeTop,
          left: safeLeft,
          right: safeRight,
          bottom: safeBottom,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          alignItems: "center",
          gap: 48,
        }}
      >
        {/* Left column — headline + number */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <Presence enterAt={SCHEDULE.labelIn} direction="down" slideDistance={16}>
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

          <MaskReveal startAt={SCHEDULE.headlineIn} duration={22}>
            <div
              style={{
                fontFamily: fonts.primary,
                fontWeight: fonts.weight.extraBold,
                fontSize: scale.heroWord * 0.75,
                color: colors.text,
                lineHeight: 0.95,
              }}
            >
              Frame-
              <br />
              <span style={{ color: colors.accent }}>driven.</span>
            </div>
          </MaskReveal>

          <Presence enterAt={SCHEDULE.ctaIn} direction="up" slideDistance={12}>
            <div
              style={{
                fontFamily: fonts.primary,
                fontWeight: fonts.weight.medium,
                fontSize: scale.caption,
                color: colors.textDim,
              }}
            >
              No publication · synthetic only
            </div>
          </Presence>
        </div>

        {/* Right column — number + subtitle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Presence enterAt={SCHEDULE.numberIn} direction="right" slideDistance={32}>
            <div style={{ display: "flex", flexDirection: "column" }}>
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
                  fontFamily: fonts.primary,
                  fontSize: scale.label * 1.1,
                  color: colors.textDim,
                  fontWeight: fonts.weight.medium,
                  marginTop: 8,
                }}
              >
                seconds
              </span>
            </div>
          </Presence>

          <Presence enterAt={SCHEDULE.subIn} direction="up" slideDistance={20}>
            <div
              style={{
                fontFamily: fonts.primary,
                fontWeight: fonts.weight.semiBold,
                fontSize: scale.headline * 0.55,
                color: colors.text,
                lineHeight: 1.5,
              }}
            >
              Component{" "}
              <HighlightMark startAt={SCHEDULE.highlightIn} color={colors.accent}>
                demonstration.
              </HighlightMark>
              <br />
              Motion tokens in action.
            </div>
          </Presence>
        </div>
      </div>
    </AbsoluteFill>
  );
};
