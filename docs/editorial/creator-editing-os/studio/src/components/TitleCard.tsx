/**
 * TitleCard — clean title and LocationLabel for montages.
 * Usage: <TitleCard title="Thailand" subtitle="Day 1 — Bangkok" startAt={0} />
 */
import React from "react";
import { staggerDelay } from "@design/motion";
import { colors, fonts, typeScale, shadows } from "@design/tokens";
import { Presence } from "./Presence";

export interface TitleCardProps {
  title: string;
  subtitle?: string;
  format?: "vertical" | "horizontal";
  startAt?: number;
  style?: React.CSSProperties;
}

export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  subtitle,
  format = "vertical",
  startAt = 0,
  style,
}) => {
  const scale = typeScale[format];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        ...style,
      }}
    >
      <Presence enterAt={startAt} direction="up" slideDistance={32}>
        <div
          style={{
            fontFamily: fonts.primary,
            fontWeight: fonts.weight.extraBold,
            fontSize: scale.headline,
            color: colors.text,
            textShadow: shadows.md,
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
      </Presence>

      {subtitle && (
        <Presence enterAt={startAt + staggerDelay(1, 6)} direction="up" slideDistance={20}>
          <div
            style={{
              fontFamily: fonts.primary,
              fontWeight: fonts.weight.medium,
              fontSize: scale.label,
              color: colors.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              textAlign: "center",
            }}
          >
            {subtitle}
          </div>
        </Presence>
      )}
    </div>
  );
};

export interface LocationLabelProps {
  location: string;
  date?: string;
  startAt?: number;
  style?: React.CSSProperties;
}

export const LocationLabel: React.FC<LocationLabelProps> = ({
  location,
  date,
  startAt = 0,
  style,
}) => {
  return (
    <Presence enterAt={startAt} direction="left" slideDistance={20} style={style}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: colors.overlay,
          borderRadius: 9999,
          padding: "6px 20px",
          backdropFilter: "blur(8px)",
        }}
      >
        <span
          style={{
            fontFamily: fonts.primary,
            fontWeight: fonts.weight.semiBold,
            fontSize: 32,
            color: colors.text,
            letterSpacing: "0.04em",
          }}
        >
          {location}
        </span>
        {date && (
          <span
            style={{
              fontFamily: fonts.primary,
              fontWeight: fonts.weight.regular,
              fontSize: 28,
              color: colors.textDim,
            }}
          >
            · {date}
          </span>
        )}
      </div>
    </Presence>
  );
};
