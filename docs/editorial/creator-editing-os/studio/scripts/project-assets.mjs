#!/usr/bin/env node
/**
 * project-assets.mjs — isolated project path resolver.
 *
 * Enforces:
 *   - Job name must match /^[a-z0-9][a-z0-9\-_]{0,63}$/ (no dots, no slashes)
 *   - All returned paths are canonical paths strictly inside the studio root
 *   - Existing symlinks are resolved and containment re-verified
 *   - No path traversal, no cross-project access
 *
 * Usage:
 *   import { projectPaths, validateId, assertContained } from "./project-assets.mjs";
 */
import { existsSync, realpathSync, mkdirSync } from "fs";
import { join, resolve, relative, normalize, sep } from "path";
import { fileURLToPath } from "url";

export const STUDIO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Regex that all job names must satisfy. */
const ID_RE = /^[a-z0-9][a-z0-9\-_]{0,63}$/;

/**
 * Validate a job/video name. Throws with a descriptive message on failure.
 */
export function validateId(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`Invalid job name: must be a non-empty string.`);
  }
  if (!ID_RE.test(name)) {
    throw new Error(
      `Invalid job name ${JSON.stringify(name)}. ` +
      `Must match /^[a-z0-9][a-z0-9\\-_]{0,63}$/ — lowercase alphanumeric, hyphens and underscores only. ` +
      `No dots, slashes, spaces or uppercase allowed.`
    );
  }
  return name;
}

/**
 * Assert that a candidate path is strictly contained within root.
 * For existing paths, resolves symlinks and re-checks.
 * Throws on any violation.
 */
export function assertContained(candidate, root) {
  const effectiveRoot = root ?? STUDIO_ROOT;
  const absRoot = resolve(effectiveRoot) + sep;
  const absCandidate = resolve(normalize(candidate));

  // Must start with root prefix (using sep to avoid prefix collisions like /foo vs /foobar)
  if (!absCandidate.startsWith(absRoot) && absCandidate !== resolve(effectiveRoot)) {
    throw new Error(
      `Path containment violation: "${candidate}" is outside studio root "${effectiveRoot}".`
    );
  }

  // If the path exists, resolve symlinks and recheck
  if (existsSync(candidate)) {
    let real;
    try { real = realpathSync(candidate); } catch { return; }
    if (!real.startsWith(absRoot) && real !== resolve(effectiveRoot)) {
      throw new Error(
        `Symlink traversal rejected: "${candidate}" resolves to "${real}", outside studio root "${effectiveRoot}".`
      );
    }
  }
}

/**
 * Returns all canonical paths for a video project, asserting containment.
 * Pass createDirs=true to create leaf directories on demand.
 */
export function projectPaths(name, createDirs = false) {
  validateId(name);

  const paths = {
    root:        STUDIO_ROOT,
    assetDir:    join(STUDIO_ROOT, "assets", "projects", name),
    footage:     join(STUDIO_ROOT, "assets", "projects", name, "footage"),
    broll:       join(STUDIO_ROOT, "assets", "projects", name, "broll"),
    screenshots: join(STUDIO_ROOT, "assets", "projects", name, "screenshots"),
    audio:       join(STUDIO_ROOT, "assets", "projects", name, "audio"),
    voiceWav:    join(STUDIO_ROOT, "assets", "projects", name, "audio", "voice.wav"),
    sfxCues:     join(STUDIO_ROOT, "assets", "projects", name, "audio", "sfx-cues.txt"),
    srcVideo:    join(STUDIO_ROOT, "src", "videos", name),
    workPrep:    join(STUDIO_ROOT, "work", name, "prep"),
    outDir:      join(STUDIO_ROOT, "out", name),
    prepMd:      join(STUDIO_ROOT, "work", name, "prep", "PREP.md"),
    brief:       join(STUDIO_ROOT, "assets", "projects", name, "BRIEF.md"),
    jobConfig:   join(STUDIO_ROOT, "assets", "projects", name, "job-config.json"),
    publicClips: join(STUDIO_ROOT, "public", "projects", name),
  };

  // Verify every derived path is inside the studio root
  for (const [key, p] of Object.entries(paths)) {
    if (key !== "root") assertContained(p, STUDIO_ROOT);
  }

  if (createDirs) {
    for (const key of ["footage", "broll", "screenshots", "audio", "srcVideo", "workPrep", "outDir", "publicClips"]) {
      mkdirSync(paths[key], { recursive: true });
    }
  }

  return paths;
}
