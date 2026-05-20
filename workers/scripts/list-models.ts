#!/usr/bin/env bun
/**
 * One-shot: list all NVIDIA NIM models available to the configured key,
 * grouped by capability (chat / embedding / rerank / vision / other).
 *
 * Used during task #1 (discovery) to select the model trio that will
 * back the production endpoints. Reads NVIDIA_API_KEY from process env
 * — for convenience, source it from .dev.vars first:
 *
 *   export $(grep -v '^#' .dev.vars | xargs)  &&  bun scripts/list-models.ts
 */

const KEY = process.env.NVIDIA_API_KEY;
const BASE = process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';

if (!KEY) {
  console.error('NVIDIA_API_KEY not set. Copy .dev.vars.example → .dev.vars, fill in your key, then:');
  console.error('  export $(grep -v "^#" .dev.vars | xargs)  &&  bun scripts/list-models.ts');
  process.exit(1);
}

interface ModelEntry {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

interface ListResponse {
  object: string;
  data: ModelEntry[];
}

const res = await fetch(`${BASE}/models`, {
  headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
});

if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(2);
}

const body = (await res.json()) as ListResponse;
const models = body.data ?? [];

// Heuristic categorization by name. NIM's /v1/models doesn't return a
// capability tag, so we infer from the model id.
function categorize(id: string): string {
  const l = id.toLowerCase();
  if (l.includes('embed') || l.includes('embedqa')) return 'embedding';
  if (l.includes('rerank')) return 'rerank';
  if (l.includes('vision') || l.includes('vl-') || l.includes('-vl')) return 'vision';
  if (l.includes('whisper') || l.includes('riva') || l.includes('-asr')) return 'speech';
  if (l.includes('safety') || l.includes('guard') || l.includes('shield')) return 'safety';
  return 'chat';
}

const groups = new Map<string, ModelEntry[]>();
for (const m of models) {
  const cat = categorize(m.id);
  if (!groups.has(cat)) groups.set(cat, []);
  groups.get(cat)!.push(m);
}

console.log(`\nNVIDIA NIM catalog — ${models.length} models available to this key\n`);

for (const [cat, ms] of [...groups.entries()].sort()) {
  console.log(`── ${cat.toUpperCase()} (${ms.length}) ──`);
  for (const m of ms.sort((a, b) => a.id.localeCompare(b.id))) {
    const owner = m.owned_by ? ` [${m.owned_by}]` : '';
    console.log(`  ${m.id}${owner}`);
  }
  console.log();
}

console.log('Selection guidance:');
console.log('  embedding → pick highest MTEB-retrieval scorer with ≥4096-d output');
console.log('  chat      → pick instruction-tuned model with native structured-output support');
console.log('  rerank    → pick smallest sufficient — latency matters more than ceiling here');
