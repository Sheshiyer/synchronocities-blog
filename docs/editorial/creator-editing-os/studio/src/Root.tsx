/**
 * Root -- Remotion composition registry.
 *
 * Reads job-registry.json at build time via registry.ts.
 * Each footage-based job gets Vertical + Horizontal compositions using the
 * shared FootageEdit component. No per-job imports needed.
 *
 * HOW TO ADD A JOB:
 *   npm run new-video <name>
 *   npm run ingest-draft <name> --fixture <path>
 *   (Root auto-registers via job-registry.json; no manual TS edit needed)
 */
import React from "react";
import { Composition, registerRoot } from "remotion";
import { SampleVertical }   from "./videos/sample/SampleVertical";
import { SampleHorizontal } from "./videos/sample/SampleHorizontal";
import { FootageEdit }      from "@components/FootageEdit";
import type { FootageEditProps } from "@components/FootageEdit";
import registry             from "./registry";

const SAMPLE_FRAMES = 150; // motion-ok (5 s at 30 fps)

// Cast once so Remotion sees a component typed to Record<string, unknown>.
// defaultProps supplies all required props at render time.
type AnyComp = React.ComponentType<Record<string, unknown>>;
const FootageEditComp = FootageEdit as unknown as AnyComp;

export const RemotionRoot: React.FC = () => {
  const jobs = Object.values(registry).filter((j) => j.durationFrames !== null);

  return (
    <>
      {/* ---- Pure-code sample compositions --------------------------------- */}
      <Composition
        id="SampleVertical"
        component={SampleVertical}
        durationInFrames={SAMPLE_FRAMES} // motion-ok
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="SampleHorizontal"
        component={SampleHorizontal}
        durationInFrames={SAMPLE_FRAMES} // motion-ok
        fps={30}
        width={1920}
        height={1080}
      />

      {/* ---- Named footage-based jobs (auto from job-registry.json) -------- */}
      {jobs.map((job) => {
        const clipPath = job.publicClip
          ? `projects/${job.id}/${job.publicClip}`
          : "";
        const frames = job.durationFrames as number;
        const vProps: FootageEditProps = {
          clipPath,
          captions: job.captions ?? [],
          format: "vertical",
          labels: { topLabel: `${job.id} · 9:16 · contain` },
          fitMode: "contain",
        };
        const hProps: FootageEditProps = {
          clipPath,
          captions: job.captions ?? [],
          format: "horizontal",
          labels: { topLabel: `${job.id} · 16:9 · contain` },
          fitMode: "contain",
        };
        return (
          <React.Fragment key={job.id}>
            <Composition
              id={job.verticalId}
              component={FootageEditComp}
              durationInFrames={frames} // motion-ok
              fps={job.fps}
              width={1080}
              height={1920}
              defaultProps={vProps as unknown as Record<string, unknown>}
            />
            <Composition
              id={job.horizontalId}
              component={FootageEditComp}
              durationInFrames={frames} // motion-ok
              fps={job.fps}
              width={1920}
              height={1080}
              defaultProps={hProps as unknown as Record<string, unknown>}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

registerRoot(RemotionRoot);
