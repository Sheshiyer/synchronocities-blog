# Expand v2 — Retrieval-Grounded Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the naked-chat `/expand` endpoint with a retrieval-grounded `/expand/v2/section` that uses the embedding + Vectorize + rerank stack to ground each section's expansion in specific neighboring corpus passages, while enforcing per-corpus concept-saturation caps that prevent brand-anchor name-dropping.

**Architecture:**
The current `/expand` endpoint bypasses the embedding stack — it's a naked `chat()` call with a static system prompt that lists brand-anchors to "connect," causing the model to inject the same vocabulary in every section of every post. The v2 endpoint actually routes through the stack: per section, embed → Vectorize-search → rerank → chat with retrieved neighbors as grounding + saturation blacklist as constraint. Adds a one-time corpus-saturation pre-compute that counts brand-term frequency across all 125 posts and writes the result as a JSON artifact in R2.

**Tech Stack:**
- TypeScript on Cloudflare Workers (existing `workers/` folder)
- NVIDIA NIM via existing routing layer (`workers/src/lib/routing.ts`): `nv-embedqa-e5-v5` embed, `nemotron-mini-4b` rerank, `meta/llama-3.3-70b-instruct` chat
- Cloudflare Vectorize (existing `CORPUS_INDEX` binding, 125 posts already embedded)
- Cloudflare R2 (existing `ARTIFACTS` binding) for saturation map
- Cloudflare KV (existing `CACHE` binding) for cached saturation lookups

---

## Background: Why v1 Failed

`/expand` was the FIRST place in the corpus where retrieval-grounded generation actually mattered for content authoring. `/search`, `/related/:slug`, and `/maps/cluster` are retrieval-only. `/chat` is RAG for visitor queries but doesn't author corpus content. **No production pipeline used retrieval-grounded generation for content authoring.** The v1 `/expand` endpoint shipped as a naked chat completion and produced the bloat the user is now seeing.

Codegraph confirmation of v1's actual call shape (from session work, 2026-05-25):
```
handleExpand / handleExpandSection
  └─→ expandSection()
        └─→ chat(env, { model: NIM_CHAT_MODEL, messages: [SYSTEM_PROMPT, USER_PROMPT] })
        └─→ stripLeadingHeaders()
        └─→ enforceAvoidList()

  NO call to embed(), CORPUS_INDEX.query(), rerank(), runSurface(), or fanOut().
```

The smoking-gun line in the v1 system prompt (`workers/src/routes/expand.ts:79–119`):
> "CONNECTIONS to other concepts in the corpus (pancha-kosha, kha-ba-la, kosha architecture, antar-agni, lorenz-kundli, etc.)"

This handed the model a brand-anchor list and made connection-density a "what to fill 4× with" target. Result: the same terms appear in every section of every post. v2 inverts this — no anchor list in the prompt, and the prompt explicitly forbids introducing saturated terms.

---

## Task 1: Define brand-term taxonomy + thresholds

**Files:**
- Create: `workers/src/lib/saturation-terms.ts`
- Test: none yet (data file)

**Step 1: Create the brand-term taxonomy file**

Three categories of terms to track, with different thresholds:

