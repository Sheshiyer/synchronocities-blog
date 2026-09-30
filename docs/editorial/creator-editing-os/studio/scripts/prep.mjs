#!/usr/bin/env node
/**
 * prep <name> [--fps N]
 *
 * Probes every clip in assets/projects/<name>/footage/, converts problem media,
 * and writes work/<name>/prep/PREP.md + a structured JSON summary.
 *
 * Conversion rules:
 *   - HDR → SDR tone-map via zscale+tonemap filter
 *   - VFR → CFR (detected via packet timing, not just avg vs r_frame_rate)
 *   - 4K → 1080p (portrait preserved: scale=-2:1080 not 1920:1080)
 *   - Audio is COPY-only — never re-encodes voice
 *
 * Failure rules:
 *   - If a conversion fails, the clip is marked HELD (not silently passed)
 *   - Existing work copies are validated by source MD5 fingerprint before reuse
 *   - HDR tonemap capability is detected; if filter unavailable, result is HELD
 *
 * Transcription: NOT auto-started. Options listed in PREP.md.
 *
 * Security: name validated and all paths containment-checked via project-assets.
 */
import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { createHash } from "node:crypto";
import { join, extname, basename } from "path";
import { spawnSync } from "child_process";
import { projectPaths, validateId, STUDIO_ROOT } from "./project-assets.mjs";

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const rawName = args[0];
if (!rawName) { console.error("Usage: npm run prep <video-name> [--fps N]"); process.exit(1); }

let name;
try { name = validateId(rawName); } catch (e) { console.error(`Error: ${e.message}`); process.exit(1); }

const fpsFlagIdx = args.indexOf("--fps");
const targetFps = fpsFlagIdx !== -1 ? parseInt(args[fpsFlagIdx + 1], 10) : 30;
if (isNaN(targetFps) || targetFps < 1 || targetFps > 120) {
  console.error("--fps must be a number between 1 and 120"); process.exit(1);
}

const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".avi", ".m4v", ".mts", ".ts"]);

// ─── Paths ────────────────────────────────────────────────────────────────────
let paths;
try { paths = projectPaths(name); } catch (e) { console.error(`Security check: ${e.message}`); process.exit(1); }

if (!existsSync(paths.footage)) {
  console.error(`Footage folder not found: ${paths.footage}`);
  console.error("Run first: npm run new-video " + name);
  process.exit(1);
}
mkdirSync(paths.workPrep, { recursive: true });

// ─── Locate ffprobe / ffmpeg ─────────────────────────────────────────────────
// Prefer `remotion ffprobe/ffmpeg` (uses Remotion's own managed binary download).
// Fall back to system ffprobe/ffmpeg.
const REMOTION_BIN = join(STUDIO_ROOT, "node_modules", ".bin", "remotion");

function runRemotionFfprobe(ffArgs) {
  if (existsSync(REMOTION_BIN)) {
    const res = spawnSync(REMOTION_BIN, ["ffprobe", ...ffArgs], { encoding: "utf8", stdio: "pipe" });
    if (res.status === 0 || res.stdout) return res;
  }
  return spawnSync("ffprobe", ffArgs, { encoding: "utf8", stdio: "pipe" });
}

function runRemotionFfmpeg(ffArgs) {
  if (existsSync(REMOTION_BIN)) {
    return spawnSync(REMOTION_BIN, ["ffmpeg", ...ffArgs], { encoding: "utf8", stdio: "pipe" });
  }
  return spawnSync("ffmpeg", ffArgs, { encoding: "utf8", stdio: "pipe" });
}

// Verify both binaries are available
const probeTest = runRemotionFfprobe(["-version"]);
const fmpgTest  = runRemotionFfmpeg(["-version"]);
if (probeTest.status !== 0 && probeTest.error) {
  console.error("ffprobe not available via remotion or system PATH. Install ffmpeg or run: npm install");
  process.exit(1);
}
if (fmpgTest.status !== 0 && fmpgTest.error) {
  console.error("ffmpeg not available via remotion or system PATH. Install ffmpeg or run: npm install");
  process.exit(1);
}

