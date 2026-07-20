#!/usr/bin/env bun
/**
 * Pre-flight probe of every model in the NVIDIA NIM catalog.
 *
 * Fixes the "model in catalog but 404 on invoke" gotcha we hit during the
 * trio tuning eval (`nvidia/nv-embedqa-mistral-7b-v2` showed in /v1/models
 * but returned NIM 404 when actually called).
 *
 * For each catalog entry, this script:
 *   1. Classifies by name heuristic (kind + modalities + context window estimate)
 *   2. Probes reachability with a 1-token text input via the deployed Worker
 *   3. Captures latency + output dims (for embeds) + actual error if any
 *   4. Ranks each kind by a kind-appropriate score
 *
 * Outputs:
 *   workers/.catalog-probe.json   — full data, machine-readable
 *   workers/.catalog-probe.md     — human table per kind
 *   workers/.reachable-models.txt — one model id per line, just the reachable ones
 *
 * Usage:
 *   bun workers/scripts/probe-catalog.ts                 # all kinds
 *   bun workers/scripts/probe-catalog.ts --kind=chat     # only chat models
 *   bun workers/scripts/probe-catalog.ts --concurrency=8 # tune fan-out (default 5)
 *   bun workers/scripts/probe-catalog.ts --skip-probe    # classify only, no NIM calls
 *   bun workers/scripts/probe-catalog.ts --local         # against localhost:8787
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const LOCAL = args.has('--local');
const SKIP_PROBE = args.has('--skip-probe');
const KIND_ARG = [...args].find((a) => a.startsWith('--kind='))?.split('=')[1];
const CONC_ARG = [...args].find((a) => a.startsWith('--concurrency='))?.split('=')[1];
const CONCURRENCY = CONC_ARG ? parseInt(CONC_ARG, 10) : 5;

const BASE_URL = LOCAL
  ? 'http://localhost:8787'
  : 'https://synchronocities-ai.sheshnarayan-iyer.workers.dev';

// /test/probe-one is admin-gated (ISSUE-02) — fail fast without the key.
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
if (!ADMIN_API_KEY && !SKIP_PROBE) {
  console.error('✗ ADMIN_API_KEY env var required. The Worker auth-gates /test/* (X-Admin-Key header). Export it and retry.');
  process.exit(2);
}
const ADMIN_HEADERS: Record<string, string> = ADMIN_API_KEY ? { 'X-Admin-Key': ADMIN_API_KEY } : {};

const REPO_ROOT = new URL('../..', import.meta.url).pathname;

// ─────────────────────────────────────────────────────────────────────────
// Classification by name heuristics
// ─────────────────────────────────────────────────────────────────────────

type Kind =
  | 'chat'        // text-in, text-out instruction-tuned chat
  | 'embed'       // text-in, vector-out
  | 'rerank'      // (query, passages) → scores. Catalog has none today
  | 'vision'      // text+image-in, text-out
  | 'multimodal'  // multiple input modalities, text-out (omni, vl etc)
  | 'speech'      // audio in or out (ASR/TTS/translate)
  | 'safety'      // text-in, classification-out (guard/shield)
  | 'reward'      // text-in, score-out (judge models)
  | 'code'        // chat specialized for code
  | 'parser'      // document parsing (markdown/json output from PDF/scans)
  | 'other';

type Modality = 'text-in' | 'text-out' | 'image-in' | 'audio-in' | 'audio-out' | 'video-in' | 'vector-out';

interface Classification {
  kind: Kind;
  modalities: Modality[];
  /** Estimated max input tokens from family knowledge base. null = unknown. */
  context_window: number | null;
  context_source: 'family-kb' | 'name-suffix' | 'embed-default' | 'unknown';
  family: string;
}