```typescript
// workers/src/lib/saturation-terms.ts
/**
 * Brand-anchor terms tracked for corpus-wide saturation.
 *
 * Threshold semantics (occurrences per corpus of 125 posts):
 *   available     0–24    fine to introduce
 *   sparingly    25–74    use only if structurally load-bearing in this section
 *   saturated    75+      DO NOT introduce in new expansions
 *
 * Match rules:
 *   - case-insensitive
 *   - whole-word only (\\b boundaries)
 *   - normalize diacritics (śakti = sakti)
 *   - exact phrase for multi-word terms
 */

export interface SaturationTerm {
  key: string;          // canonical name used as map key
  patterns: string[];   // regex-ready strings (without \\b — added at use)
  category: 'brand-vocab' | 'sanskrit-anchor' | 'concept-frame';
}

export const SATURATION_TERMS: SaturationTerm[] = [
  // Brand-vocab — coined by the Tryambakam Noesis project
  { key: 'kha-ba-la',         patterns: ['kha-ba-la', 'kha ba la'],                          category: 'brand-vocab' },
  { key: 'kratu-purusha',     patterns: ['kratu-purusha', 'kratu purusha', 'kratu-purusa'],  category: 'brand-vocab' },
  { key: 'witness-alchemist', patterns: ['witness-alchemist', 'witness alchemist'],           category: 'brand-vocab' },
  { key: 'lorenz-kundli',     patterns: ['lorenz-kundli', 'lorenz kundli'],                   category: 'brand-vocab' },
  { key: 'noesis-engine',     patterns: ['noesis engine', 'noesis-engine'],                   category: 'brand-vocab' },
  { key: 'self-generating-code-well', patterns: ['self-generating code well', 'code well'],   category: 'brand-vocab' },

  // Sanskrit-anchor — recurring Sanskrit terms
  { key: 'antar-agni',        patterns: ['antar-agni', 'antar agni', 'antaragni'],            category: 'sanskrit-anchor' },
  { key: 'pancha-kosha',      patterns: ['pancha-kosha', 'pancha kosha', 'panchakosha'],      category: 'sanskrit-anchor' },
  { key: 'bali-padyami',      patterns: ['bali padyami', 'bali-padyami'],                     category: 'sanskrit-anchor' },
  { key: 'ukha',              patterns: ['ukha', 'ukhā', 'ukhasambharana'],                   category: 'sanskrit-anchor' },
  { key: 'samvatsara',        patterns: ['samvatsara'],                                       category: 'sanskrit-anchor' },
  { key: 'samskara',          patterns: ['samskara', 'sanskara'],                             category: 'sanskrit-anchor' },
  { key: 'tapas',             patterns: ['tapas', 'tapasya'],                                 category: 'sanskrit-anchor' },
  { key: 'sakshi',            patterns: ['sakshi', 'sākṣī', 'saksi'],                         category: 'sanskrit-anchor' },
  { key: 'rasayana',          patterns: ['rasayana', 'rasāyana'],                             category: 'sanskrit-anchor' },
  { key: 'prasuti',           patterns: ['prasuti', 'prasūti'],                               category: 'sanskrit-anchor' },
  { key: 'utkrama',           patterns: ['utkrama', 'utkrāma'],                               category: 'sanskrit-anchor' },
  { key: 'vajra',             patterns: ['vajra'],                                            category: 'sanskrit-anchor' },
  { key: 'valmika',           patterns: ['valmika', 'valmīka', 'anthill'],                    category: 'sanskrit-anchor' },
  { key: 'abhri',             patterns: ['abhri'],                                            category: 'sanskrit-anchor' },
  { key: 'vyamamatri',        patterns: ['vyamamatri', 'vyāmamātri'],                         category: 'sanskrit-anchor' },

  // Concept-frame — recurring framing devices
  { key: 'matched-cavity',    patterns: ['matched-cavity', 'matched cavity'],                 category: 'concept-frame' },
  { key: 'engineered-obsolescence', patterns: ['engineered obsolescence'],                    category: 'concept-frame' },
  { key: 'compile-error',     patterns: ['compile-error', 'compile error'],                   category: 'concept-frame' },
  { key: 'consciousness-compiler', patterns: ['consciousness compiler'],                      category: 'concept-frame' },
  { key: 'operator-the-only-remainder', patterns: ['only thing that remains', 'only remainder'], category: 'concept-frame' },
];

export const THRESHOLDS = {
  available: 25,    // 0–24 occurrences across corpus = available
  sparingly: 75,    // 25–74 = use sparingly
                    // 75+ = saturated (DO NOT INTRODUCE)
};

export function classify(count: number): 'available' | 'sparingly' | 'saturated' {
  if (count >= THRESHOLDS.sparingly) return 'saturated';
  if (count >= THRESHOLDS.available) return 'sparingly';
  return 'available';
}
```

**Step 2: Commit**

```bash
git add workers/src/lib/saturation-terms.ts
git commit -m "feat(expand-v2): define brand-term taxonomy + saturation thresholds"
```

---

## Task 2: Implement corpus-saturation counter

**Files:**
- Create: `workers/scripts/compute-saturation.ts`
- Test: `workers/scripts/compute-saturation.test.ts`

**Step 1: Write the failing test**

```typescript
// workers/scripts/compute-saturation.test.ts
import { countOccurrences } from './compute-saturation';

const fixture = `
Antar-agni is the substrate. The kha-ba-la triad organizes this.
Antar agni again — but the matched-cavity principle binds it.
`;

test('countOccurrences handles whitespace + hyphen variants', () => {
  const result = countOccurrences(fixture);
  // antar-agni appears twice (once with hyphen, once with space)
  expect(result['antar-agni']).toBe(2);
  // kha-ba-la appears once
  expect(result['kha-ba-la']).toBe(1);
  // matched-cavity appears once
  expect(result['matched-cavity']).toBe(1);
});
```

**Step 2: Run test to verify it fails**

```bash
cd workers && bun test scripts/compute-saturation.test.ts
```
Expected: FAIL with "Cannot find module './compute-saturation'"

**Step 3: Write the implementation**

