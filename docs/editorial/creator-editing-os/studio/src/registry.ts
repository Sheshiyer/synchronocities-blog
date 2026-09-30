/**
 * registry.ts - thin wrapper over src/job-registry.json.
 * job-registry.json is written by scripts/update-registry.mjs after
 * new-video / prep / ingest-draft. Same public API as before.
 */
import registryJson from "./job-registry.json";

export interface JobEntry {
  id: string;
  pascal: string;
  verticalId: string;
  horizontalId: string;
  durationFrames: number | null;
  fps: number;
  sourceClip: string | null;
  publicClip: string | null;
  srtFile: string | null;
  synthetic: boolean;
  createdAt: string | null;
  captions?: { word: string; startSec: number; endSec: number }[];
}

const registry = registryJson as Readonly<Record<string, JobEntry>>;
export default registry;

export function getJob(id: string): JobEntry | undefined {
  return registry[id];
}

export function allJobIds(): string[] {
  return Object.keys(registry);
}
