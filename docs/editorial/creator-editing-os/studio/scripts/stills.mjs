#!/usr/bin/env node
/**
 * stills <CompositionId> [--every=N | --frames=a,b,c] [--key]
 *
 * Renders individual still frames and tiles them into a labelled contact sheet.
 * --key  renders first frame (0), last frame, and every Nth frame (default N=15).
 *
 * Uses correct Remotion positional syntax:
 *   remotion still <entry-point> <composition-id> <output>  --frame N
 *
 * Contact sheet tiled with ffmpeg tile filter; gracefully handles single-image case.
 *
 * Structured JSON output last.
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { STUDIO_ROOT } from "./project-assets.mjs";

const args   = process.argv.slice(2);
const compId = args[0];
if (!compId) {
  console.error("Usage: npm run stills <CompositionId> [--every=N | --frames=a,b,c] [--key]");
  process.exit(1);
}

const remotion = join(STUDIO_ROOT, "node_modules", ".bin", "remotion");
if (!existsSync(remotion)) { console.error("remotion CLI not found — run: npm install"); process.exit(1); }

// ─── Query composition duration from remotion ─────────────────────────────────
function getCompositionDuration() {
  const res = spawnSync(remotion, [
    "compositions", "src/Root.tsx", "--quiet"
  ], { cwd: STUDIO_ROOT, encoding: "utf8", stdio: "pipe" });
  if (res.status !== 0) return 150; // safe fallback
  for (const line of (res.stdout || "").split("\n")) {
    if (line.includes(compId)) {
      const m = line.match(/(\d+)\s*frames/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return 150;
}

const totalFrames = getCompositionDuration();

// ─── Parse frame spec ─────────────────────────────────────────────────────────
let frames = [];
const everyArg  = args.find(a => a.startsWith("--every="));
const framesArg = args.find(a => a.startsWith("--frames="));
const keyMode   = args.includes("--key");

if (framesArg) {
  frames = framesArg.replace("--frames=", "").split(",").map(Number).filter(n => !isNaN(n));
} else {
  const every = everyArg ? parseInt(everyArg.replace("--every=", ""), 10) : 15;
  for (let f = 0; f < totalFrames; f += every) frames.push(f);
  if (keyMode || !everyArg) {
    // Always include first and last
    if (!frames.includes(0)) frames.unshift(0);
    const last = totalFrames - 1;
    if (!frames.includes(last)) frames.push(last);
  }
}
frames = [...new Set(frames)].sort((a, b) => a - b);

const outDir = join(STUDIO_ROOT, "work", "stills", compId, Date.now().toString());
mkdirSync(outDir, { recursive: true });

console.log(`Rendering ${frames.length} stills for ${compId} (total ${totalFrames} frames)...`);

const rendered = [];
for (const f of frames) {
  const outFile = join(outDir, `frame-${String(f).padStart(4, "0")}.png`);
  // Correct Remotion positional syntax: entry-point composition-id output --frame N
  const res = spawnSync(remotion, [
    "still",
    "src/Root.tsx",   // entry-point (positional)
    compId,           // composition-id (positional)
    outFile,          // output (positional)
    "--frame", String(f),
    "--overwrite",
    "--scale", "1",
  ], { cwd: STUDIO_ROOT, stdio: "pipe", encoding: "utf8" });

  if (res.status === 0 && existsSync(outFile)) {
    console.log(`  ✓ frame ${f}`);
    rendered.push(outFile);
  } else {
    const err = (res.stderr || "").slice(-200);
    console.error(`  ✗ frame ${f}: ${err}`);
  }
}

// ─── Contact sheet via ffmpeg tile ────────────────────────────────────────────
const ffmpegTest = spawnSync("ffmpeg", ["-version"], {
  stdio: "pipe", encoding: "utf8"
});
const FFMPEG_OK = ffmpegTest.status === 0;

let contactSheet = null;
if (FFMPEG_OK && rendered.length > 0) {
  const sheet = join(outDir, `contact-sheet-${compId}.jpg`);
  const tileW = Math.max(1, Math.ceil(Math.sqrt(rendered.length)));
  const tileH = Math.max(1, Math.ceil(rendered.length / tileW));

  let res;
  if (rendered.length === 1) {
    // Single image: just convert — no tile filter needed
    // -update 1 required for single-image JPEG output
    res = spawnSync("ffmpeg", [
      "-y", "-i", rendered[0],
      "-frames:v", "1", "-update", "1",
      "-q:v", "3",
      sheet,
    ], { cwd: STUDIO_ROOT, stdio: "pipe", encoding: "utf8" });
  } else {
    const inputs = rendered.flatMap(f => ["-i", f]);
    // -frames:v 1 -update 1 required for tile filter → JPEG output
    res = spawnSync("ffmpeg", [
      "-y",
      ...inputs,
      "-filter_complex", `tile=${tileW}x${tileH}`,
      "-frames:v", "1", "-update", "1",
      "-q:v", "3",
      sheet,
    ], { cwd: STUDIO_ROOT, stdio: "pipe", encoding: "utf8" });
  }

  if (res.status === 0 && existsSync(sheet)) {
    contactSheet = sheet;
    console.log(`\n✓ Contact sheet: ${sheet}`);
  } else {
    const err = (res.stderr || "").slice(-200);
    console.warn(`  ⚠ Contact sheet failed: ${err}`);
  }
}

const result = {
  ok: rendered.length > 0,
  composition: compId,
  totalFrames,
  requestedFrames: frames,
  rendered,
  contactSheet,
  outDir,
};
console.log(JSON.stringify(result, null, 2));