```typescript
// workers/scripts/compute-saturation.ts
#!/usr/bin/env bun
/**
 * Walk all posts under src/content/posts/, count occurrences of each
 * brand-anchor term across the whole corpus, and write the result as
 * a JSON artifact for /expand/v2 to consume.
 *
 * Output:  workers/.saturation-map.json   (local artifact)
 * Deploy:  uploaded to R2 by a follow-up task
 *
 * Usage:
 *   bun workers/scripts/compute-saturation.ts
 *   bun workers/scripts/compute-saturation.ts --json     # print only
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SATURATION_TERMS, classify, type SaturationTerm } from '../src/lib/saturation-terms';

const POSTS_DIR = join(import.meta.dir, '..', '..', 'src', 'content', 'posts');
const OUT_PATH = join(import.meta.dir, '..', '.saturation-map.json');

export function countOccurrences(text: string): Record<string, number> {
  const lower = text.toLowerCase();
  const counts: Record<string, number> = {};
  for (const term of SATURATION_TERMS) {
    let total = 0;
    for (const pattern of term.patterns) {
      // Escape regex special chars, then \\b on both ends
      const escaped = pattern.toLowerCase().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'g');
      const matches = lower.match(re);
      total += matches ? matches.length : 0;
    }
    counts[term.key] = total;
  }
  return counts;
}

async function main() {
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  const corpus: Record<string, number> = {};
  for (const t of SATURATION_TERMS) corpus[t.key] = 0;

  for (const file of files) {
    const text = readFileSync(join(POSTS_DIR, file), 'utf8');
    const counts = countOccurrences(text);
    for (const [key, n] of Object.entries(counts)) corpus[key] += n;
  }

  const output = {
    computed_at: new Date().toISOString(),
    corpus_size: files.length,
    counts: corpus,
    classifications: Object.fromEntries(
      Object.entries(corpus).map(([k, v]) => [k, classify(v)]),
    ),
    saturated_terms: Object.entries(corpus)
      .filter(([_k, v]) => classify(v) === 'saturated')
      .map(([k]) => k),
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
    console.log(`Wrote ${OUT_PATH}`);
    console.log(`Corpus: ${files.length} posts`);
    console.log(`Saturated (75+): ${output.saturated_terms.length} terms`);
    console.log(`  ${output.saturated_terms.slice(0, 10).join(', ')}${output.saturated_terms.length > 10 ? '...' : ''}`);
  }
}

if (import.meta.main) {
  await main();
}
```

**Step 4: Run test to verify it passes**

```bash
cd workers && bun test scripts/compute-saturation.test.ts
```
Expected: PASS — all 3 assertions

**Step 5: Run the actual counter against the corpus + inspect output**

```bash
cd workers && bun scripts/compute-saturation.ts
cat workers/.saturation-map.json | jq '{ corpus_size, saturated_terms, counts: (.counts | to_entries | sort_by(-.value) | .[0:10]) }'
```
Expected: Saturation list includes the user's flagged anchors — `antar-agni`, `kha-ba-la`, `kratu-purusha`, `bali-padyami`, `ukha`, `matched-cavity`, `pancha-kosha`, etc. Top-10 counts give us empirical proof of the bloat.

**Step 6: Commit**

```bash
git add workers/scripts/compute-saturation.ts workers/scripts/compute-saturation.test.ts workers/.saturation-map.json
git commit -m "feat(expand-v2): corpus saturation counter + initial map artifact"
```

---

## Task 3: Upload saturation map to R2 + serve via /test/saturation

**Files:**
- Modify: `workers/src/index.ts` (add `/test/saturation` GET handler)
- Modify: `workers/scripts/compute-saturation.ts` (add `--upload` flag using wrangler r2)

**Step 1: Add R2 upload to the script**

In `compute-saturation.ts`, after writing the local file, if `--upload` is passed, shell out to `wrangler r2 object put`:

