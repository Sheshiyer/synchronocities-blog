/**
 * Tests for new-video script — file/folder creation contract.
 */
import { strict as assert } from "assert";
import { test } from "node:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const root = resolve(new URL("..", import.meta.url).pathname);

function runNewVideo(name, type = "talking") {
  return spawnSync("node", [
    join(root, "scripts", "new-video.mjs"),
    name,
    "--type", type,
  ], { cwd: root, encoding: "utf8" });
}

function cleanup(name) {
  const paths = [
    join(root, "assets", "projects", name),
    join(root, "src", "videos", name),
    join(root, "work", name),
    join(root, "out", name),
  ];
  paths.forEach(p => { try { rmSync(p, { recursive: true, force: true }); } catch {} });
}

test("new-video: creates expected directories", () => {
  const name = "test-vid-" + Date.now();
  const res  = runNewVideo(name);
  assert.equal(res.status, 0, `Exit code should be 0, got ${res.status}\n${res.stderr}`);

  const expected = [
    join(root, "assets", "projects", name, "footage"),
    join(root, "assets", "projects", name, "broll"),
    join(root, "assets", "projects", name, "audio"),
    join(root, "src", "videos", name),
    join(root, "work", name, "prep"),
    join(root, "out", name),
  ];
  for (const dir of expected) {
    assert.ok(existsSync(dir), `Expected directory to exist: ${dir}`);
  }
  cleanup(name);
});

test("new-video: outputs valid JSON", () => {
  const name = "test-vid-json-" + Date.now();
  const res  = runNewVideo(name);
  const lines = res.stdout.split("\n");
  // Last JSON block
  const jsonStart = lines.findIndex(l => l.trim().startsWith("{"));
  assert.ok(jsonStart !== -1, "Should output JSON");
  const jsonStr = lines.slice(jsonStart).join("\n");
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.name, name);
  assert.ok(parsed.paths.footage, "paths.footage should be set");
  cleanup(name);
});

test("new-video: rejects invalid type", () => {
  const res = spawnSync("node", [
    join(root, "scripts", "new-video.mjs"),
    "any-name", "--type", "podcast",
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(res.status, 0, "Should fail on invalid type");
});