// ─── Detect if HDR tonemap filter is available ───────────────────────────────
function checkHdrTonemapCapability() {
  const res = runRemotionFfmpeg(["-filters"]);
  const out = (res.stdout || "") + (res.stderr || "");
  return out.includes("zscale") && out.includes("tonemap");
}
const HDR_TONEMAP_AVAILABLE = checkHdrTonemapCapability();

// ─── MD5 fingerprint of first 256KB ──────────────────────────────────────────
function fileFingerprint(filePath) {
  try {
    const buf = readFileSync(filePath);
    const sample = buf.slice(0, 262144);
    return createHash("md5").update(sample).digest("hex");
  } catch { return null; }
}

// ─── Probe a file ─────────────────────────────────────────────────────────────
function probe(filePath) {
  const res = runRemotionFfprobe([
    "-v", "quiet", "-print_format", "json",
    "-show_streams", "-show_format", "-show_packets",
    filePath,
  ]);
  if (res.status !== 0 && !res.stdout) return null;
  try { return JSON.parse(res.stdout); } catch { return null; }
}

// ─── Accurate VFR detection via packet timing ────────────────────────────────
function detectVfr(info) {
  // Strategy: examine the first 60 video packet durations for variance
  const packets = (info.packets || []).filter(p => p.codec_type === "video");
  if (packets.length < 4) {
    // Fallback: compare r_frame_rate vs avg_frame_rate with tighter tolerance
    const vs = info.streams?.find(s => s.codec_type === "video");
    if (!vs) return false;
    const parseRate = (r) => { const [n, d] = (r || "0/1").split("/").map(Number); return d ? n / d : 0; };
    const avg = parseRate(vs.avg_frame_rate);
    const rFps = parseRate(vs.r_frame_rate);
    return avg > 0 && rFps > 0 && Math.abs(avg - rFps) / Math.max(avg, rFps) > 0.01;
  }
  const durations = packets.slice(0, 60).map(p => parseFloat(p.duration_time || "0")).filter(d => d > 0);
  if (durations.length < 2) return false;
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = durations.reduce((a, b) => a + (b - mean) ** 2, 0) / durations.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation
  return cv > 0.02; // > 2% variation = VFR
}

// ─── Aspect-preserving scale expression ──────────────────────────────────────
function scaleFilter(width, height, maxDim = 1080) {
  // Portrait (height > width): scale so that height = maxDim, width calculated
  // Landscape (width >= height): scale so that width = 1920, height calculated
  // Always use -2 to ensure divisibility by 2 (required by libx264)
  if (height > width) {
    // Portrait: keep height at 1080, width proportional
    return `scale=-2:${maxDim}:flags=lanczos`;
  } else {
    // Landscape/square: keep width at 1920, height proportional
    return `scale=1920:-2:flags=lanczos`;
  }
}

// ─── Main clip loop ───────────────────────────────────────────────────────────
const clips = readdirSync(paths.footage)
  .filter(f => VIDEO_EXTS.has(extname(f).toLowerCase()))
  .map(f => join(paths.footage, f));

if (clips.length === 0) {
  console.log("No video files found in", paths.footage);
  console.log("Drop your clip(s) there, then run: npm run prep " + name);
  process.exit(0);
}

const report = [];
const summary = { clips: [], problems: [], converted: [], held: [] };