const CONTEXT_KB: Array<{ pattern: RegExp; window: number; family: string }> = [
  // Most-specific patterns first
  { pattern: /llama-?4.*maverick.*17b/i,         window: 1_000_000, family: 'Llama 4 Maverick' },
  { pattern: /llama-?4/i,                         window: 1_000_000, family: 'Llama 4' },
  { pattern: /llama-?3\.[123]-nemotron/i,         window: 128_000,   family: 'Llama 3.x Nemotron' },
  { pattern: /llama-?3\.[123]/i,                  window: 128_000,   family: 'Llama 3.x' },
  { pattern: /llama-?3-/i,                        window: 8_000,     family: 'Llama 3' },
  { pattern: /llama-?2/i,                         window: 4_000,     family: 'Llama 2' },
  { pattern: /codellama/i,                        window: 16_000,    family: 'CodeLlama' },
  { pattern: /nemotron-?4-340b/i,                 window: 4_000,     family: 'Nemotron 4 340B' },
  { pattern: /nemotron-?3/i,                      window: 128_000,   family: 'Nemotron 3' },
  { pattern: /nemotron/i,                         window: 128_000,   family: 'Nemotron' },
  { pattern: /nv-embedqa/i,                       window: 512,       family: 'NV EmbedQA' },
  { pattern: /nv-embed-v1/i,                      window: 4_096,     family: 'NV Embed v1' },
  { pattern: /nv-embedcode/i,                     window: 8_192,     family: 'NV EmbedCode' },
  { pattern: /llama.*embed.*1b/i,                 window: 8_192,     family: 'Llama Embed 1B' },
  { pattern: /arctic-embed/i,                     window: 512,       family: 'Snowflake Arctic Embed' },
  { pattern: /bge-m3/i,                           window: 8_192,     family: 'BGE-M3' },
  { pattern: /mistral-large-3/i,                  window: 128_000,   family: 'Mistral Large 3' },
  { pattern: /mistral-large/i,                    window: 32_000,    family: 'Mistral Large' },
  { pattern: /mistral-medium/i,                   window: 128_000,   family: 'Mistral Medium' },
  { pattern: /mistral-small/i,                    window: 128_000,   family: 'Mistral Small' },
  { pattern: /mixtral-8x22b/i,                    window: 65_000,    family: 'Mixtral 8x22B' },
  { pattern: /mixtral-8x7b/i,                     window: 32_000,    family: 'Mixtral 8x7B' },
  { pattern: /mistral-nemo/i,                     window: 128_000,   family: 'Mistral Nemo' },
  { pattern: /mistral-7b/i,                       window: 32_000,    family: 'Mistral 7B' },
  { pattern: /codestral/i,                        window: 32_000,    family: 'Codestral' },
  { pattern: /ministral/i,                        window: 128_000,   family: 'Ministral' },
  { pattern: /jamba-1\.5/i,                       window: 256_000,   family: 'Jamba 1.5' },
  { pattern: /gemma-?3/i,                         window: 128_000,   family: 'Gemma 3' },
  { pattern: /gemma-?2/i,                         window: 8_000,     family: 'Gemma 2' },
  { pattern: /codegemma/i,                        window: 8_000,     family: 'CodeGemma' },
  { pattern: /recurrentgemma/i,                   window: 8_000,     family: 'RecurrentGemma' },
  { pattern: /phi-?4-multimodal/i,                window: 128_000,   family: 'Phi 4 Multimodal' },
  { pattern: /phi-?4-mini/i,                      window: 128_000,   family: 'Phi 4 Mini' },
  { pattern: /phi-?4/i,                           window: 16_000,    family: 'Phi 4' },
  { pattern: /phi-?3-vision/i,                    window: 128_000,   family: 'Phi 3 Vision' },
  { pattern: /phi-?3\.5-moe/i,                    window: 128_000,   family: 'Phi 3.5 MoE' },
  { pattern: /phi-?3/i,                           window: 128_000,   family: 'Phi 3' },
  { pattern: /qwen3\.5-/i,                        window: 128_000,   family: 'Qwen 3.5' },
  { pattern: /qwen3-coder/i,                      window: 128_000,   family: 'Qwen 3 Coder' },
  { pattern: /qwen3-next/i,                       window: 256_000,   family: 'Qwen 3 Next' },
  { pattern: /deepseek-v4/i,                      window: 128_000,   family: 'DeepSeek V4' },
  { pattern: /deepseek-coder/i,                   window: 16_000,    family: 'DeepSeek Coder' },
  { pattern: /gpt-oss-120b/i,                     window: 262_000,   family: 'GPT-OSS 120B' },
  { pattern: /gpt-oss-20b/i,                      window: 128_000,   family: 'GPT-OSS 20B' },
  { pattern: /granite-3/i,                        window: 128_000,   family: 'Granite 3' },
  { pattern: /granite.*code/i,                    window: 32_000,    family: 'Granite Code' },
  { pattern: /yi-large/i,                         window: 32_000,    family: 'Yi Large' },
  { pattern: /dbrx/i,                             window: 32_000,    family: 'DBRX' },
  { pattern: /palmyra/i,                          window: 32_000,    family: 'Palmyra' },
  { pattern: /starcoder/i,                        window: 16_000,    family: 'StarCoder' },
  { pattern: /kimi-k2/i,                          window: 128_000,   family: 'Kimi K2' },
  { pattern: /minimax/i,                          window: 200_000,   family: 'MiniMax' },
  { pattern: /sarvam/i,                           window: 32_000,    family: 'Sarvam' },
  { pattern: /stockmark/i,                        window: 32_000,    family: 'Stockmark' },
  { pattern: /step.*flash/i,                      window: 65_000,    family: 'StepFun' },
  { pattern: /solar/i,                            window: 4_000,     family: 'Solar' },
  { pattern: /zamba/i,                            window: 4_000,     family: 'Zamba' },
  { pattern: /seallm/i,                           window: 8_000,     family: 'SeaLLM' },
  { pattern: /sea-lion/i,                         window: 8_000,     family: 'Sea-Lion' },
  { pattern: /fuyu-8b/i,                          window: 16_000,    family: 'Fuyu 8B' },
  { pattern: /deplot/i,                           window: 4_000,     family: 'DePlot' },
  { pattern: /kosmos/i,                           window: 2_000,     family: 'Kosmos' },
  { pattern: /nvclip/i,                           window: 77,        family: 'NV CLIP' },
  { pattern: /neva/i,                             window: 4_000,     family: 'NeVA' },
  { pattern: /vila/i,                             window: 8_000,     family: 'VILA' },
  { pattern: /nemoguard/i,                        window: 8_000,     family: 'NemoGuard' },
  { pattern: /llama-guard/i,                      window: 8_000,     family: 'Llama Guard' },
  { pattern: /llama-nemotron-embed/i,             window: 8_192,     family: 'Llama Nemotron Embed' },
  { pattern: /nemoretriever-parse/i,              window: 32_000,    family: 'NemoRetriever Parse' },
  { pattern: /nemotron-parse/i,                   window: 32_000,    family: 'Nemotron Parse' },
  { pattern: /gliner/i,                           window: 384,       family: 'GLiNER' },
  { pattern: /riva/i,                             window: 1_024,     family: 'Riva' },
];

