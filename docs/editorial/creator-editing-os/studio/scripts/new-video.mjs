#!/usr/bin/env node
/**
 * new-video [name] [--type talking|montage]
 *
 * Creates all required folders, a copy of BRIEF.md, and an initial job-config.json
 * for a new video project. Name is validated (ID_RE) and all paths containment-checked.
 * Opens the footage folder in Finder (macOS) or Explorer (Windows) if not CI.
 *
 * job-config.json is populated with name, type, and placeholder duration=null
 * (actual probed duration is written by prep or ingest-draft after ffprobe).
 *
 * Structured JSON output last:
 *   { "ok": true, "name": "...", "type": "...", "paths": { ... } }
 */
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync, spawnSync } from "child_process";
import { projectPaths, validateId, assertContained, STUDIO_ROOT } from "./project-assets.mjs";

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith("--")) {
  console.error("Usage: npm run new-video <name> [--type talking|montage]");
  process.exit(1);
}

const rawName = args[0];

// Reject names that contain traversal patterns before any sanitization
if (/[\/\\]|\.\./.test(rawName)) {
  console.error(`Error: Invalid job name ${JSON.stringify(rawName)} — must not contain slashes or '..'.`);
  process.exit(1);
}

const sanitized = rawName.toLowerCase().replace(/[^a-z0-9\-_]/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
let name;
try {
  name = validateId(sanitized || rawName);
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}

const typeFlag = args.indexOf("--type");
const videoType = typeFlag !== -1 ? args[typeFlag + 1] : "talking";

if (!["talking", "montage"].includes(videoType)) {
  console.error(`--type must be 'talking' or 'montage', got '${videoType}'`);
  process.exit(1);
}

let paths;
try {
  paths = projectPaths(name, true);
} catch (e) {
  console.error(`Security check failed: ${e.message}`);
  process.exit(1);
}

// Copy BRIEF.md template
const briefSrc = join(paths.root, "templates", "BRIEF.md");
if (existsSync(briefSrc) && !existsSync(paths.brief)) {
  copyFileSync(briefSrc, paths.brief);
  console.log(`  ✓  BRIEF.md copied to: ${paths.brief}`);
}

// Write initial job-config.json (duration=null until prep/ingest-draft probes it)
const configPath = join(paths.assetDir, "job-config.json");
assertContained(configPath, STUDIO_ROOT);
if (!existsSync(configPath)) {
  const pascal = name
    .split(/[-_]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const jobConfig = {
    id: name,
    pascal,
    verticalId: `${pascal}Vertical`,
    horizontalId: `${pascal}Horizontal`,
    type: videoType,
    fps: 30,
    durationFrames: null,
    durationSec: null,
    sourceClip: null,
    publicClip: null,
    srtFile: null,
    synthetic: false,
    createdAt: new Date().toISOString(),
    note: "durationFrames is null until prep or ingest-draft probes the source clip.",
  };
  writeFileSync(configPath, JSON.stringify(jobConfig, null, 2), "utf8");
  console.log(`  ✓  job-config.json written: ${configPath}`);
}

// Regenerate job-registry.json from all job-config files
const registryRes = spawnSync("node", [
  join(STUDIO_ROOT, "scripts", "update-registry.mjs"), "--quiet",
], { cwd: STUDIO_ROOT, stdio: "inherit" });
if (registryRes.status !== 0) {
  console.warn("  ⚠  update-registry exited non-zero — registry may be stale.");
}

// Open footage folder (non-fatal, not in CI)
if (process.stdin.isTTY) {
  try {
    if (process.platform === "darwin")  execSync(`open ${JSON.stringify(paths.footage)}`);
    else if (process.platform === "win32") execSync(`explorer ${JSON.stringify(paths.footage)}`);
    else execSync(`xdg-open ${JSON.stringify(paths.footage)} 2>/dev/null || true`);
  } catch (_) { /* non-fatal */ }
}

const result = {
  ok: true,
  name,
  type: videoType,
  paths: {
    footage:    paths.footage,
    broll:      paths.broll,
    audio:      paths.audio,
    brief:      paths.brief,
    src:        paths.srcVideo,
    work:       paths.workPrep,
    out:        paths.outDir,
    jobConfig:  configPath,
  },
};

console.log("\nDrop your clip(s) into the footage folder, then run: npm run prep " + name);
console.log(JSON.stringify(result, null, 2));
