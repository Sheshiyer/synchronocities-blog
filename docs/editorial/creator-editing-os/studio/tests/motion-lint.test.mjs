/**
 * Tests for the motion-lint script.
 * Validates that the linter correctly detects and reports violations.
 */
import { strict as assert } from "assert";
import { test } from "node:test";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const root    = resolve(new URL("..", import.meta.url).pathname);
const tmpDir  = join(root, "work", "tmp", "test-motion-lint");
const lintBin = join(root, "scripts", "motion-lint.mjs");

// Setup / teardown
function writeTmpFile(name, content) {
  mkdirSync(join(tmpDir, "src"), { recursive: true });
  const file = join(tmpDir, "src", name);
  writeFileSync(file, content);
  return file;
}

function runLint(dir) {
  return spawnSync("node", [lintBin, `--srcDir=${dir}/src`, "--json"], { encoding: "utf8" });
}

test("motion-lint: passes on clean code", () => {
  const dir = join(tmpDir, "clean");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "ok.tsx"), [
    'import { interpolate } from "remotion";',
    'const x = interpolate(frame, [0, dur.medium], [0, 1]);',
    "const opacity = spring({ frame, fps, config: springPresets.smooth });",
  ].join("\n"));
  const res = runLint(dir);
  const out = JSON.parse(res.stdout || '{"violations":[]}');
  assert.equal(out.violations.length, 0, "Expected 0 violations in clean code");
  rmSync(dir, { recursive: true, force: true });
});

test("motion-lint: detects Math.random()", () => {
  const dir = join(tmpDir, "random");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "bad.tsx"), "const noise = Math.random();");
  const res = runLint(dir);
  const out = JSON.parse(res.stdout || '{"violations":[]}');
  const hit = out.violations.some(v => v.rule === "no-math-random");
  assert.ok(hit, "Should detect Math.random()");
  rmSync(dir, { recursive: true, force: true });
});

test("motion-lint: detects will-change", () => {
  const dir = join(tmpDir, "willchange");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "bad.tsx"), "const s = { willChange: 'transform' };");
  const res = runLint(dir);
  const out = JSON.parse(res.stdout || '{"violations":[]}');
  const hit = out.violations.some(v => v.rule === "no-will-change");
  assert.ok(hit, "Should detect willChange:");
  rmSync(dir, { recursive: true, force: true });
});

test("motion-lint: allows // motion-ok on Easing.linear", () => {
  const dir = join(tmpDir, "motion-ok");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "ok.tsx"), "const e = Easing.linear; // motion-ok");
  const res = runLint(dir);
  const out = JSON.parse(res.stdout || '{"violations":[]}');
  const hit = out.violations.some(v => v.rule === "no-linear-easing");
  assert.ok(!hit, "Easing.linear with // motion-ok should NOT trigger violation");
  rmSync(dir, { recursive: true, force: true });
});

// Cleanup root tmp dir after all tests
process.on("exit", () => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});
