#!/usr/bin/env node
/**
 * render-final <name> [--format 9:16|16:9|both] [--version <hash>]
 *
 * Renders the named job's composition (not a hard-coded Sample).
 * Requires a matching composition ID in src/Root.tsx:
 *   - 9:16  → "<Name>Vertical"   (e.g. "MyVideoVertical")
 *   - 16:9  → "<Name>Horizontal" (e.g. "MyVideoHorizontal")
 *   - "sample-vertical"  → SampleVertical  (explicitly synthetic only)
 *   - "sample-horizontal" → SampleHorizontal
 *
 * Audio pipeline (per CLAUDE.md audio standard):
 *   1. Render picture muted.
 *   2. Measure voice.wav loudness (loudnorm measurement only, null output — no encode).
 *   3. Apply single fixed gain to reach ~-14 LUFS target.
 *   4. Mux voice + picture in one AAC encode at 256k.
 *   5. On mux failure: FAIL with error — never copy muted picture as a "final".
 *
 * Version contract:
 *   --version <hash>  passed by controller to pin a specific approved version.
 *   No self-granted human approval; the script only reads what the controller passes.
 *
 * Security: name validated via project-assets; all paths containment-checked.
 *
 * Structured JSON summary printed last.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";
import { projectPaths, validateId, STUDIO_ROOT } from "./project-assets.mjs";

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const rawName = args[0];
if (!rawName) {
  console.error("Usage: npm run render-final <name> [--format=9:16|16:9|both] [--version=<hash>]");
  process.exit(1);
}

let name;
try { name = validateId(rawName); } catch (e) { console.error(`Error: ${e.message}`); process.exit(1); }

const fmtArg = (args.find(a => a.startsWith("--format=")) ?? "").replace("--format=", "") || "9:16";
const version = (args.find(a => a.startsWith("--version=")) ?? "").replace("--version=", "") || null;

let paths;
try { paths = projectPaths(name); } catch (e) { console.error(`Security: ${e.message}`); process.exit(1); }

mkdirSync(paths.outDir, { recursive: true });

// ─── Remotion CLI ─────────────────────────────────────────────────────────────
const remotion = join(STUDIO_ROOT, "node_modules", ".bin", "remotion");
if (!existsSync(remotion)) { console.error("remotion CLI not found — run: npm install"); process.exit(1); }

// ─── ffmpeg/ffprobe (prefer remotion-managed binary) ─────────────────────────
function spawnFfmpeg(ffArgs) {
  return spawnSync(remotion, ["ffmpeg", ...ffArgs], { cwd: STUDIO_ROOT, stdio: "pipe", encoding: "utf8" });
}
function spawnFfprobe(ffArgs) {
  return spawnSync(remotion, ["ffprobe", ...ffArgs], { cwd: STUDIO_ROOT, stdio: "pipe", encoding: "utf8" });
}

// Verify ffmpeg reachable
const ffmpegTest = spawnFfmpeg(["-version"]);
const FFMPEG_OK = ffmpegTest.status === 0;

// ─── Composition ID resolver ──────────────────────────────────────────────────
function compositionId(jobName, format) {
  const isSampleV = jobName === "sample-vertical";
  const isSampleH = jobName === "sample-horizontal";
  if (isSampleV) return "SampleVertical";
  if (isSampleH) return "SampleHorizontal";
  // Named job: capitalise each word segment and append orientation
  const pascal = jobName
    .split(/[-_]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  return format === "16:9" ? `${pascal}Horizontal` : `${pascal}Vertical`;
}

// ─── Loudness measurement (loudnorm measurement ONLY — null output) ────────────
function measureLoudness(voiceWavPath) {
  if (!FFMPEG_OK) return null;
  const res = spawnFfmpeg([
    "-i", voiceWavPath,
    "-af", "loudnorm=print_format=json",
    "-f", "null",
    "-",
  ]);
  // loudnorm outputs JSON to stderr
  const stderr = res.stderr || "";
  const match = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parseFloat(parsed.input_i);
  } catch { return null; }
}

// ─── Compute gain required to reach target LUFS ──────────────────────────────
function computeGainDb(measuredLufs, targetLufs = -14) {
  if (measuredLufs === null || !isFinite(measuredLufs)) return 0;
  return Math.min(12, Math.max(-20, targetLufs - measuredLufs)); // clamp to safe range
}

// ─── Render formats ───────────────────────────────────────────────────────────
const formats = fmtArg === "both" ? ["9:16", "16:9"] : [fmtArg];

console.log("⚠️  Before rendering, close heavy apps: browser tabs, music players, video editors.");
if (process.stdin.isTTY) {
  console.log("   Press ENTER when ready...\n");
  await new Promise(res => process.stdin.once("data", res));
}

if (version) {
  console.log(`   Version pin: ${version}\n`);
}

const results = [];

for (const format of formats) {
  const compId   = compositionId(name, format);
  const slug     = format.replace(":", "x");
  const picFile  = join(paths.outDir, `${name}-${slug}-picture.mp4`);
  const finalFile = join(paths.outDir, `${name}-${slug}-final.mp4`);

  console.log(`\n── Rendering ${compId} (picture-only, muted) ──`);

  // Positional render: entry-point composition-id output
  const renderArgs = [
    "render",
    "src/Root.tsx",       // entry-point (positional)
    compId,               // composition-id (positional)
    picFile,              // output (positional)
    "--muted",
    "--overwrite",
    "--scale", "2",       // 2× for high-quality downscale path
  ];

  const renderRes = spawnSync(remotion, renderArgs, {
    cwd: STUDIO_ROOT,
    stdio: "inherit",
  });

  if (renderRes.status !== 0) {
    console.error(`✗ Render failed for ${compId} (exit ${renderRes.status})`);
    results.push({ format, compId, ok: false, error: `render failed, exit ${renderRes.status}` });
    continue;
  }

  if (!existsSync(picFile)) {
    console.error(`✗ Render claimed success but output file missing: ${picFile}`);
    results.push({ format, compId, ok: false, error: "output file missing after render" });
    continue;
  }

  // ── Downscale rendered 2× picture to final resolution ──
  const scaledFile = join(paths.outDir, `${name}-${slug}-scaled.mp4`);
  const targetW = format === "16:9" ? 1920 : 1080;
  const targetH = format === "16:9" ? 1080 : 1920;
  const scaleRes = spawnFfmpeg([
    "-y", "-i", picFile,
    "-vf", `scale=${targetW}:${targetH}:flags=lanczos`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-an",
    scaledFile,
  ]);
  if (scaleRes.status !== 0) {
    const scaleErr = (scaleRes.stderr || "").slice(-400);
    console.error(`✗ 2× downscale failed (exit ${scaleRes.status}): ${scaleErr}`);
    results.push({ format, compId, ok: false, error: `downscale failed: ${scaleErr}`, picFile });
    continue;
  }
  const picForMux = scaledFile;

  // ── Audio mux ──
  const voiceWav = paths.voiceWav;
  const sfxCues  = paths.sfxCues;

  if (!FFMPEG_OK) {
    console.error("✗ ffmpeg unavailable — cannot mux audio. A registered source with audio requires ffmpeg.");
    results.push({ format, compId, ok: false, error: "ffmpeg not available; install ffmpeg to mux audio" });
    continue;
  }

  if (!existsSync(voiceWav)) {
    console.error(`✗ voice.wav not found at ${voiceWav} — cannot produce final with audio.`);
    console.error("  A registered source with audio requires a matching voice.wav. Run ingest-draft first.");
    results.push({ format, compId, ok: false, error: `missing voice.wav: ${voiceWav}` });
    continue;
  }

  // ── Measure voice loudness (null-output, measurement only) ──
  console.log("  Measuring voice loudness (null output)...");
  const measuredLufs = measureLoudness(voiceWav);
  const gainDb = computeGainDb(measuredLufs);
  console.log(`  Measured: ${measuredLufs !== null ? measuredLufs.toFixed(1) + " LUFS" : "unknown"} → applying ${gainDb >= 0 ? "+" : ""}${gainDb.toFixed(1)} dB fixed gain`);

  // ── One AAC encode: picture + voice (fixed gain, no dynamic processing) ──
  const gainFilter = gainDb !== 0 ? `volume=${gainDb.toFixed(2)}dB` : "anull";
  const mixArgs = [
    "-y",
    "-i", picForMux,
    "-i", voiceWav,
    "-filter_complex", `[1:a]${gainFilter}[a]`,
    "-map", "0:v",
    "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "256k",
    finalFile,
  ];

  console.log("  Muxing audio (one AAC encode)...");
  const mixRes = spawnFfmpeg(mixArgs);

  if (mixRes.status !== 0) {
    const errMsg = (mixRes.stderr || "").slice(-400);
    console.error(`✗ Audio mux failed: ${errMsg}`);
    // HARD FAILURE — do not silently copy muted picture
    results.push({ format, compId, ok: false, error: `audio mux failed: ${errMsg}`, picFile });
    continue;
  }

  if (!existsSync(finalFile)) {
    results.push({ format, compId, ok: false, error: "final file missing after mux", picFile });
    continue;
  }

  // ── Copy SFX-CUES.txt stub if not present ──
  if (!existsSync(sfxCues)) {
    writeFileSync(sfxCues,
      "# SFX-CUES.txt\n# Format: index · timecode · file · description · level_dB\n"
    );
  }
  copyFileSync(sfxCues, join(paths.outDir, "SFX-CUES.txt"));

  // ── Probe final output with ffprobe ──
  const probeRes = spawnFfprobe([
    "-v", "quiet", "-print_format", "json",
    "-show_streams", "-show_format",
    finalFile,
  ]);
  let probeData = {};
  try { probeData = JSON.parse(probeRes.stdout || "{}"); } catch {}
  const vs = (probeData.streams || []).find(s => s.codec_type === "video") || {};
  const as = (probeData.streams || []).find(s => s.codec_type === "audio") || {};
  const duration  = parseFloat(probeData.format?.duration || "0");
  const hasAudio  = !!as.codec_name;
  const finalDims = `${vs.width ?? "?"}×${vs.height ?? "?"}`;

  console.log(`✓ Final: ${finalFile}`);
  console.log(`  Duration: ${duration.toFixed(2)}s  Dimensions: ${finalDims}  Has audio: ${hasAudio}`);
  console.log(`  Voice gain applied: ${gainDb >= 0 ? "+" : ""}${gainDb.toFixed(1)} dB  (measured ${measuredLufs?.toFixed(1) ?? "?"} LUFS)`);

  results.push({
    format,
    compId,
    ok: true,
    finalFile,
    picFile,
    audio: hasAudio,
    duration,
    dimensions: finalDims,
    measuredLufs,
    gainApplied: gainDb,
    version: version || null,
  });
}

const allOk = results.length > 0 && results.every(r => r.ok);
console.log("\n" + JSON.stringify({ ok: allOk, name, version: version || null, results }, null, 2));
if (!allOk) process.exit(1);
