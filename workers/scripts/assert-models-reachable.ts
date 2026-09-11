/**
 * assert-models-reachable.ts — fail loudly when a model the Worker is
 * CONFIGURED to use is no longer reachable.
 *
 * Why this exists
 * ---------------
 * Between 2026-07-22 and 2026-09-11 this NIM tier fell from 39 reachable models
 * to 12, taking two of the five configured models with it:
 *
 *   nvidia/nv-embedqa-e5-v5          embeddings   EOL 2026-08-25, HTTP 410
 *   nvidia/nemotron-mini-4b-instruct rerank+label went unreachable
 *
 * probe-catalog-daily.yml recorded both faithfully, every single day, in
 * .reachable-models.txt. Nothing compared that list against what the Worker was
 * actually configured to call, so /search returned 500 for ~2.5 weeks and rerank
 * silently degraded to its fail-open neutral score. The data was there; the
 * assertion was missing.
 *
 * What it does
 * ------------
 * Parses NIM_*_MODEL from wrangler.toml, skips any surface routed to another
 * provider (EMBED_BASE_URL / RERANK_BASE_URL — those models are NOT in the NIM
 * catalog and must not be checked against it), and asserts every remaining model
 * appears in .reachable-models.txt.
 *
 * Usage:
 *   bun scripts/assert-models-reachable.ts            # exit 1 on any miss
 *   bun scripts/assert-models-reachable.ts --warn     # report, always exit 0
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const HERE = import.meta.dir;
const WRANGLER = join(HERE, '..', 'wrangler.toml');
const REACHABLE = join(HERE, '..', '.reachable-models.txt');

/** Which var each surface reads, and which override moves it off NIM. */
const SURFACES: Array<{ surface: string; varName: string; overriddenBy?: string }> = [
  { surface: 'embeddings',    varName: 'NIM_EMBED_MODEL',         overriddenBy: 'EMBED_BASE_URL' },
  { surface: 'chat / RAG',    varName: 'NIM_CHAT_MODEL' },
  { surface: 'rerank',        varName: 'NIM_RERANK_MODEL',        overriddenBy: 'RERANK_BASE_URL' },
  { surface: 'cluster label', varName: 'NIM_CLUSTER_LABEL_MODEL', overriddenBy: 'RERANK_BASE_URL' },
  { surface: 'safety',        varName: 'NIM_SAFETY_MODEL' },
];

/** Read `KEY = "value"` from wrangler.toml, ignoring commented lines. */
function tomlValue(toml: string, key: string): string | undefined {
  for (const line of toml.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    const m = trimmed.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`));
    if (m) return m[1];
  }
  return undefined;
}

const warnOnly = process.argv.includes('--warn');

const [toml, reachableRaw] = await Promise.all([
  readFile(WRANGLER, 'utf-8'),
  readFile(REACHABLE, 'utf-8'),
]);

const reachable = new Set(reachableRaw.split('\n').map((l) => l.trim()).filter(Boolean));
if (reachable.size === 0) {
  console.error('✘ .reachable-models.txt is empty — refusing to assert against it.');
  console.error('  Run `bun scripts/probe-catalog.ts` first, or the daily workflow.');
  process.exit(warnOnly ? 0 : 1);
}

console.error(`▸ ${reachable.size} models in the last NIM reachability snapshot\n`);

const missing: Array<{ surface: string; varName: string; model: string }> = [];
let checked = 0;

for (const { surface, varName, overriddenBy } of SURFACES) {
  const model = tomlValue(toml, varName);
  if (!model) {
    console.error(`  ?  ${surface.padEnd(14)} ${varName} not found in wrangler.toml`);
    continue;
  }
  if (overriddenBy && tomlValue(toml, overriddenBy)) {
    console.error(`  ·  ${surface.padEnd(14)} ${model}`);
    console.error(`     └─ routed off NIM via ${overriddenBy} — not checked against the NIM catalog`);
    continue;
  }
  checked++;
  if (reachable.has(model)) {
    console.error(`  ✓  ${surface.padEnd(14)} ${model}`);
  } else {
    console.error(`  ✘  ${surface.padEnd(14)} ${model}   NOT REACHABLE`);
    missing.push({ surface, varName, model });
  }
}

console.error(`\n▸ ${checked} NIM-routed model(s) checked, ${missing.length} unreachable.`);

if (missing.length === 0) process.exit(0);

for (const m of missing) {
  console.error(
    `::error::${m.surface}: ${m.model} (${m.varName}) is no longer in the NIM ` +
      `reachability snapshot. Pick a replacement, or route the surface to another ` +
      `provider via the upstream override in src/lib/nim.ts.`,
  );
}
console.error(
  '\nNote: a reachable replacement is not automatically a valid one.\n' +
    '  • embeddings must fit the Vectorize dimension cap (1536) — use EMBED_DIMENSIONS\n' +
    '    to truncate a Matryoshka model, and remember a model swap needs a full reindex.\n' +
    '  • rerank needs an INSTRUCT model; reasoning models emit chain-of-thought into\n' +
    '    `content` and silently corrupt parseScores().',
);
process.exit(warnOnly ? 0 : 1);