```typescript
if (process.argv.includes('--upload')) {
  const { execSync } = await import('node:child_process');
  const corpusVersion = process.env.CORPUS_VERSION ?? '2';
  const key = `saturation/v${corpusVersion}.json`;
  execSync(
    `wrangler r2 object put synchronocities-artifacts/${key} --file=${OUT_PATH} --content-type=application/json --remote`,
    { stdio: 'inherit', cwd: join(import.meta.dir, '..') },
  );
  console.log(`Uploaded to r2://synchronocities-artifacts/${key}`);
}
```

**Step 2: Run upload**

```bash
cd workers && bun scripts/compute-saturation.ts --upload
```
Expected: Object uploaded to R2.

**Step 3: Add /test/saturation endpoint to src/index.ts**

Inside the main `fetch` handler, before the `/test/probe-one` block:

```typescript
// GET /test/saturation — returns the corpus saturation map (cached 1h in KV)
if (path === '/test/saturation' && request.method === 'GET') {
  const cacheKey = `saturation:v${env.CORPUS_VERSION}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: { ...JSON_HEADERS, ...CORS_HEADERS, 'X-Cache': 'HIT' },
    });
  }
  const r2Object = await env.ARTIFACTS.get(`saturation/v${env.CORPUS_VERSION}.json`);
  if (!r2Object) {
    return Response.json(
      { error: 'saturation map not found in R2; run compute-saturation.ts --upload' },
      { status: 404, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
    );
  }
  const body = await r2Object.text();
  await env.CACHE.put(cacheKey, body, { expirationTtl: 3600 });
  return new Response(body, {
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, 'X-Cache': 'MISS' },
  });
}
```

**Step 4: Deploy + verify**

```bash
cd workers && bunx wrangler deploy
curl -s https://synchronocities-ai.tirak-court.workers.dev/test/saturation | jq '.saturated_terms'
```
Expected: JSON list of saturated brand-anchor keys.

**Step 5: Commit**

```bash
git add workers/scripts/compute-saturation.ts workers/src/index.ts
git commit -m "feat(expand-v2): upload saturation map to R2 + /test/saturation endpoint"
```

---

## Task 4: Build retrieveNeighbors helper

**Files:**
- Create: `workers/src/lib/retrieve.ts`
- Test: `workers/src/lib/retrieve.test.ts` (integration test against deployed Worker)

**Step 1: Write the failing test**

```typescript
// workers/src/lib/retrieve.test.ts — integration test, requires deployed worker
test('retrieveNeighbors returns top-3 passages from OTHER posts', async () => {
  const res = await fetch('https://synchronocities-ai.tirak-court.workers.dev/test/retrieve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      section_text: 'the cavity precedes the flame',
      exclude_slug: 'vessel-prepare-ukha-sambharana',
    }),
  });
  const data = await res.json();
  expect(data.neighbors).toHaveLength(3);
  expect(data.neighbors.every((n: any) => n.slug !== 'vessel-prepare-ukha-sambharana')).toBe(true);
  expect(data.neighbors[0]).toHaveProperty('passage_text');
  expect(data.neighbors[0]).toHaveProperty('score');
});
```

**Step 2: Implement retrieveNeighbors**

```typescript
// workers/src/lib/retrieve.ts
import { embed, rerank, type NimConfig } from './nim';

export interface Neighbor {
  slug: string;
  title: string;
  passage_text: string;
  score: number;
}

export interface RetrieveOptions {
  topKFromVectorize?: number;  // before rerank
  finalTopN?: number;          // after rerank
}

/**
 * Per-section retrieval grounding:
 *   1. embed the section text (passage type)
 *   2. Vectorize kNN query, filter excludeSlug
 *   3. rerank candidates with LLM-as-judge (cheap model)
 *   4. return top-N with attribution
 */
export async function retrieveNeighbors(
  config: NimConfig & {
    NIM_EMBED_MODEL: string;
    NIM_RERANK_MODEL: string;
    CORPUS_INDEX: VectorizeIndex;
  },
  sectionText: string,
  excludeSlug: string,
  opts: RetrieveOptions = {},
): Promise<Neighbor[]> {
  const topK = opts.topKFromVectorize ?? 12;
  const topN = opts.finalTopN ?? 3;

  // 1. embed
  const [vector] = await embed(config, {
    model: config.NIM_EMBED_MODEL,
    texts: [sectionText],
    input_type: 'passage',
  });

  // 2. Vectorize kNN — over-fetch so we can filter out the source post
  const result = await config.CORPUS_INDEX.query(Array.from(vector!), {
    topK: topK + 5,
    returnMetadata: 'all',
    returnValues: false,
  });

  // 3. Filter out self, take topK
  const candidates = result.matches
    .filter((m) => m.metadata?.slug !== excludeSlug)
    .slice(0, topK)
    .map((m) => ({
      slug: m.metadata?.slug as string,
      title: (m.metadata?.title as string) ?? '',
      passage_text: (m.metadata?.body_excerpt as string) ?? '',
      score: m.score,
    }))
    .filter((c) => c.passage_text.length > 0);

  if (candidates.length === 0) return [];

  // 4. Rerank with LLM-as-judge
  const reranked = await rerank(config, {
    model: config.NIM_RERANK_MODEL,
    query: sectionText.slice(0, 500),
    passages: candidates.map((c) => c.passage_text),
    top_n: topN,
  });

  return reranked
    .map((r) => {
      const c = candidates[r.index];
      if (!c) return null;
      return { ...c, score: r.score };
    })
    .filter((x): x is Neighbor => x !== null);
}
```

**Step 3: Add /test/retrieve endpoint**

```typescript
// In workers/src/index.ts main fetch handler:
if (path === '/test/retrieve' && request.method === 'POST') {
  const body = await request.json() as { section_text?: string; exclude_slug?: string };
  if (!body.section_text || !body.exclude_slug) {
    return Response.json({ error: 'section_text and exclude_slug required' }, { status: 400 });
  }
  const neighbors = await retrieveNeighbors(env, body.section_text, body.exclude_slug);
  return Response.json({ neighbors }, { headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
}
```

**Step 4: Deploy + run test**

```bash
cd workers && bunx wrangler deploy
bun test src/lib/retrieve.test.ts
```
Expected: PASS — 3 neighbors returned, none matching exclude_slug, all have passage_text and score.

**Step 5: Commit**

```bash
git add workers/src/lib/retrieve.ts workers/src/lib/retrieve.test.ts workers/src/index.ts
git commit -m "feat(expand-v2): retrieveNeighbors helper + /test/retrieve endpoint"
```

---

## Task 5: Verify Vectorize metadata includes body_excerpt

**Background:** retrieveNeighbors above assumes `metadata.body_excerpt` exists. The current corpus index may only have `metadata.slug` and `metadata.title`. If body_excerpt is missing, we need to add it via a reindex.

**Step 1: Check current Vectorize metadata shape**

```bash
curl -s https://synchronocities-ai.tirak-court.workers.dev/vectorize/info | jq
```

Also look at the embed-batch handler to see what metadata it writes:

```bash
cd workers && grep -n "body_excerpt\|metadata" src/routes/embed-batch.ts
```

**Step 2: If body_excerpt is missing, modify embed-batch.ts**

When embedding each post, store the first ~500 chars of body as `body_excerpt` in the Vectorize metadata. Bump `CORPUS_VERSION` in wrangler.toml from "2" to "3" to invalidate caches.

**Step 3: Trigger a full reindex**

```bash
cd workers && bun scripts/index-corpus.ts --force
```

**Step 4: Re-verify**

```bash
curl -X POST https://synchronocities-ai.tirak-court.workers.dev/test/retrieve \
  -H 'Content-Type: application/json' \
  -d '{"section_text": "the matched-cavity principle", "exclude_slug": "vessel-prepare-ukha-sambharana"}' \
  | jq '.neighbors[0]'
```
Expected: A neighbor with non-empty `passage_text`.

**Step 5: Commit**

```bash
git add workers/src/routes/embed-batch.ts workers/wrangler.toml
git commit -m "feat(expand-v2): include body_excerpt in Vectorize metadata; corpus_version=3"
```

---

## Task 6: Write the v2 system prompt

**Files:**
- Create: `workers/src/routes/expand-v2-prompt.ts`

**Step 1: Author the v2 system prompt**

The v2 prompt has THREE structural differences from v1:

1. **No corpus-concept list as "what to add."** Instead, the model gets THREE specific retrieved passages from neighbor posts and is told to triangulate with them.
2. **Explicit saturation blacklist.** The list of saturated terms is injected at runtime from the R2 saturation map.
3. **No length quota in the user-prompt.** The prompt asks for "deepen with specific evidence" — no 4× target.

```typescript
// workers/src/routes/expand-v2-prompt.ts

export const SYSTEM_PROMPT_V2 = `You are deepening ONE section of an essay by grounding it in SPECIFIC evidence from neighboring posts in the same corpus. Match the author's tight, declarative voice.

VOICE EXEMPLAR — match this register exactly:

"A vessel is what holds. Not what it looks like. Not what it weighs. What it holds. Antar-agni — the fire of awareness — is not generated. It is the substrate. The work is not ignition. The work is containment."

Short sentences mixed with longer flowing ones. Specific. Declarative. No spiritual platitudes. No generic transitions.

WHAT YOU GET — your input includes:
1. The current section's text (the thing to deepen)
2. THREE specific passages from OTHER posts in the corpus, retrieved by semantic similarity, with attribution
3. A list of SATURATED brand-terms that already appear too many times across the corpus (DO NOT introduce these)

WHAT TO DO:
1. Read the three retrieved passages. They are concrete evidence of how related material is treated elsewhere in the corpus.
2. Deepen the current section by TRIANGULATING with these passages — make ONE specific connection, with a real reference ("In [slug], the same architecture is named as..."). One reference per retrieved passage is enough; more is bloat.
3. Add concrete examples, mechanism, or stakes — NOT vocabulary.
4. Match the section's own conceptual register. If the section is about consciousness, deepen with consciousness specifics. Do NOT pivot into ritual vocabulary just because ritual vocabulary is "available."

WHAT NOT TO DO:
- Do NOT introduce any term in the SATURATED list. If a saturated term already appears in the section's existing text, you may KEEP it — but do not ADD new mentions.
- Do NOT name-drop concepts that aren't directly relevant to this section's specific argument.
- Do NOT add transitional sentences, hedging, or restating-what-was-just-said.
- Do NOT add a "this connects to" sentence unless the connection is a load-bearing claim, not a decorative one.

LENGTH:
The expanded section should be longer than the input, but ONLY because each new sentence carries new information. If you find yourself filling space, stop. Quality > quantity. There is no minimum word count.

FORBIDDEN WORDS (never use ANY):
journey, healing, manifesting, abundance, vibration, authentic self, higher self, optimization, hacks, productivity, tribe, community, admin layer, code well

OUTPUT RULES:
- ONLY the deepened body — no header line, no preamble
- Mix sentence lengths
- Bold only load-bearing nouns
- Open with a short 4-8 word sentence

Begin your response with the first paragraph of the deepened section.`;

export function buildUserPrompt(args: {
  postTitle: string;
  sectionHeader: string;
  sectionContent: string;
  neighbors: Array<{ slug: string; title: string; passage_text: string }>;
  saturatedTerms: string[];
}): string {
  const { postTitle, sectionHeader, sectionContent, neighbors, saturatedTerms } = args;

  const neighborBlock = neighbors
    .map((n, i) => `--- RETRIEVED PASSAGE ${i + 1} (from post '${n.slug}', titled "${n.title}") ---\n${n.passage_text}\n`)
    .join('\n');

  const saturatedList = saturatedTerms.length > 0
    ? saturatedTerms.join(', ')
    : '(none — all terms available)';

  return `Post title: ${postTitle}

Section header (for context only — do NOT include in your output): ${sectionHeader}

THREE RETRIEVED PASSAGES from neighboring posts in this corpus, semantically similar to the section you're deepening. Use these as triangulation material — make at most ONE specific reference per passage if it serves the argument.

${neighborBlock}

SATURATED TERMS (already over-used corpus-wide — do NOT introduce in this expansion):
${saturatedList}

SECTION TO DEEPEN:
${sectionContent}

Now deepen the section by adding specific evidence and concrete claims. Start immediately with the first paragraph of expanded prose. No header, no preamble.`;
}
```

**Step 2: Commit**

```bash
git add workers/src/routes/expand-v2-prompt.ts
git commit -m "feat(expand-v2): saturation-aware system prompt + neighbor-grounded user prompt"
```

---

## Task 7: Build /expand/v2/section endpoint

**Files:**
- Create: `workers/src/routes/expand-v2.ts`
- Modify: `workers/src/index.ts` (route registration)

**Step 1: Write the handler**

```typescript
// workers/src/routes/expand-v2.ts
import type { Env } from '../index';
import { chat } from '../lib/nim';
import { retrieveNeighbors } from '../lib/retrieve';
import { SYSTEM_PROMPT_V2, buildUserPrompt } from './expand-v2-prompt';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface ExpandV2Request {
  slug: string;
  title: string;
  header: string;
  content: string;
}

interface ExpandV2Response {
  slug: string;
  header: string;
  original_words: number;
  expanded_words: number;
  expanded_content: string;
  meta: {
    ms: number;
    model: string;
    retrieved_neighbors: Array<{ slug: string; score: number }>;
    saturated_terms_blocked: string[];
    cache: 'hit' | 'miss';
  };
}

const CACHE_TTL = 60 * 60 * 24 * 30;

async function getSaturatedTerms(env: Env): Promise<string[]> {
  const cacheKey = `saturation:v${env.CORPUS_VERSION}`;
  const cached = await env.CACHE.get(cacheKey);
  let body: string;
  if (cached) {
    body = cached;
  } else {
    const r2Object = await env.ARTIFACTS.get(`saturation/v${env.CORPUS_VERSION}.json`);
    if (!r2Object) return [];  // graceful: empty saturated list = no blacklist
    body = await r2Object.text();
    await env.CACHE.put(cacheKey, body, { expirationTtl: 3600 });
  }
  const map = JSON.parse(body) as { saturated_terms: string[] };
  return map.saturated_terms ?? [];
}

export async function handleExpandV2Section(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: CORS_HEADERS });
  }
  let body: ExpandV2Request;
  try {
    body = await request.json() as ExpandV2Request;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400, headers: CORS_HEADERS });
  }

  const start = Date.now();

  // Cache check
  const sectionHash = await hashContent(body.slug + '|' + body.header + '|' + body.content);
  const cacheKey = `expand-v2:v${env.CORPUS_VERSION}:${body.slug}:${sectionHash}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) {
    const r = JSON.parse(cached) as ExpandV2Response;
    r.meta.cache = 'hit';
    r.meta.ms = Date.now() - start;
    return Response.json(r, { headers: CORS_HEADERS });
  }

  // Parallel: retrieve neighbors + load saturation map
  const [neighbors, saturatedTerms] = await Promise.all([
    retrieveNeighbors(env, body.content, body.slug),
    getSaturatedTerms(env),
  ]);

  // Build prompt + call chat
  const userPrompt = buildUserPrompt({
    postTitle: body.title,
    sectionHeader: body.header,
    sectionContent: body.content,
    neighbors,
    saturatedTerms,
  });

  const raw = await chat(env, {
    model: env.NIM_CHAT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_V2 },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 2800,
    temperature: 0.45,
    top_p: 0.88,
  });

  // Post-process: strip leading headers + enforce saturation cap
  const stripped = stripLeadingHeader(raw.trim(), body.header);
  const finalContent = enforceSaturationCap(stripped, saturatedTerms);

  const response: ExpandV2Response = {
    slug: body.slug,
    header: body.header,
    original_words: countWords(body.content),
    expanded_words: countWords(finalContent),
    expanded_content: finalContent,
    meta: {
      ms: Date.now() - start,
      model: env.NIM_CHAT_MODEL,
      retrieved_neighbors: neighbors.map((n) => ({ slug: n.slug, score: n.score })),
      saturated_terms_blocked: saturatedTerms,
      cache: 'miss',
    },
  };

  ctx.waitUntil(env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: CACHE_TTL }));
  return Response.json(response, { headers: CORS_HEADERS });
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function hashContent(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function stripLeadingHeader(text: string, originalHeader: string): string {
  // Reuse logic from v1 — copy from src/routes/expand.ts
  const lines = text.split('\n');
  const headerText = originalHeader.replace(/^#+\s+/, '').trim().toLowerCase();
  let i = 0;
  while (i < lines.length && i < 5) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) { i++; continue; }
    if (/^#+\s+/.test(trimmed)) { i++; continue; }
    if (trimmed.toLowerCase().replace(/[*_]/g, '').trim() === headerText) { i++; continue; }
    break;
  }
  return lines.slice(i).join('\n').trim();
}

/**
 * Programmatic backstop: count occurrences of each saturated term in the
 * expanded output. If the model violated the prompt instruction and added
 * any saturated term that wasn't in the source section, surface a warning
 * (and optionally strip the introducing sentence). For now: warn-only.
 *
 * Future: full sentence-level removal when counts exceed pre-call baseline.
 */
function enforceSaturationCap(text: string, saturatedTerms: string[]): string {
  // Phase 1 (this task): no-op pass-through; log violations in meta later.
  // Phase 2 (next task): actually count + strip sentences that newly introduce saturated terms.
  return text;
}
```

**Step 2: Wire into src/index.ts**

```typescript
import { handleExpandV2Section } from './routes/expand-v2';

// ... in fetch handler:
if (path === '/expand/v2/section' && request.method === 'POST') {
  return handleExpandV2Section(request, env, ctx);
}
```

**Step 3: Deploy + smoke test**

```bash
cd workers && bunx wrangler deploy
curl -X POST https://synchronocities-ai.tirak-court.workers.dev/expand/v2/section \
  -H 'Content-Type: application/json' \
  -d '{
    "slug": "vessel-prepare-ukha-sambharana",
    "title": "Vessel Prepare",
    "header": "## The Cavity Precedes the Flame",
    "content": "A vessel is what holds. Not what it looks like. Not what it weighs. What it holds."
  }' \
  | jq '{ original_words, expanded_words, meta: { ms, retrieved_neighbors, saturated_terms_blocked } }'
