/**
 * POST /expand — expand a post's body to ~4× its current length via the
 * 70B chat model.
 *
 * Strategy: split body on `## ` section headers, expand each section
 * independently (parallel fan-out via Promise.allSettled), then stitch.
 * This works around the model's ~4096-token output cap — each section's
 * expansion is bounded but the total post can be much longer.
 *
 * Voice fidelity: the system prompt locks the Anatomist Who Sees Fractals
 * register and enforces the project AVOID list. The prompt explicitly
 * instructs the model to PRESERVE every existing claim (deepen, don't
 * dilute) and to add 1-3 new short paragraphs per section rather than
 * rewriting wholesale.
 *
 * Request:
 *   { slug, title, body, target_multiplier?: number (default 4) }
 *
 * Response:
 *   {
 *     slug, original_words, expanded_words, actual_multiplier,
 *     expanded_body, meta: { ms, model, cache, sections_expanded }
 *   }
 */

import type { Env } from '../index';
import { chat } from '../lib/nim';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface ExpandRequest {
  slug: string;
  title: string;
  body: string;
  target_multiplier?: number;
  /** Skip cache lookup, always regenerate. Cache still written. */
  bypass_cache?: boolean;
}

interface ExpandResponse {
  slug: string;
  original_words: number;
  expanded_words: number;
  actual_multiplier: number;
  expanded_body: string;
  meta: {
    ms: number;
    model: string;
    cache: 'hit' | 'miss';
    sections_expanded: number;
    section_failures: number;
  };
}

const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days

const SYSTEM_PROMPT = `You are expanding ONE section of a long-form essay. Quadruple its length (~4×) while matching the author's tight, declarative voice.

VOICE EXEMPLAR — match this register exactly:

"A vessel is what holds. Not what it looks like. Not what it weighs. What it holds. Antar-agni — the fire of awareness — is not generated. It is the substrate. The work is not ignition. The work is containment. Containment is harder than ignition. Anyone can light something. Holding what was lit, in a vessel shaped to its exact specification, across the full duration of its burning — that is the architecture."

Note: short sentences mixed with longer flowing ones. Sanskrit used as live vocabulary. Specific. Declarative. No spiritual platitudes. No generic transitions.

WHAT TO ADD (be generative — fill the 4× length with these):
1. SPECIFIC EXAMPLES with named entities — "When the Bali Padiyami runs on May 13, 2026..." not "When the ritual is performed..."
2. CROSS-DOMAIN PRECISION — engineering, biology, mathematics analogies that work at the structural level, not surface comparisons
3. HISTORICAL CONTEXT with sources — "In the Atharva Veda, this same operation is named..." not generic gestures
4. EDGE CASES with operational consequences — "What happens when the cleanup misses its window?"
5. INVERTED READING that sharpens the original claim — show the failure mode that proves the principle
6. CONNECTIONS to other concepts in the corpus (pancha-kosha, kha-ba-la, kosha architecture, antar-agni, lorenz-kundli, etc.)

LENGTH TARGET:
- Output MUST be ~4× the input section's word count
- Aim for 5-8 new substantial paragraphs of fresh content per section
- Do not just reformat or break up the original — ADD new material

ABSOLUTELY FORBIDDEN — flag as generic LLM filler:
- "is a testament to" / "is reminiscent of" / "is analogous to" / "is akin to"
- "is also noteworthy" / "also evident" / "is also far-reaching"
- "is intricately linked" / "maintain balance and order"
- "X, or Y" (redundant translations like "sangha, or community")
- "in [discipline] terms" used more than ONCE per section
- "it is important to note" / "interestingly" / "in conclusion"
- "furthermore" / "moreover" / "in addition"

FORBIDDEN WORDS (never use ANY — replace with specific terms):
journey, healing, manifesting, abundance, vibration, authentic self, higher self, optimization, hacks, productivity, tribe, community, admin layer, code well

OUTPUT RULES:
- ONLY the body paragraphs — NO ## header line at the start
- Preserve every code block and Sanskrit term from the input exactly
- Open the section with a short 4-8 word sentence
- Mix sentence lengths — alternate fragments and longer flowing prose
- Bold only load-bearing nouns the rest of the paragraph hangs on

Start your response with the first paragraph of expanded prose. No preamble.`;

export async function handleExpand(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const start = Date.now();

  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: CORS_HEADERS });
  }

  let body: ExpandRequest;
  try {
    body = (await request.json()) as ExpandRequest;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400, headers: CORS_HEADERS });
  }

  if (!body.slug || !body.title || !body.body) {
    return Response.json(
      { error: 'slug, title, and body are required' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const targetMult = body.target_multiplier ?? 4;

  // Cache check — keyed on slug + sha256(body) + target multiplier
  const cacheKey = await expandCacheKey(body.slug, body.body, targetMult, env.CORPUS_VERSION);
  if (!body.bypass_cache) {
    const cached = await env.CACHE.get(cacheKey);
    if (cached) {
      const cachedResponse = JSON.parse(cached) as ExpandResponse;
      cachedResponse.meta.cache = 'hit';
      cachedResponse.meta.ms = Date.now() - start;
      return Response.json(cachedResponse, { headers: CORS_HEADERS });
    }
  }

  // Split body on ## headers, keep header with each section
  const sections = splitSections(body.body);
  const originalWords = countWords(body.body);

  // Expand sections in parallel (5 at a time to respect rate limits)
  const expandedSections: string[] = [];
  let failures = 0;
  const CONCURRENCY = 5;

  for (let i = 0; i < sections.length; i += CONCURRENCY) {
    const batch = sections.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((section) =>
        expandSection(env, body.title, section.header, section.content),
      ),
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j]!;
      const section = batch[j]!;
      if (r.status === 'fulfilled') {
        expandedSections.push(section.header ? `${section.header}\n\n${r.value}` : r.value);
      } else {
        // Fall back to the original section on expansion failure
        failures++;
        expandedSections.push(section.full);
      }
    }
  }

  const expandedBody = expandedSections.join('\n\n');
  const expandedWords = countWords(expandedBody);

  const response: ExpandResponse = {
    slug: body.slug,
    original_words: originalWords,
    expanded_words: expandedWords,
    actual_multiplier: Math.round((expandedWords / Math.max(1, originalWords)) * 100) / 100,
    expanded_body: expandedBody,
    meta: {
      ms: Date.now() - start,
      model: env.NIM_CHAT_MODEL,
      cache: 'miss',
      sections_expanded: sections.length - failures,
      section_failures: failures,
    },
  };

  ctx.waitUntil(
    env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: CACHE_TTL }),
  );

  return Response.json(response, { headers: CORS_HEADERS });
}

