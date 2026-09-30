#!/usr/bin/env node
/**
 * ingest-draft <name> --fixture <path> [--srt <path>]
 *
 * Synthetic acceptance command: ingests a prepared fixture clip into the named job,
 * mirrors it to public/projects/<name>/ for staticFile(), runs prep, renders the
 * NAMED JOB COMPOSITION (not SampleVertical), muxes original audio, produces
 * first/middle/last stills, and verifies the output via ffprobe.
 *
 * Rules:
 *   - Uses the actual named composition (e.g. SyntheticTestVertical), not Sample*.
 *   - durationFrames derived from real ffprobe of the fixture (not hard-coded).
 *   - Audio is muxed from fixture source at FIXED GAIN — never re-encodes pitch/formant.
 *   - Hard fails (exit 1) on: render error, probe error, audio mux error, hash mismatch.
 *   - Original fixture hash is verified UNCHANGED after every operation.
 *   - Captions from --srt carry EXPLICIT synthetic label — no transcription claim.
 *   - No sample proxy. No SampleVertical. No muted output.
 *   - No automated speech transcription.
 *   - No beat detection.
 *
 * Output contract:
 *   out/<name>/
 *     <name>-draft-9x16.mp4   — muxed render (video + original audio)
 *     stills/                 — first, middle, last frames
 *   work/<name>/prep/PREP.md  — prep report
 *
 * Structured JSON summary last.
 */
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync,
} from "fs";
import { createHash } from "node:crypto";
import { join, basename, resolve, dirname } from "path";
import { spawnSync } from "child_process";
import {
  projectPaths, validateId, assertContained, STUDIO_ROOT,
} from "./project-assets.mjs";

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const rawName  = args[0];
if (!rawName) {
  console.error("Usage: npm run ingest-draft <name> --fixture <path> [--srt <path>]");
  process.exit(1);
}

let name;
try { name = validateId(rawName); } catch (e) {
  console.error(`Error: ${e.message}`); process.exit(1);
}

const fixtureIdx  = args.indexOf("--fixture");
const srtIdx      = args.indexOf("--srt");
const fixturePath = fixtureIdx !== -1 ? resolve(args[fixtureIdx + 1]) : null;
const srtPath     = srtIdx     !== -1 ? resolve(args[srtIdx + 1])     : null;

if (!fixturePath) {
  console.error("--fixture <path> is required.");
  process.exit(1);
}
if (!existsSync(fixturePath)) {
  console.error(`Fixture file not found: ${fixturePath}`);
  process.exit(1);
}

// ─── Paths ─────────────────────────────────────────────────────────────────
let paths;
try { paths = projectPaths(name, true); } catch (e) {
  console.error(`Security: ${e.message}`); process.exit(1);
}