for (const clip of clips) {
  const base = basename(clip);
  const info = probe(clip);
  if (!info) {
    report.push(`## ${base}\nCould not probe — skipping.\n`);
    summary.problems.push({ clip: base, reason: "probe failed" });
    continue;
  }

  const videoStream = info.streams?.find(s => s.codec_type === "video");
  const audioStream = info.streams?.find(s => s.codec_type === "audio");

  if (!videoStream) {
    report.push(`## ${base}\nNo video stream found — skipping.\n`);
    summary.problems.push({ clip: base, reason: "no video stream" });
    continue;
  }

  const codec   = videoStream.codec_name;
  const width   = videoStream.width;
  const height  = videoStream.height;

  // ── FPS ──
  const parseRate = (r) => { const [n, d] = (r || "0/1").split("/").map(Number); return d ? n / d : 0; };
  const fps = parseRate(videoStream.avg_frame_rate) || parseRate(videoStream.r_frame_rate);

  // ── HDR detection ──
  const ct = (videoStream.color_transfer || "").toLowerCase();
  const cs = (videoStream.color_space   || "").toLowerCase();
  const cp = (videoStream.color_primaries || "").toLowerCase();
  const isHDR = ["smpte2084", "arib-std-b67", "bt2020", "smpte428"].some(t =>
    ct.includes(t) || cs.includes(t) || cp.includes(t)
  );

  // ── VFR detection (packet-based) ──
  const isVFR = detectVfr(info);

  // ── 4K detection ──
  const is4K = width >= 3840 || height >= 2160;

  // ── HEVC / unsupported codec flag ──
  const isHevc = ["hevc", "h265"].includes(codec.toLowerCase());

  const needs = [];
  if (isHDR)  needs.push("HDR→SDR");
  if (isVFR)  needs.push("VFR→CFR");
  if (is4K)   needs.push("4K→1080p");

  // Source fingerprint for cache invalidation
  const srcFingerprint = fileFingerprint(clip);
  const outName = `${basename(clip, extname(clip))}_work.mp4`;
  const workCopy = join(paths.workPrep, outName);
  const fingerprintFile = `${workCopy}.fp`;

  let workCopyStatus = "no-conversion-needed";
  let workCopyPath = null;
  let conversionError = null;

  if (needs.length > 0) {
    // Check if existing work copy was from same source fingerprint
    let reuseExisting = false;
    if (existsSync(workCopy) && existsSync(fingerprintFile)) {
      const storedFp = readFileSync(fingerprintFile, "utf8").trim();
      if (storedFp === srcFingerprint) {
        reuseExisting = true;
        console.log(`  ✓ Reusing cached conversion: ${outName} (fingerprint matches)`);
      } else {
        console.log(`  ⚠ Source changed (fingerprint mismatch) — reconverting: ${base}`);
      }
    }

    if (!reuseExisting) {
      // Determine conversion filter chain
      const vfArgs = isVFR ? ["-vsync", String(targetFps), "-r", String(targetFps)] : [];
      let vfFilter = null;

      if (isHDR && HDR_TONEMAP_AVAILABLE) {
        vfFilter = [
          "zscale=t=linear:npl=100",
          "format=gbrpf32le",
          "zscale=p=bt709",
          "tonemap=tonemap=hable:desat=0",
          "zscale=t=bt709:m=bt709:r=tv",
          "format=yuv420p",
        ].join(",");
        if (is4K) vfFilter += "," + scaleFilter(width, height, 1080);
      } else if (isHDR && !HDR_TONEMAP_AVAILABLE) {
        console.warn(`  ⚠ HDR tonemap filters unavailable for ${base} — marking as HELD.`);
        summary.held.push({ clip: base, reason: "HDR tonemap filter unavailable (zscale/tonemap missing)" });
        workCopyStatus = "held-hdr-no-filter";
        report.push([
          `## ${base}`,
          `- Codec: ${codec}  Resolution: ${width}×${height}  FPS: ${fps.toFixed(2)}`,
          `- HDR: **YES — HELD** (tonemap filter unavailable; install ffmpeg with libzimg for HDR conversion)`,
          `- VFR: ${isVFR ? "**YES**" : "no"}  4K: ${is4K ? "**YES**" : "no"}  HEVC: ${isHevc ? "yes" : "no"}`,
          `- Audio: ${audioStream ? audioStream.codec_name : "none"}`,
          `- ⛔ Work copy NOT produced — requires manual SDR conversion before use.`,
          "",
        ].join("\n"));
        summary.clips.push({ clip: base, codec, width, height, fps: +fps.toFixed(2), isHDR, isVFR, is4K, workCopy: null, status: workCopyStatus });
        continue;
      } else if (is4K) {
        vfFilter = scaleFilter(width, height, 1080);
      }

      const cmdArgs = [
        "-y",
        "-i", clip,
        ...(vfFilter ? ["-vf", vfFilter] : []),
        ...vfArgs,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-c:a", "copy",
        workCopy,
      ];
      console.log(`  Converting: ${base} → ${outName}`);
      const res = runRemotionFfmpeg(cmdArgs);
      if (res.status === 0) {
        if (srcFingerprint) writeFileSync(fingerprintFile, srcFingerprint, "utf8");
        summary.converted.push({ from: base, to: outName, reasons: needs });
        workCopyStatus = "converted";
        workCopyPath = workCopy;
      } else {
        conversionError = (res.stderr || "").slice(-400);
        console.error(`  ✗ Conversion failed for ${base}: ${conversionError}`);
        summary.held.push({ clip: base, reason: "conversion failed", error: conversionError });
        workCopyStatus = "held-conversion-failed";
        report.push([
          `## ${base}`,
          `- Codec: ${codec}  Resolution: ${width}×${height}  FPS: ${fps.toFixed(2)}`,
          `- HDR: ${isHDR ? "**YES — CONVERSION FAILED**" : "no"}  VFR: ${isVFR ? "**YES — CONVERSION FAILED**" : "no"}  4K: ${is4K ? "**YES — CONVERSION FAILED**" : "no"}`,
          `- Audio: ${audioStream ? audioStream.codec_name : "none"}`,
          `- ⛔ Work copy NOT produced — conversion failed. Check ffmpeg output above.`,
          "",
        ].join("\n"));
        summary.clips.push({ clip: base, codec, width, height, fps: +fps.toFixed(2), isHDR, isVFR, is4K, workCopy: null, status: workCopyStatus });
        continue;
      }
    } else {
      workCopyPath = workCopy;
      workCopyStatus = "reused";
    }
  }

  report.push([
    `## ${base}`,
    `- Codec: ${codec}  Resolution: ${width}×${height}  FPS: ${fps.toFixed(2)}`,
    `- HDR: ${isHDR ? "**YES — converted to SDR**" : "no"}  VFR: ${isVFR ? `**YES — fixed to ${targetFps}fps CFR**` : "no"}  4K: ${is4K ? "**YES — scaled to 1080p (aspect-preserved)**" : "no"}`,
    `- HEVC: ${isHevc ? "yes (note: may need H.264 work copy for editing)" : "no"}`,
    `- Audio: ${audioStream ? audioStream.codec_name : "none"}`,
    workCopyPath
      ? `- Working copy: \`${workCopyPath}\``
      : `- No conversion needed — use original directly.`,
    "",
  ].join("\n"));

  summary.clips.push({
    clip: base,
    codec,
    width,
    height,
    fps: +fps.toFixed(2),
    isHDR,
    isVFR,
    is4K,
    isHevc,
    workCopy: workCopyPath,
    status: workCopyStatus,
    srcFingerprint,
  });
}

