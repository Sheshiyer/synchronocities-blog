#!/usr/bin/env node
/**
 * refs — reads references/references.md and makes a contact sheet for every
 * timestamp range into work/refs/, plus work/refs/INDEX.md.
 *
 * Reports clips without notes and notes without clips.
 * Uses ffmpeg to extract frames from reference clips at the timestamps noted.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve, extname } from "path";
import { execSync, spawnSync } from "child_process";

const root   = resolve(new URL("..", import.meta.url).pathname);
const refDir = join(root, "references");
const refMd  = join(refDir, "references.md");
const outDir = join(root, "work", "refs");
mkdirSync(outDir, { recursive: true });

if (!existsSync(refMd)) {
  console.error(`references/references.md not found — create it with Prompt 5.`);
  process.exit(0);
}

// Parse references.md
const content = readFileSync(refMd, "utf8");
const sections = [];
let current = null;
for (const line of content.split("\n")) {
  if (line.startsWith("## ")) {
    if (current) sections.push(current);
    current = { clip: line.slice(3).trim(), notes: [] };
  } else if (current && line.startsWith("- ")) {
    const match = line.match(/^- (\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)\s*[–-]\s*(.+)/);
    if (match) current.notes.push({ ts: match[1], text: match[2] });
  }
}
if (current) sections.push(current);

const FFMPEG = (() => {
  try { execSync("which ffmpeg", { stdio: "pipe" }); return "ffmpeg"; } catch {}
  return null;
})();

function tsToSec(ts) {
  const parts = ts.split(":").map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}

const problems = [];
const index = [];

for (const sec of sections) {
  const clipPath = join(refDir, sec.clip);
  const clipExists = existsSync(clipPath);
  if (!clipExists) problems.push(`No clip file: ${sec.clip}`);
  if (sec.notes.length === 0) problems.push(`No timestamped notes: ${sec.clip}`);

  const sheetDir = join(outDir, sec.clip.replace(/\.[^.]+$/, ""));
  mkdirSync(sheetDir, { recursive: true });
  const frameFiles = [];

  if (clipExists && FFMPEG) {
    for (const note of sec.notes) {
      const startTs = note.ts.split("-")[0];
      const sec2 = tsToSec(startTs);
      const outFile = join(sheetDir, `${note.ts.replace(/[:\-]/g, "_")}.jpg`);
      const res = spawnSync(FFMPEG, [
        "-y", "-ss", String(sec2), "-i", clipPath,
        "-frames:v", "1", "-q:v", "4", outFile,
      ], { stdio: "pipe" });
      if (res.status === 0) frameFiles.push(outFile);
    }
  }

  index.push({ clip: sec.clip, exists: clipExists, notes: sec.notes.length, frames: frameFiles.length });
}

// Write INDEX.md
const indexLines = [
  "# Reference Index",
  "",
  "| Clip | File | Notes | Frames extracted |",
  "|------|------|-------|-----------------|",
  ...index.map(i => `| ${i.clip} | ${i.exists ? "✓" : "✗ MISSING"} | ${i.notes} | ${i.frames} |`),
  "",
];
if (problems.length > 0) {
  indexLines.push("## Problems");
  problems.forEach(p => indexLines.push(`- ${p}`));
}
writeFileSync(join(outDir, "INDEX.md"), indexLines.join("\n"));

console.log(`✓ INDEX.md written to: ${outDir}`);
console.log(JSON.stringify({ ok: problems.length === 0, index, problems }, null, 2));