```
Expected:
- 3 retrieved neighbors with non-empty slugs
- saturated_terms_blocked list populated (≥ 5 terms based on saturation map)
- expanded_words > original_words but reasonable (not 4× pure bloat)

**Step 4: Commit**

```bash
git add workers/src/routes/expand-v2.ts workers/src/index.ts
git commit -m "feat(expand-v2): /expand/v2/section endpoint with retrieval-grounded prompt"
```

---

## Task 8: Implement programmatic saturation enforcement

**Files:**
- Modify: `workers/src/routes/expand-v2.ts` (replace `enforceSaturationCap` stub with real logic)
- Test: `workers/src/routes/expand-v2.test.ts`

**Step 1: Write the failing test**

```typescript
import { enforceSaturationCap } from './expand-v2';
import { SATURATION_TERMS } from '../lib/saturation-terms';

test('strips sentences that newly introduce a saturated term', () => {
  const original = 'The fire is the substrate. Containment matters.';
  const expanded = 'The fire is the substrate. The kha-ba-la triad organizes this. Containment matters.';
  const saturated = ['kha-ba-la'];
  const result = enforceSaturationCap(expanded, original, saturated);
  expect(result).not.toContain('kha-ba-la');
  expect(result).toContain('Containment matters');
});

test('keeps saturated terms that were ALREADY in the source section', () => {
  const original = 'The kha-ba-la triad organizes consciousness.';
  const expanded = 'The kha-ba-la triad organizes consciousness. Each leg of kha-ba-la has its function.';
  const saturated = ['kha-ba-la'];
  const result = enforceSaturationCap(expanded, original, saturated);
  // The original kha-ba-la stays; the model can re-reference it in the expansion since it was source-introduced
  expect(result).toContain('kha-ba-la');
});
```

**Step 2: Implement real enforcement**

```typescript
function enforceSaturationCap(
  expandedText: string,
  originalText: string,
  saturatedTerms: string[],
): string {
  if (saturatedTerms.length === 0) return expandedText;

  const sentencesIn = expandedText.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];

  for (const sentence of sentencesIn) {
    let introducesSaturated = false;
    for (const termKey of saturatedTerms) {
      // For each saturated term, check if this sentence introduces it
      // AND the original source section did NOT already contain it.
      const term = SATURATION_TERMS.find((t) => t.key === termKey);
      if (!term) continue;
      const inSentence = term.patterns.some((p) =>
        new RegExp(`\\b${escapeRegex(p)}\\b`, 'i').test(sentence),
      );
      const inOriginal = term.patterns.some((p) =>
        new RegExp(`\\b${escapeRegex(p)}\\b`, 'i').test(originalText),
      );
      if (inSentence && !inOriginal) {
        introducesSaturated = true;
        break;
      }
    }
    if (!introducesSaturated) kept.push(sentence);
  }
  return kept.join(' ');
}