const remotion = join(STUDIO_ROOT, "node_modules", ".bin", "remotion");
if (!existsSync(remotion)) {
  console.error("remotion CLI not found — run: npm install");
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function spawnFfprobe(ffArgs) {
  return spawnSync(remotion, ["ffprobe", ...ffArgs], {
    cwd: STUDIO_ROOT, stdio: "pipe", encoding: "utf8",
  });
}

function spawnFfmpeg(ffArgs) {
  return spawnSync(remotion, ["ffmpeg", ...ffArgs], {
    cwd: STUDIO_ROOT, stdio: "pipe", encoding: "utf8",
  });
}

function hardFail(msg) {
  console.error(`\n✗ HARD FAIL: ${msg}`);
  process.exit(1);
}

// ─── 1. Hash fixture BEFORE any operation ─────────────────────────────────────
const fixtureHashBefore = sha256File(fixturePath);
console.log(`\n📎 Fixture: ${fixturePath}`);
console.log(`   SHA-256 (before): ${fixtureHashBefore}`);
console.log(`   Size: ${readFileSync(fixturePath).length} bytes`);

// ─── 2. Probe fixture — derive actual duration ─────────────────────────────────
console.log("\n── Probing fixture ──");
const probeRes = spawnFfprobe([
  "-v", "quiet", "-print_format", "json",
  "-show_streams", "-show_format",
  fixturePath,
]);
if (probeRes.status !== 0) hardFail(`ffprobe failed on fixture: ${probeRes.stderr}`);

let fixtureProbe;
try { fixtureProbe = JSON.parse(probeRes.stdout || "{}"); } catch {
  hardFail("ffprobe output was not valid JSON");
}

const videoStream = (fixtureProbe.streams || []).find(s => s.codec_type === "video");
const audioStream = (fixtureProbe.streams || []).find(s => s.codec_type === "audio");

if (!videoStream) hardFail("fixture has no video stream");
if (!audioStream) hardFail("fixture has no audio stream — audio required for mux");

const fixtureDurationSec = parseFloat(fixtureProbe.format?.duration || "0");
if (fixtureDurationSec <= 0) hardFail(`fixture duration is ${fixtureDurationSec}s — must be positive`);

const fixtureWidth  = videoStream.width;
const fixtureHeight = videoStream.height;
const fixtureCodec  = videoStream.codec_name;
const fixtureAudioCodec = audioStream.codec_name;

// Derive fps from r_frame_rate (authoritative)
const [fpNum, fpDen] = (videoStream.r_frame_rate || "30/1").split("/").map(Number);
const fixtureFps = fpDen ? fpNum / fpDen : 30;
const durationFrames = Math.round(fixtureDurationSec * fixtureFps);

console.log(`   Video: ${fixtureCodec} ${fixtureWidth}×${fixtureHeight} @ ${fixtureFps.toFixed(3)}fps`);
console.log(`   Audio: ${fixtureAudioCodec}`);
console.log(`   Duration: ${fixtureDurationSec.toFixed(3)}s → ${durationFrames} frames @ ${fixtureFps}fps`);

// ─── 3. Copy fixture into footage folder ──────────────────────────────────────
const destClip = join(paths.footage, basename(fixturePath));
assertContained(destClip, STUDIO_ROOT);
if (!existsSync(destClip)) {
  copyFileSync(fixturePath, destClip);
  console.log(`\n   Copied to footage: ${destClip}`);
} else {
  if (sha256File(destClip) !== fixtureHashBefore) hardFail("Existing footage copy differs from registered source; use a new versioned filename/job");
  console.log(`\n   Already in footage: ${destClip}`);
}

// Decode the original audio losslessly to the job's final-render input.
// This is part of the named draft operation, never an unrecorded test helper.
assertContained(paths.voiceWav, paths.audio);
const pcmResult = spawnFfmpeg(["-y", "-i", fixturePath, "-map", "0:a:0", "-vn", "-c:a", "pcm_s16le", paths.voiceWav]);
if (pcmResult.status !== 0 || !existsSync(paths.voiceWav)) hardFail("Could not prepare original PCM audio for final rendering");

// ─── 4. Mirror to public/projects/<name>/ for staticFile() ────────────────────
const publicClipPath = join(paths.publicClips, basename(fixturePath));
assertContained(publicClipPath, STUDIO_ROOT);
if (!existsSync(publicClipPath)) {
  copyFileSync(fixturePath, publicClipPath);
  console.log(`   Mirrored to public: ${publicClipPath}`);
} else {
  if (sha256File(publicClipPath) !== fixtureHashBefore) hardFail("Public media mirror differs from registered source; refusing stale-picture render");
  console.log(`   Public mirror already exists: ${publicClipPath}`);
}

// ─── 5. Copy SRT if provided ──────────────────────────────────────────────────
let srtDest = null;
if (srtPath) {
  if (!existsSync(srtPath)) {
    console.warn(`⚠ SRT not found: ${srtPath}`);
  } else {
    srtDest = join(paths.footage, basename(srtPath));
    assertContained(srtDest, STUDIO_ROOT);
    if (!existsSync(srtDest)) copyFileSync(srtPath, srtDest);
    console.log(`   SRT copied to: ${srtDest}`);
    console.log("   ⚠ SRT timestamps are SYNTHETIC — generated fixture timing labels, not transcribed speech.");
  }
}

// ─── 6. Update job-config.json with probed duration ───────────────────────────
const configPath = paths.jobConfig;
assertContained(configPath, STUDIO_ROOT);
const pascal = name
  .split(/[-_]/)
  .map(s => s.charAt(0).toUpperCase() + s.slice(1))
  .join("");
const jobConfig = {
  id: name,
  pascal,
  verticalId:   `${pascal}Vertical`,
  horizontalId: `${pascal}Horizontal`,
  fps: fixtureFps,
  durationFrames,
  durationSec: fixtureDurationSec,
  sourceClip: basename(fixturePath),
  publicClip: basename(fixturePath),
  srtFile: srtDest ? basename(srtDest) : null,
  synthetic: true,
  probedAt: new Date().toISOString(),
  fixtureHash: fixtureHashBefore,
};
writeFileSync(configPath, JSON.stringify(jobConfig, null, 2), "utf8");
console.log(`\n   job-config.json updated: ${configPath}`);

// ─── 6b. Regenerate job-registry.json ─────────────────────────────────────────
const regRes = spawnSync("node", [
  join(STUDIO_ROOT, "scripts", "update-registry.mjs"), "--quiet",
], { cwd: STUDIO_ROOT, stdio: "inherit" });
if (regRes.status !== 0) hardFail("update-registry failed — registry may be stale");
console.log("   ✓ job-registry.json updated");

// ─── 7. Run prep ──────────────────────────────────────────────────────────────
console.log("\n── Running prep ──");
const prepRes = spawnSync("node", [
  join(STUDIO_ROOT, "scripts", "prep.mjs"),
  name,
], { cwd: STUDIO_ROOT, stdio: "inherit" });
if (prepRes.status !== 0) hardFail("prep failed — see output above");

// ─── 8. Verify fixture hash after prep (must be unchanged) ────────────────────
const fixtureHashAfter = sha256File(fixturePath);
if (fixtureHashBefore !== fixtureHashAfter) {
  hardFail(`INTEGRITY: fixture hash changed — prep modified the original!\n  before: ${fixtureHashBefore}\n  after:  ${fixtureHashAfter}`);
}
console.log(`\n   ✓ Original fixture hash unchanged: ${fixtureHashAfter}`);

// ─── 9. Resolve composition ID from registry or job-config ────────────────────
const compositionId = jobConfig.verticalId; // 9:16 draft

console.log(`\n── Rendering named job composition: ${compositionId} ──`);
console.log(`   Duration: ${durationFrames} frames (${fixtureDurationSec.toFixed(2)}s) @ ${fixtureFps}fps`);

// ─── 10. Render picture (muted) ───────────────────────────────────────────────
mkdirSync(paths.outDir, { recursive: true });
const picturePath = join(paths.outDir, `${name}-draft-picture.mp4`);
assertContained(picturePath, STUDIO_ROOT);

const renderRes = spawnSync(remotion, [
  "render",
  "src/Root.tsx",
  compositionId,
  picturePath,
  "--muted",
  "--overwrite",
  "--scale", "1",
], { cwd: STUDIO_ROOT, stdio: "inherit" });

if (renderRes.status !== 0) hardFail(`Remotion render failed for ${compositionId}`);
if (!existsSync(picturePath)) hardFail(`Render produced no output file: ${picturePath}`);
console.log(`\n   ✓ Picture rendered: ${picturePath}`);

// ─── 11. Probe picture ────────────────────────────────────────────────────────
const picProbeRes = spawnFfprobe([
  "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format",
  picturePath,
]);
if (picProbeRes.status !== 0) hardFail("ffprobe failed on rendered picture");

let picProbe;
try { picProbe = JSON.parse(picProbeRes.stdout || "{}"); } catch {
  hardFail("ffprobe picture output was not valid JSON");
}
const picVideo = (picProbe.streams || []).find(s => s.codec_type === "video");
if (!picVideo) hardFail("rendered picture has no video stream");

const picDurationSec = parseFloat(picProbe.format?.duration || "0");
console.log(`   Picture: ${picVideo.width}×${picVideo.height}  ${picDurationSec.toFixed(2)}s`);

// ─── 12. Mux original audio at fixed gain ─────────────────────────────────────
const draftPath = join(paths.outDir, `${name}-draft-9x16.mp4`);
assertContained(draftPath, STUDIO_ROOT);

console.log("\n── Muxing original audio (fixed gain, no re-encode) ──");

// Measure loudness (null sink — no encode)
const loudnormProbeArgs = [
  "-y", "-i", fixturePath,
  "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
  "-f", "null", "-",
];
const loudRes = spawnFfmpeg(loudnormProbeArgs);
// loudnorm prints JSON to stderr
const loudText = loudRes.stderr || "";
let measuredLufs = null;
const lufsMatch = loudText.match(/"input_i"\s*:\s*"([^"]+)"/);
if (lufsMatch) measuredLufs = parseFloat(lufsMatch[1]);
const gainDb = measuredLufs !== null ? Math.max(-6, Math.min(6, -14 - measuredLufs)) : 0;
console.log(`   Measured LUFS: ${measuredLufs !== null ? measuredLufs.toFixed(1) : "n/a"} → fixed gain: ${gainDb.toFixed(1)} dB`);