// ─── Write PREP.md ────────────────────────────────────────────────────────────
const mdContent = [
  `# PREP — ${name}`,
  `Generated: ${new Date().toISOString()}`,
  `Target CFR: ${targetFps}fps`,
  "",
  "## Summary",
  `- ${clips.length} clip(s) found`,
  `- ${summary.converted.length} converted successfully`,
  `- ${summary.held.length} held (need manual attention)`,
  summary.problems.length > 0
    ? `- ⚠ Probe problems: ${summary.problems.map(p => p.clip).join(", ")}`
    : "- No probe problems",
  "",
  "## Transcription",
  "Transcription is NOT run automatically.",
  "Options:",
  "1. **Plan A (SRT)**: Export captions from CapCut, DaVinci Resolve or YouTube Studio as an .srt file.",
  "   Drop it in the footage folder. Script alignment must be done manually with explicit timestamps.",
  "2. **Plan B (Whisper)**: Install `npx @remotion/install-whisper-cpp` — confirm download size before running.",
  "   Automated transcription does NOT guarantee word accuracy; always verify against your script.",
  "",
  "## HDR Tonemap Capability",
  `- zscale+tonemap filter available: ${HDR_TONEMAP_AVAILABLE ? "YES" : "NO (install ffmpeg with libzimg for HDR→SDR conversion)"}`,
  "",
  "## Clips",
  ...report,
].join("\n");

writeFileSync(paths.prepMd, mdContent);
console.log(`\n✓ PREP.md written: ${paths.prepMd}`);
console.log(JSON.stringify({ ok: summary.held.length === 0, name, prepMd: paths.prepMd, summary }, null, 2));