function escapeRegex(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}
```

**Step 3: Update handler call signature**

In `handleExpandV2Section`, change:
```typescript
const finalContent = enforceSaturationCap(stripped, saturatedTerms);
```
to:
```typescript
const finalContent = enforceSaturationCap(stripped, body.content, saturatedTerms);
```

**Step 4: Run tests + deploy + verify**

```bash
cd workers && bun test src/routes/expand-v2.test.ts
bunx wrangler deploy
```
Expected: tests pass, deploy succeeds.

**Step 5: Commit**

```bash
git add workers/src/routes/expand-v2.ts workers/src/routes/expand-v2.test.ts
git commit -m "feat(expand-v2): programmatic saturation enforcement at sentence level"
```

---

## Task 9: Client orchestrator (expand-v2-posts.ts)

**Files:**
- Create: `workers/scripts/expand-v2-posts.ts` (mirrors `expand-posts.ts`, hits `/expand/v2/section`)

**Step 1: Write the orchestrator**

Clone `workers/scripts/expand-posts.ts`. Change:
- BASE endpoint from `/expand/section` to `/expand/v2/section`
- Add per-section reporting of `retrieved_neighbors` and `saturated_terms_blocked` to the summary
- Lower the no-shrink guard from 1.5× to 1.2× (since v2 is expected to grow less aggressively — quality > quantity)
- Add `--audit` mode that runs ONE post and prints a detailed report including which sentences were stripped by enforceSaturationCap

**Step 2: Smoke test on one post**

```bash
cd workers && bun scripts/expand-v2-posts.ts --slug=the-devil-in-the-detail --audit
```
Expected:
- Section-by-section progress
- For each section: 3 retrieved neighbors (slug + score), N sentences stripped by saturation enforcement
- Final post: expansion ratio (probably 1.5-2.5×, not 4×)
- No new occurrences of saturated terms beyond what was already in the source

**Step 3: Commit**

```bash
git add workers/scripts/expand-v2-posts.ts
git commit -m "feat(expand-v2): client orchestrator with retrieval reporting + audit mode"
```

---

## Task 10: A/B comparison on one bloated post

**Step 1: Pick the post with the worst v1 bloat**

```bash
cd workers && bun scripts/compute-saturation.ts --per-post 2>/dev/null \
  | jq 'sort_by(-.saturated_density) | .[0:5]'