function classify(id: string): Classification {
  const l = id.toLowerCase();

  // Kind classification
  let kind: Kind;
  if (l.includes('embed')) kind = 'embed';
  else if (l.includes('rerank')) kind = 'rerank';
  else if (l.includes('reward')) kind = 'reward';
  else if (l.includes('safety') || l.includes('guard') || l.includes('shield') || l.includes('nemoguard')) kind = 'safety';
  else if (l.includes('riva') || l.includes('whisper') || l.includes('-asr') || l.includes('-tts') || l.includes('translate')) kind = 'speech';
  else if (l.includes('parse') || l.includes('retriever-parse')) kind = 'parser';
  else if (l.includes('vl-') || l.includes('-vl-') || l.endsWith('-vl') || l.includes('vision') || l.includes('llava') ||
           l.includes('kosmos') || l.includes('neva') || l.includes('vila') || l.includes('nvclip')) kind = 'multimodal';
  else if (l.includes('multimodal') || l.includes('omni')) kind = 'multimodal';
  else if (l.includes('fuyu') || l.includes('deplot')) kind = 'multimodal';
  else if (l.includes('code-') || l.includes('codestral') || l.includes('codegemma') ||
           l.includes('starcoder') || l.includes('codellama') || l.includes('deepseek-coder') ||
           l.includes('granite-') && l.includes('code')) kind = 'code';
  else kind = 'chat';

  // Modalities
  const modalities: Modality[] = ['text-in'];
  if (kind === 'embed') modalities.push('vector-out');
  else modalities.push('text-out');
  if (kind === 'multimodal' || kind === 'parser') modalities.push('image-in');
  if (l.includes('omni') || l.includes('multimodal')) modalities.push('audio-in');
  if (kind === 'speech') {
    if (l.includes('tts')) modalities.push('audio-out');
    else modalities.push('audio-in');
  }
  if (l.includes('video') || (l.includes('synthetic-video'))) modalities.push('video-in');

  // Context window from KB
  let context_window: number | null = null;
  let context_source: Classification['context_source'] = 'unknown';
  let family = id.split('/')[0] ?? 'unknown';
  for (const entry of CONTEXT_KB) {
    if (entry.pattern.test(id)) {
      context_window = entry.window;
      context_source = 'family-kb';
      family = entry.family;
      break;
    }
  }
  if (context_window === null && kind === 'embed') {
    context_window = 512;
    context_source = 'embed-default';
  }

  return { kind, modalities, context_window, context_source, family };
}

// ─────────────────────────────────────────────────────────────────────────
// Catalog fetch
// ─────────────────────────────────────────────────────────────────────────

interface CatalogEntry { id: string }

