/**
 * Reachability gate — shared helper for any script that calls NIM models.
 *
 * Pre-flight check: before kicking off a full pass (corpus reindex, batch
 * expansion, eval sweep, RAG warmup), verify the configured model is in
 * the reachable-models snapshot. Catches catalog drift (model listed but
 * 404 on invoke) BEFORE we waste a full pass discovering it mid-run.
 *
 * Source of truth: workers/.reachable-models.txt — one model id per line,
 * written by workers/scripts/probe-catalog.ts. Refreshed daily by the
 * .github/workflows/probe-catalog-daily.yml cron.
 *
 * Usage:
 *
 *   import { requireReachability } from './lib/reachability';
 *
 *   // At the top of your full-pass script:
 *   requireReachability(env.NIM_CHAT_MODEL);
 *   requireReachability(env.NIM_EMBED_MODEL);
 *
 * Exit codes:
 *   0  ok
 *   2  model not reachable (or file missing) — script must not proceed
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Hours after which the reachability snapshot is considered stale. */
const MAX_AGE_HOURS = 48;

export interface ReachabilityCheck {
  ok: boolean;
  /** Hours since the snapshot was written. */
  ageHours: number | null;
  /** Why the check failed, if it did. */
  reason: string | null;
  /** Total reachable models in the snapshot. */
  totalReachable: number | null;
}

/** Path to .reachable-models.txt relative to repo root. */
function snapshotPath(): string {
  // Resolve repo root from this file: workers/scripts/lib/ → repo root
  const here = new URL('.', import.meta.url).pathname;
  return join(here, '..', '..', '.reachable-models.txt');
}

export function checkReachability(modelId: string): ReachabilityCheck {
  const path = snapshotPath();

  let stat;
  try {
    stat = statSync(path);
  } catch {
    return {
      ok: false,
      ageHours: null,
      totalReachable: null,
      reason: `Reachability snapshot missing: ${path}. Run \`bun workers/scripts/probe-catalog.ts\` first.`,
    };
  }

  const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      ok: false,
      ageHours,
      totalReachable: 0,
      reason: 'Reachability snapshot is empty. Probe may have failed.',
    };
  }

  const isReachable = lines.includes(modelId);
  if (!isReachable) {
    return {
      ok: false,
      ageHours,
      totalReachable: lines.length,
      reason: `Model '${modelId}' is NOT in the reachable-models snapshot (${lines.length} models reachable, probed ${ageHours.toFixed(1)}h ago). Either re-probe (\`bun workers/scripts/probe-catalog.ts\`) or pick a reachable model from workers/.catalog-probe.md.`,
    };
  }

  return { ok: true, ageHours, totalReachable: lines.length, reason: null };
}

/**
 * Throw-on-fail wrapper for use at the top of full-pass scripts. Exits
 * with code 2 if the model isn't reachable. Warns (but does not exit)
 * if the snapshot is older than MAX_AGE_HOURS.
 *
 * Pass { skipCheck: true } (or set --skip-reachability-check at the
 * caller level) to bypass — useful in CI for testing the script itself
 * without an up-to-date snapshot.
 */
export function requireReachability(
  modelId: string,
  opts: { skipCheck?: boolean; label?: string } = {},
): void {
  const label = opts.label ?? modelId;
  if (opts.skipCheck) {
    console.warn(`⚠️  reachability check SKIPPED for ${label}`);
    return;
  }

  const check = checkReachability(modelId);
  if (!check.ok) {
    console.error(`✗ ${label}: ${check.reason}`);
    process.exit(2);
  }

  const age = check.ageHours ?? 0;
  if (age > MAX_AGE_HOURS) {
    console.warn(
      `⚠️  ${label}: reachable, but snapshot is ${age.toFixed(1)}h old (>${MAX_AGE_HOURS}h). Consider re-probing.`,
    );
  } else {
    console.log(`✓ ${label}: reachable (snapshot ${age.toFixed(1)}h old, ${check.totalReachable} models tracked)`);
  }
}

/**
 * Filter a list of candidate models down to just the reachable ones.
 * Use in eval scripts that probe multiple models — avoids wasting time
 * on models that will 404.
 */
export function filterReachable(candidates: string[]): { reachable: string[]; skipped: string[] } {
  const path = snapshotPath();
  let lines: string[];
  try {
    lines = readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    console.warn(`⚠️  Reachability snapshot missing — returning all candidates unfiltered.`);
    return { reachable: candidates, skipped: [] };
  }
  const reachableSet = new Set(lines);
  const reachable: string[] = [];
  const skipped: string[] = [];
  for (const c of candidates) {
    if (reachableSet.has(c)) reachable.push(c);
    else skipped.push(c);
  }
  return { reachable, skipped };
}
