/**
 * BrowserWindow — a clean browser chrome frame that pans/zooms over a screenshot.
 * Usage: provide a staticFile() src for the screenshot.
 *   <BrowserWindow src="/screenshots/my-page.png" panTo={{x:0.5,y:0.8}} zoomTo={1.4} />
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, staticFile, interpolate, Img } from "remotion";
import { colors, radii, shadows, fonts } from "@design/tokens";
import { dur, easing } from "@design/motion";

export interface BrowserWindowProps {
  src: string;
  url?: string;
  /** Start pan/zoom animation at this frame. */
  animateAt?: number;
  /** Normalized pan target {x: 0..1, y: 0..1} — 0,0 is top-left. */
  panTo?: { x: number; y: number };
  /** Final zoom scale. */
  zoomTo?: number;
  style?: React.CSSProperties;
}

export const BrowserWindow: React.FC<BrowserWindowProps> = ({
  src,
  url = "example.com",
  animateAt = 0,
  panTo,
  zoomTo = 1,
  style,
}) => {
  const frame = useCurrentFrame();
  const { } = useVideoConfig();

  const animDuration = dur.verySlow;
  const progress = interpolate(
    frame - animateAt,
    [0, animDuration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easing.decelerate }
  );

  const scale     = 1 + (zoomTo - 1) * progress;
  const offsetX   = panTo ? (panTo.x - 0.5) * (scale - 1) * 100 : 0;
  const offsetY   = panTo ? (panTo.y - 0.5) * (scale - 1) * 100 : 0;

  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: radii.lg,
        boxShadow: shadows.lg,
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Browser chrome */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          background: "#1E1E1E",
          borderBottom: "1px solid #2A2A2A",
        }}
      >
        {/* Traffic lights */}
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c, i) => (
          <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />
        ))}
        {/* URL bar */}
        <div
          style={{
            flex: 1,
            background: "#2A2A2A",
            borderRadius: radii.sm,
            padding: "4px 12px",
            fontFamily: fonts.primary,
            fontSize: 13,
            color: colors.textDim,
            marginLeft: 8,
          }}
        >
          {url}
        </div>
      </div>
      {/* Screenshot with pan/zoom */}
      <div style={{ overflow: "hidden", position: "relative" }}>
        <Img
          src={staticFile(src)}
          style={{
            display: "block",
            width: "100%",
            transform: `scale(${scale}) translate(${offsetX}%, ${offsetY}%)`,
            transformOrigin: "top left",
          }}
        />
      </div>
    </div>
  );
};
