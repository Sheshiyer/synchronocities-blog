#!/usr/bin/env node
/**
 * motion-lint — enforces motion discipline across src/
 * Fails on:
 *   - Linear easing not marked // motion-ok
 *   - CSS transition or animation properties
 *   - Math.random() (non-deterministic renders)
 *   - will-change property
 *   - Duration values typed directly (numbers) instead of from motion.ts
 *
 * Output: structured JSON when --json flag is set.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const RULES = [
  {
    id: "no-linear-easing",
    pattern: /Easing\.linear(?!.*\/\/ motion-ok)/,
    message: "Linear easing detected without // motion-ok comment",
  },
  {
    id: "no-css-transition",
    pattern: /transition\s*:\s*['"`][^'"`]*\d+(ms|s)/,
    message: "CSS transition with duration — use Remotion spring() or interpolate() instead",
  },
  {
    id: "no-css-animation",
    pattern: /animation\s*:\s*['"`][^'"`]+['"`]/,
    message: "CSS animation — use Remotion interpolate() instead",
  },
  {
    id: "no-math-random",
    pattern: /Math\.random\(\)/,
    message: "Math.random() breaks deterministic rendering — seed with frame number instead",
  },
  {
    id: "no-will-change",
    pattern: /willChange\s*:/,
    message: "will-change must not be set (Remotion manages compositing layers)",
  },
  {
    id: "no-hardcoded-duration",
    pattern: /durationInFrames\s*:\s*(?!dur\.)(\d{2,})/,
    message: "Hard-coded durationInFrames — import from motion.ts instead (or mark // motion-ok)",
  },
];

function walkTs(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory() && !["node_modules", "dist", "work", "out"].includes(e.name)) {
      files.push(...walkTs(full));
    } else if (e.isFile() && [".ts", ".tsx"].includes(extname(e.name))) {
      files.push(full);
    }
  }
  return files;
}

// Accept --srcDir=<path> for testing with temp directories
const srcDirArg = process.argv.find(a => a.startsWith("--srcDir="));
const srcDir = srcDirArg
  ? srcDirArg.replace("--srcDir=", "")
  : new URL("../src", import.meta.url).pathname;
const files  = walkTs(srcDir);

const violations = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        violations.push({ file, line: i + 1, rule: rule.id, message: rule.message, source: line.trim() });
      }
    }
  });
}

const useJson = process.argv.includes("--json");

if (useJson) {
  console.log(JSON.stringify({ violations, ok: violations.length === 0 }, null, 2));
} else {
  if (violations.length === 0) {
    console.log("✓ motion-lint: 0 violations");
  } else {
    console.error(`✗ motion-lint: ${violations.length} violation(s)\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
      console.error(`  ${v.message}`);
      console.error(`  → ${v.source}\n`);
    }
    process.exit(1);
  }
}
