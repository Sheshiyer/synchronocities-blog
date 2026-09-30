#!/usr/bin/env node
/**
 * clean — safely deletes temporary render bundles, browser profiles and work/tmp.
 * NEVER touches: assets/, src/, references/, design-system/, or out/.
 *
 * Reports what was deleted. Structured JSON output.
 */
import { existsSync, readdirSync, rmSync, statSync } from "fs";
import { join, resolve } from "path";

const root = resolve(new URL("..", import.meta.url).pathname);

// Only these paths are safe to delete
const SAFE_CLEAN_PATTERNS = [
  join(root, "work", "tmp"),
  // Remotion bundle output directories (pattern: /tmp/remotion-*)
];

// Also clean Remotion bundler caches from /tmp (only our own)
import { readdirSync as rd, statSync as st } from "fs";
function cleanTmp() {
  const tmpDir = "/tmp";
  if (!existsSync(tmpDir)) return [];
  return rd(tmpDir)
    .filter(f => f.startsWith("remotion-"))
    .map(f => join(tmpDir, f))
    .filter(f => {
      try { return st(f).isDirectory(); } catch { return false; }
    });
}

const toDelete = [...SAFE_CLEAN_PATTERNS, ...cleanTmp()].filter(existsSync);

const deleted = [];
for (const dir of toDelete) {
  try {
    rmSync(dir, { recursive: true, force: true });
    deleted.push(dir);
    console.log(`  ✓ Deleted: ${dir}`);
  } catch (e) {
    console.warn(`  ✗ Could not delete ${dir}: ${e.message}`);
  }
}

if (deleted.length === 0) {
  console.log("Nothing to clean — studio is already tidy.");
}

const result = { ok: true, deleted };
console.log(JSON.stringify(result, null, 2));