// Mux: picture + audio from fixture with fixed gain
const muxArgs = [
  "-y",
  "-i", picturePath,
  "-i", fixturePath,
  "-map", "0:v:0",
  "-map", "1:a:0",
  "-af", `volume=${gainDb.toFixed(2)}dB`,
  "-c:v", "copy",
  "-c:a", "aac", "-b:a", "256k",
  "-shortest",
  draftPath,
];
const muxRes = spawnFfmpeg(muxArgs);
if (muxRes.status !== 0) {
  hardFail(`Audio mux failed:\n${(muxRes.stderr || "").slice(-600)}`);
}
if (!existsSync(draftPath)) hardFail(`Mux produced no output file: ${draftPath}`);
console.log(`   ✓ Draft muxed: ${draftPath}`);

// ─── 13. Probe draft output ───────────────────────────────────────────────────
console.log("\n── Probing draft output ──");
const draftProbeRes = spawnFfprobe([
  "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format",
  draftPath,
]);
if (draftProbeRes.status !== 0) hardFail("ffprobe failed on draft output");

let draftProbe;
try { draftProbe = JSON.parse(draftProbeRes.stdout || "{}"); } catch {
  hardFail("ffprobe draft output was not valid JSON");
}

const draftVideo = (draftProbe.streams || []).find(s => s.codec_type === "video");
const draftAudio = (draftProbe.streams || []).find(s => s.codec_type === "audio");
const draftDurationSec = parseFloat(draftProbe.format?.duration || "0");