// ============================================================================
// Section split — keeps ## headers with their content
// ============================================================================

interface Section {
  header: string; // includes the ## prefix, e.g. "## The Cavity Precedes the Flame"
  content: string;
  full: string; // header + content, for fail-open fallback
}

function splitSections(body: string): Section[] {
  // Split on ## (not ### or higher) at line start
  const lines = body.split('\n');
  const sections: Section[] = [];
  let currentHeader = '';
  let currentContent: string[] = [];

  const flush = () => {
    const content = currentContent.join('\n').trim();
    if (currentHeader || content) {
      const full = currentHeader ? `${currentHeader}\n\n${content}` : content;
      sections.push({ header: currentHeader, content, full });
    }
  };

  for (const line of lines) {
    if (/^##\s+/.test(line) && !line.startsWith('###')) {
      flush();
      currentHeader = line;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  flush();

  return sections.filter((s) => s.header || s.content);
}

async function expandSection(
  env: Env,
  postTitle: string,
  header: string,
  content: string,
): Promise<string> {
  if (!content || content.length < 50) {
    // Section too short to meaningfully expand — return as-is
    return content;
  }

  const userPrompt = `Post title: ${postTitle}

Section header (for context only — DO NOT include in your output): ${header}

Section content to expand (~4× length, preserve everything, deepen with substance not padding):

${content}

Now write the expanded section body. Start immediately with the first paragraph — no header, no preamble.`;

  const raw = await chat(env, {
    model: env.NIM_CHAT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 2800,
    temperature: 0.45,
    top_p: 0.88,
  });

  // Post-process: strip leaked headers + enforce AVOID-list word substitutions
  // (70B llama persistently uses "community" despite explicit prompting).
  return enforceAvoidList(stripLeadingHeaders(raw.trim(), header));
}

/**
 * Word-level enforcement of the project AVOID list. The model has been
 * instructed to avoid these but 70B llama persistently re-introduces
 * "community" and similar tokens. This is a deterministic backstop.
 *
 * Substitutions are context-aware where possible. For ambiguous cases,
 * the replacement is intentionally generic — better to read slightly
 * awkward than to violate the AVOID list.
 */
function enforceAvoidList(text: string): string {
  return text
    // community → lineage / polis / field / tradition / sangha (rotate by context)
    .replace(/\bcommunity\b/gi, (_match, _offset, full) => {
      const ctx = full.toLowerCase();
      if (ctx.includes('polis') || ctx.includes('greek')) return 'polis';
      if (ctx.includes('buddha') || ctx.includes('sangha')) return 'sangha';
      if (ctx.includes('balinese') || ctx.includes('bali')) return 'tradition';
      return 'lineage';
    })
    .replace(/\bcommunities\b/gi, 'lineages')
    // journey → trajectory / arc / operation
    .replace(/\b(spiritual\s+)?journeys?\b/gi, 'trajectory')
    // healing → repair / metabolism / integration
    .replace(/\bhealing\b/gi, 'repair')
    // optimization → tuning / calibration
    .replace(/\boptimi[sz]ation\b/gi, 'calibration')
    .replace(/\boptimi[sz]ing\b/gi, 'tuning')
    .replace(/\boptimi[sz]e\b/gi, 'tune')
    .replace(/\boptimal\b/gi, 'precise')
    // manifesting / abundance / vibration → drop or rephrase
    .replace(/\bmanifesting\b/gi, 'producing')
    .replace(/\babundance\b/gi, 'surplus')
    .replace(/\bvibrations?\b/gi, 'resonance')
    // tribe → lineage
    .replace(/\btribes?\b/gi, 'lineage')
    // tone-pattern strip: "is a testament to" → "demonstrates"
    .replace(/\bis a testament to\b/gi, 'demonstrates')
    .replace(/\bare a testament to\b/gi, 'demonstrate')
    // "X, or Y" redundant translation pattern (best-effort — only catches
    // the specific case "sangha, or community" since we've replaced community)
    .replace(/sangha,\s*or\s+sangha/gi, 'sangha')
    .replace(/polis,\s*or\s+polis/gi, 'polis');
}

function stripLeadingHeaders(text: string, originalHeader: string): string {
  const lines = text.split('\n');
  const headerText = originalHeader.replace(/^#+\s+/, '').trim().toLowerCase();
  let i = 0;
  while (i < lines.length && i < 5) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    // Strip if it's a markdown header
    if (/^#+\s+/.test(trimmed)) {
      i++;
      continue;
    }
    // Strip if it's the original header text without markdown syntax
    if (trimmed.toLowerCase().replace(/[*_]/g, '').trim() === headerText) {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i).join('\n').trim();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function expandCacheKey(
  slug: string,
  body: string,
  multiplier: number,
  version: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(body);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `expand:v${version}:${slug}:m${multiplier}:${hex}`;
}
