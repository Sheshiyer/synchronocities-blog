#!/usr/bin/env node
// update-registry: regenerates src/job-registry.json from assets/projects/{name}/job-config.json
import { readdirSync, existsSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { projectPaths, assertContained, validateId } from "./project-assets.mjs";

const STUDIO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const PROJECTS_DIR = join(STUDIO_ROOT, "assets", "projects");
const OUT_PATH     = join(STUDIO_ROOT, "src", "job-registry.json");

const quiet = process.argv.includes("--quiet");
function log(...args) { if (!quiet) console.log(...args); }

const entries = [];
function captionWords(path) {
  if (!existsSync(path)) throw new Error(`Supplied caption file missing: ${path}`);
  const clock = (value) => value.split(/[:,.]/).map(Number).reduce((t, n, i) => t + n * [3600, 60, 1, 0.001][i], 0);
  const words = [];
  for (const block of readFileSync(path, "utf8").replace(/\r/g, "").trim().split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const index = lines.findIndex((line) => line.includes(" --> "));
    if (index < 0) throw new Error("Malformed SRT cue");
    const match = lines[index].match(/^(\d{2}:\d{2}:\d{2}[,.]\d{3}) --> (\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!match) throw new Error("Malformed SRT timestamp");
    const start = clock(match[1]), end = clock(match[2]);
    const text = lines.slice(index + 1).join(" ").trim().split(/\s+/).filter(Boolean);
    if (!(end > start) || !text.length) throw new Error("Invalid SRT cue interval/text");
    text.forEach((word, i) => words.push({ word, startSec: start + (end - start) * i / text.length, endSec: start + (end - start) * (i + 1) / text.length }));
  }
  return words;
}
let dirs;
try { dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }); } catch { dirs = []; }

for (const dirent of dirs) {
  if (!dirent.isDirectory()) continue;
  const configPath = join(PROJECTS_DIR, dirent.name, "job-config.json");
  if (!existsSync(configPath)) continue;
  let cfg;
  try { cfg = JSON.parse(readFileSync(configPath, "utf8")); } catch (e) {
    console.warn("  skipping " + dirent.name + ": " + e.message); continue;
  }
  if (!cfg.id || !cfg.pascal) {
    console.warn("  skipping " + dirent.name + ": missing id or pascal"); continue;
  }
  validateId(cfg.id);
  if (cfg.id !== dirent.name) throw new Error("Job configuration ID must match its folder");
  const paths = projectPaths(cfg.id);
  let captions = [];
  if (cfg.srtFile) {
    if (/[\\/]|\.\./.test(cfg.srtFile)) throw new Error("Caption file must belong to the job footage folder");
    const captionPath = join(paths.footage, cfg.srtFile);
    assertContained(captionPath, paths.footage);
    captions = captionWords(captionPath);
  }
  entries.push({
    id:             cfg.id,
    pascal:         cfg.pascal,
    verticalId:     cfg.verticalId   ?? cfg.pascal + "Vertical",
    horizontalId:   cfg.horizontalId ?? cfg.pascal + "Horizontal",
    durationFrames: cfg.durationFrames ?? null,
    fps:            cfg.fps           ?? 30,
    sourceClip:     cfg.sourceClip    ?? null,
    publicClip:     cfg.publicClip    ?? null,
    srtFile:        cfg.srtFile       ?? null,
    synthetic:      cfg.synthetic     ?? false,
    createdAt:      cfg.createdAt     ?? null,
    captions,
    captionTimingMethod: "Supplied SRT cue timing; words divided evenly within each cue, not observed word alignment",
  });
}

entries.sort((a, b) => {
  if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt);
  if (a.createdAt) return -1;
  if (b.createdAt) return 1;
  return a.id.localeCompare(b.id);
});

const registry = {};
for (const entry of entries) registry[entry.id] = entry;
const tempPath = OUT_PATH + ".tmp-" + process.pid;
writeFileSync(tempPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
renameSync(tempPath, OUT_PATH);
log("  job-registry.json updated (" + entries.length + " job(s)): " + OUT_PATH);

export {};