async function fetchCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch(`${BASE_URL}/models`, {
    headers: { Accept: 'application/json', 'User-Agent': 'probe-catalog/1.0' },
  });
  if (!res.ok) throw new Error(`Catalog fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { data: CatalogEntry[] };
  return body.data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────
// Probe one model
// ─────────────────────────────────────────────────────────────────────────

interface ProbeResult {
  id: string;
  classification: Classification;
  reachable: boolean;
  probe_ms: number | null;
  dimensions: number | null;   // for embed
  excerpt: string | null;      // first 80 chars of chat response
  error: string | null;
}

async function probeOne(id: string, cls: Classification, signal: AbortSignal): Promise<ProbeResult> {
  // Pick the kind to probe with based on classification
  // - embed/parser/multimodal-with-embed → kind=embed
  // - everything else → kind=chat (works for vision/safety/reward as text-only)
  // - speech → skip (different API shape, would need RIVA endpoint)
  if (cls.kind === 'speech') {
    return { id, classification: cls, reachable: false, probe_ms: null, dimensions: null, excerpt: null, error: 'speech: not probed (different API shape)' };
  }

  const probeKind = cls.kind === 'embed' ? 'embed' : 'chat';
  const url = `${BASE_URL}/test/probe-one?model=${encodeURIComponent(id)}&kind=${probeKind}`;

  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'probe-catalog/1.0', ...ADMIN_HEADERS },
    });
    // A 401 means our admin key is wrong/missing — every model would be
    // misreported unreachable and poison the daily snapshot. Fail loudly.
    if (res.status === 401 || res.status === 500) {
      const text = await res.text();
      if (text.includes('unauthorized') || text.includes('server_misconfigured')) {
        throw new Error(`AUTH-GATE HTTP ${res.status}: ${text.slice(0, 120)} — check ADMIN_API_KEY`);
      }
    }
    const body = (await res.json()) as {
      model: string; ok: boolean; dimensions?: number; excerpt?: string; ms?: number; error?: string;
    };
    if (body.ok) {
      return {
        id,
        classification: cls,
        reachable: true,
        probe_ms: body.ms ?? (Date.now() - start),
        dimensions: body.dimensions ?? null,
        excerpt: body.excerpt ?? null,
        error: null,
      };
    }
    return {
      id,
      classification: cls,
      reachable: false,
      probe_ms: body.ms ?? (Date.now() - start),
      dimensions: null,
      excerpt: null,
      error: (body.error ?? 'unknown').slice(0, 200),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('AUTH-GATE')) {
      // Fatal: continuing would mark every model unreachable and poison the
      // committed snapshot. Abort the whole run.
      console.error(`✗ ${msg}`);
      process.exit(3);
    }
    return {
      id,
      classification: cls,
      reachable: false,
      probe_ms: Date.now() - start,
      dimensions: null,
      excerpt: null,
      error: msg.slice(0, 200),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Fan-out with bounded concurrency
// ─────────────────────────────────────────────────────────────────────────

async function probeAll(catalog: CatalogEntry[], concurrency: number): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  let next = 0;

  async function worker() {
    while (next < catalog.length) {
      const i = next++;
      const entry = catalog[i]!;
      const cls = classify(entry.id);
      const filtered = KIND_ARG && cls.kind !== KIND_ARG;
      if (filtered) {
        results[i] = { id: entry.id, classification: cls, reachable: false, probe_ms: null, dimensions: null, excerpt: null, error: 'filtered by --kind' };
        continue;
      }
      if (SKIP_PROBE) {
        results[i] = { id: entry.id, classification: cls, reachable: false, probe_ms: null, dimensions: null, excerpt: null, error: 'skipped' };
        continue;
      }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 90_000);
      try {
        results[i] = await probeOne(entry.id, cls, ac.signal);
        process.stdout.write(`  [${i + 1}/${catalog.length}] ${entry.id.slice(0, 50).padEnd(50)} `);
        if (results[i]!.reachable) {
          const dim = results[i]!.dimensions ? `${results[i]!.dimensions}d` : '';
          process.stdout.write(`✓ ${cls.kind.padEnd(11)} ${(results[i]!.probe_ms ?? 0).toString().padStart(5)}ms ${dim}\n`);
        } else {
          process.stdout.write(`✗ ${cls.kind.padEnd(11)} ${results[i]!.error?.slice(0, 50) ?? 'unknown'}\n`);
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// Ranking + reporting
// ─────────────────────────────────────────────────────────────────────────

function rankScore(r: ProbeResult): number {
  if (!r.reachable) return -1;
  const cls = r.classification;
  // Composite: kind-appropriate. For chat/multimodal/code: context window (higher = better)
  // For embed: dimensions × (8192 / max context) approximation
  // For safety/reward/parser: latency (lower = better)
  if (cls.kind === 'embed') {
    return (r.dimensions ?? 0) * 1;
  }
  if (cls.kind === 'chat' || cls.kind === 'multimodal' || cls.kind === 'code') {
    return cls.context_window ?? 0;
  }
  // Safety/reward/parser: latency-bounded
  return r.probe_ms ? 100_000 - r.probe_ms : 0;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function renderMarkdown(results: ProbeResult[]): string {
  const byKind = new Map<Kind, ProbeResult[]>();
  for (const r of results) {
    byKind.set(r.classification.kind, [...(byKind.get(r.classification.kind) ?? []), r]);
  }
  for (const [k, list] of byKind) {
    list.sort((a, b) => rankScore(b) - rankScore(a));
    byKind.set(k, list);
  }

  const reach = results.filter((r) => r.reachable).length;
  const total = results.length;

  const lines: string[] = [
    `# NIM Catalog Probe — ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Base: \`${BASE_URL}\` · Catalog: ${total} models · Reachable: ${reach} (${((reach / total) * 100).toFixed(0)}%)`,
    '',
    `_Context windows are best-effort estimates from a family knowledge base; NIM serving may cap below the model's native max. Dimensions are measured at probe time._`,
    '',
  ];

  const KIND_ORDER: Kind[] = ['chat', 'embed', 'multimodal', 'code', 'safety', 'parser', 'reward', 'rerank', 'speech', 'vision', 'other'];
  for (const kind of KIND_ORDER) {
    const list = byKind.get(kind);
    if (!list || list.length === 0) continue;
    const reachable = list.filter((r) => r.reachable).length;
    lines.push(`## ${kind.toUpperCase()} (${reachable}/${list.length} reachable)`);
    lines.push('');
    lines.push('| Rank | Status | Model | Family | Context | Dims | Probe ms | Modalities |');
    lines.push('|---|---|---|---|---|---|---|---|');
    list.forEach((r, i) => {
      const status = r.reachable ? '✓' : (r.error?.includes('skipped') ? '⏭' : '✗');
      const mods = r.classification.modalities.map((m) => m.replace('text-in', 'T').replace('text-out', '→T').replace('image-in', '+I').replace('audio-in', '+A').replace('audio-out', '→A').replace('video-in', '+V').replace('vector-out', '→V')).join('');
      const dim = r.dimensions ? `${r.dimensions}` : (r.classification.kind === 'embed' ? '?' : '—');
      lines.push(`| ${i + 1} | ${status} | \`${r.id}\` | ${r.classification.family} | ${fmt(r.classification.context_window)} | ${dim} | ${r.probe_ms ?? '—'} | ${mods} |`);
    });
    lines.push('');
  }

  // Failed-to-probe section
  const failed = results.filter((r) => !r.reachable && !r.error?.includes('skipped') && !r.error?.includes('filtered'));
  if (failed.length > 0) {
    lines.push(`## ⚠️ UNREACHABLE — DO NOT USE in production routing (${failed.length})`);
    lines.push('');
    lines.push('| Model | Inferred Kind | Error |');
    lines.push('|---|---|---|');
    for (const r of failed) {
      lines.push(`| \`${r.id}\` | ${r.classification.kind} | ${(r.error ?? 'unknown').slice(0, 80)} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`▸ Fetching catalog from ${BASE_URL}/models`);
  const catalog = await fetchCatalog();
  console.log(`  ${catalog.length} models in catalog\n`);

  console.log(`▸ Probing each model with concurrency=${CONCURRENCY}${SKIP_PROBE ? ' (skipped — classification only)' : ''}`);
  console.log('');
  const results = await probeAll(catalog, CONCURRENCY);

  const reachable = results.filter((r) => r.reachable).length;
  console.log('');
  console.log(`▸ Summary: ${reachable}/${results.length} reachable`);

  // Write outputs
  const jsonPath = join(REPO_ROOT, 'workers', '.catalog-probe.json');
  const mdPath = join(REPO_ROOT, 'workers', '.catalog-probe.md');
  const reachablePath = join(REPO_ROOT, 'workers', '.reachable-models.txt');

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        base_url: BASE_URL,
        fetched_at: new Date().toISOString(),
        catalog_size: results.length,
        reachable_count: reachable,
        results,
      },
      null,
      2,
    ),
  );
  writeFileSync(mdPath, renderMarkdown(results));
  writeFileSync(
    reachablePath,
    results
      .filter((r) => r.reachable)
      .map((r) => r.id)
      .sort()
      .join('\n') + '\n',
  );

  console.log(`▸ Wrote:`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);
  console.log(`  ${reachablePath}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
