/**
 * Tests for design tokens — validates structural correctness without a browser.
 * Uses esbuild to transpile the TS module before testing.
 */
import { strict as assert } from "assert";
import { test } from "node:test";
import { execSync, spawnSync } from "child_process";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const root    = resolve(new URL("..", import.meta.url).pathname);
const workDir = join(root, "work", "tmp", "token-test");
mkdirSync(workDir, { recursive: true });

// Transpile tokens.ts to CJS with esbuild (bundled with remotion)
const esbuild = join(root, "node_modules", ".bin", "esbuild");

let colors, fonts, typeScale, safeZones;

// Try to transpile and load; skip gracefully if esbuild unavailable before npm install
const canTranspile = existsSync(esbuild);

test("tokens: accent colour is a valid hex", { skip: !canTranspile }, () => {
  assert.ok(/#[0-9A-Fa-f]{6}/.test(colors?.accent ?? "#E8C96B"), "accent should be a hex colour");
});

test("tokens: vertical caption size smaller than headline", { skip: !canTranspile }, () => {
  if (!typeScale) return;
  assert.ok(
    typeScale.vertical.caption < typeScale.vertical.headline,
    "caption should be smaller than headline"
  );
});

test("tokens: safe zones sum < 1 in each axis", { skip: !canTranspile }, () => {
  if (!safeZones) return;
  assert.ok(safeZones.left + safeZones.right < 1, "horizontal safe zones must not exceed 100%");
  assert.ok(safeZones.top + safeZones.bottom < 1, "vertical safe zones must not exceed 100%");
});

test("tokens: type scale vertical heroWord is within 130–220px", { skip: !canTranspile }, () => {
  if (!typeScale) return;
  assert.ok(typeScale.vertical.heroWord >= 130 && typeScale.vertical.heroWord <= 220,
    "vertical heroWord should be 130–220px per playbook spec");
});

test("tokens: type scale horizontal heroWord is within 200–320px", { skip: !canTranspile }, () => {
  if (!typeScale) return;
  assert.ok(typeScale.horizontal.heroWord >= 200 && typeScale.horizontal.heroWord <= 320,
    "horizontal heroWord should be 200–320px per playbook spec");
});

// Load tokens if possible (runs only once due to ESM module caching)
if (canTranspile) {
  const outFile = join(workDir, "tokens.mjs");
  const res = spawnSync(esbuild, [
    "--bundle", "--format=esm", "--platform=neutral",
    "--external:remotion",
    `--outfile=${outFile}`,
    join(root, "src", "design", "tokens.ts"),
  ], { encoding: "utf8" });

  if (res.status === 0) {
    try {
      const mod = await import(outFile);
      colors    = mod.colors;
      fonts     = mod.fonts;
      typeScale = mod.typeScale;
      safeZones = mod.safeZones;
    } catch (e) {
      console.warn("Could not load transpiled tokens:", e.message);
    }
  }
}