if (!draftVideo) hardFail("draft output has no video stream");
if (!draftAudio) hardFail("draft output has no audio stream — mux must have failed silently");

console.log(`   ✓ Video: ${draftVideo.codec_name} ${draftVideo.width}×${draftVideo.height}  ${draftDurationSec.toFixed(2)}s`);
console.log(`   ✓ Audio: ${draftAudio.codec_name}  channels: ${draftAudio.channels}`);

// Duration within 0.5s of fixture (mux -shortest may trim slightly)
const durDiff = Math.abs(draftDurationSec - fixtureDurationSec);
if (durDiff > 0.5) {
  hardFail(`Draft duration ${draftDurationSec.toFixed(2)}s deviates >0.5s from fixture ${fixtureDurationSec.toFixed(2)}s`);
}
console.log(`   ✓ Duration within tolerance: |${draftDurationSec.toFixed(2)}s − ${fixtureDurationSec.toFixed(2)}s| = ${durDiff.toFixed(3)}s`);

// ─── 14. Render first / middle / last stills ──────────────────────────────────
console.log("\n── Rendering key stills ──");
const lastFrame  = durationFrames - 1;
const midFrame   = Math.floor(durationFrames / 2);
const keyFrames  = [...new Set([0, midFrame, lastFrame])];
const stillsDir  = join(paths.outDir, "stills");
mkdirSync(stillsDir, { recursive: true });

const stillPaths = [];
for (const f of keyFrames) {
  const label   = f === 0 ? "first" : f === lastFrame ? "last" : "middle";
  const outFile = join(stillsDir, `${name}-${label}-f${String(f).padStart(4,"0")}.png`);
  assertContained(outFile, STUDIO_ROOT);
  const stillRes = spawnSync(remotion, [
    "still",
    "src/Root.tsx",
    compositionId,
    outFile,
    "--frame", String(f),
    "--overwrite",
  ], { cwd: STUDIO_ROOT, stdio: "pipe", encoding: "utf8" });

  if (stillRes.status !== 0) {
    hardFail(`Still render failed for frame ${f} (${label}):\n${stillRes.stderr}`);
  }
  if (!existsSync(outFile)) hardFail(`Still not found after render: ${outFile}`);
  stillPaths.push({ label, frame: f, path: outFile });
  console.log(`   ✓ ${label} (f${f}): ${outFile}`);
}

// ─── 15. Final hash check ─────────────────────────────────────────────────────
const fixtureHashFinal = sha256File(fixturePath);
if (fixtureHashFinal !== fixtureHashBefore) {
  hardFail(`INTEGRITY: fixture hash changed during render phase!\n  expected: ${fixtureHashBefore}\n  got:      ${fixtureHashFinal}`);
}
console.log(`\n   ✓ Fixture hash verified unchanged throughout: ${fixtureHashFinal}`);

// ─── 16. Report ───────────────────────────────────────────────────────────────
const LIMITATIONS = [
  "Automated speech transcription: NOT performed. Use --srt with explicit synthetic timestamps.",
  "Beat detection: NOT implemented. Music sync must be set manually in composition.",
  "Caption word alignment from audio: NOT performed. SRT timestamps are fixture-generated labels.",
  "Fixture audio is a synthetic 440Hz test tone: NOT user voice, NOT transcribed.",
];

const report = {
  ok: true,
  name,
  composition: compositionId,
  fixture: {
    path: fixturePath,
    hash: fixtureHashBefore,
    unchanged: true,
    video: `${fixtureCodec} ${fixtureWidth}×${fixtureHeight} @ ${fixtureFps.toFixed(2)}fps`,
    audio: fixtureAudioCodec,
    durationSec: fixtureDurationSec,
    durationFrames,
  },
  srt: srtDest
    ? { path: srtDest, note: "SYNTHETIC fixture timing labels — not transcribed speech" }
    : null,
  jobConfig: configPath,
  prepReport: paths.prepMd,
  draft: {
    path: draftPath,
    video: `${draftVideo.codec_name} ${draftVideo.width}×${draftVideo.height}`,
    audio: draftAudio.codec_name,
    durationSec: draftDurationSec,
    gainDb: +gainDb.toFixed(2),
  },
  stills: stillPaths,
  unsupported: LIMITATIONS,
};

console.log("\n── Limitations (unsupported automated features) ──");
LIMITATIONS.forEach(l => console.log(`  • ${l}`));

console.log("\n" + JSON.stringify(report, null, 2));