```
(This requires adding a `--per-post` mode to compute-saturation.ts — see Task 11.)

**Step 2: Run v2 on that post in audit mode**

```bash
cd workers && bun scripts/expand-v2-posts.ts --slug=<worst-offender> --audit > /tmp/v2-audit.log
```

**Step 3: Compare repetition density**

Write a small comparison script that counts saturated-term occurrences in v1 (current on disk) vs v2 (the audit output):

```bash
python3 -c "
import re
v1 = open('src/content/posts/<slug>.md').read()
v2 = open('/tmp/v2-audit.log').read()  # parse out expanded sections
# count occurrences of each saturated term in v1 vs v2
# print delta table
"
```
Expected: v2 has significantly lower per-term frequency for saturated anchors.

**Step 4: If quality holds, document the comparison**

Create `docs/v2-expansion-quality-comparison.md` showing before/after counts for 3-5 worst-offender posts.

**Step 5: Commit**

```bash
git add docs/v2-expansion-quality-comparison.md
git commit -m "docs(expand-v2): quality comparison vs v1 on worst-offender posts"
```

---

## Task 11: Optional — add per-post saturation density to compute-saturation

**Files:**
- Modify: `workers/scripts/compute-saturation.ts`

Add a `--per-post` flag that outputs per-post saturation density (saturated term occurrences / total words) so we can rank posts by bloat severity. Used in Task 10 to pick the worst offender automatically.

---

## Task 12: Re-process the 30 bg-agent posts (only after Tasks 1–10 are green)

**This is the BIG step. Do NOT do this until Tasks 1–10 are green and the A/B comparison shows v2 produces substantively better content.**

**Step 1: Backup the v1 expanded content**

```bash
cd /Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog
git tag pre-expand-v2-restore -m "snapshot of v1 expansion output before v2 re-processing"
git push --tags origin
```

**Step 2: Re-process all 30 bg-agent posts via /expand/v2/section**

```bash
cd workers && bun scripts/expand-v2-posts.ts --all
```

**Step 3: Spot-check 5 random posts**

Read 5 randomly-chosen re-processed posts. Verify:
- Repetition density is lower than v1
- Cross-post connections feel earned (specific passage references, not name-drops)
- Voice is consistent with non-expanded posts (vessel-prepare, hyperbolic-consciousness)

**Step 4: Run the build to catch any schema breaks**

```bash
bun run build
```

**Step 5: Commit + push**

```bash
git add src/content/posts/
git commit -m "content(expand-v2): re-process 30 bg-agent posts via retrieval-grounded expansion"
git push origin main
```

---

## Acceptance criteria

The plan is complete when:

- [ ] `bun workers/scripts/compute-saturation.ts` produces a saturation map showing the user's flagged anchors as `saturated`
- [ ] `/test/saturation` returns the map from R2
- [ ] `/test/retrieve` returns 3 neighbor passages with real `passage_text`
- [ ] `/expand/v2/section` returns expanded content with `meta.retrieved_neighbors` populated and `meta.saturated_terms_blocked` showing the blacklist
- [ ] Spot-check A/B on at least one post shows lower saturated-term density in v2 vs v1
- [ ] The full corpus reprocessing (Task 12) preserves voice + reduces repetition

## Open questions

1. **Saturation thresholds** are currently set at 25/75 occurrences across 125 posts. These are a first guess — they should be tuned based on the empirical saturation map output in Task 2.
2. **Reranker quality** — `nemotron-mini-4b` is the cheap model. If reranker scores look unreliable in Task 4, swap to `meta/llama-3.3-70b-instruct` for the rerank step (more expensive but better judgment).
3. **Recursive expansion** — should we apply v2 to ALL 125 posts or only the 30 bg-agent ones? The 95 hand-authored posts may not benefit. Recommend: bg-agent posts only.
4. **Sentence-level saturation enforcement is conservative** — it strips entire sentences that introduce a saturated term. Could be over-aggressive on borderline-relevant uses. A future refinement: only strip if the sentence is ≥50% saturated-term overlap with no other content claims.

---

## Notes for the executor

- The existing `workers/src/lib/nim.ts`, `workers/src/lib/routing.ts`, `workers/src/lib/retrieve.ts` (new), and `workers/src/lib/saturation-terms.ts` (new) should be the only new library files. All other work is in `workers/src/routes/` and `workers/scripts/`.
- The v1 `/expand/section` endpoint stays in place for now. Once v2 is validated, deprecate v1 in a follow-up PR.
- The bg-agent loop (`workers/scripts/expand-loop.sh`) should be paused before Task 12 to avoid v1/v2 racing each other on the same posts.

