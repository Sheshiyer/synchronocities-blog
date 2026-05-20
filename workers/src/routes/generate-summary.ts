/**
 * POST /generate/summary — auto-generate llm.summary + canonical_questions
 * for a post via the 70B chat model.
 *
 * Request:
 *   {
 *     slug: string,
 *     title: string,
 *     body: string,           // markdown body without frontmatter
 *     excerpt?: string,       // optional author-written excerpt
 *     existingConcepts?: string[]  // to help the model stay on-vocabulary
 *   }
 *
 * Response:
 *   {
 *     slug,
 *     summary: string,            // 3-5 sentences
 *     canonical_questions: string[],  // 4-6 questions
 *     yaml_fragment: string,      // ready-to-paste YAML for the llm: block
 *     meta: { ms, cache, model }
 *   }
 *
 * Uses the chat.summary surface for the actual generation. Two-stage prompt:
 *   1. Summary — declarative 3-5 sentences capturing the essay's load-bearing claims
 *   2. Questions — 4-6 canonical questions the essay answers
 *
 * Single chat call with JSON-mode output, parsed leniently (4 strategies).
 * Cached at endpoint level (30-day TTL — bumping CORPUS_VERSION invalidates).
 */

import type { Env } from '../index';
import { chat } from '../lib/nim';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface SummaryRequest {
  slug: string;
  title: string;
  body: string;
  excerpt?: string;
  existingConcepts?: string[];
}

interface SummaryResponse {
  slug: string;
  summary: string;
  canonical_questions: string[];
  yaml_fragment: string;
  meta: { ms: number; cache: 'hit' | 'miss'; model: string };
}

const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days

const SYSTEM_PROMPT = `You are a precision editor for a long-form blog about consciousness, Vedic systems, and computational frameworks. The author's voice is "The Anatomist Who Sees Fractals" — clinical precision plus structural humor, no spiritual platitudes. Match that register: declarative, specific, technical where appropriate.

Your job: read a post and produce (1) a tight 3-5 sentence summary capturing its load-bearing claims, (2) 4-6 canonical questions the post answers. Both will populate frontmatter for LLM discovery.

Rules:
- Summary: declarative, no hedging, mention specific Sanskrit/technical terms when central
- Questions: phrased as the reader would search them, full questions not phrases
- AVOID these words: journey, healing, manifesting, authentic self, optimization, hacks, tribe
- Return STRICT JSON only: {"summary": "...", "canonical_questions": ["...", "..."]}`;

export async function handleGenerateSummary(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const start = Date.now();

  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }

  let body: SummaryRequest;
  try {
    body = (await request.json()) as SummaryRequest;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.slug || !body.title || !body.body) {
    return Response.json(
      { error: 'slug, title, and body are required' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Cache check — keyed on slug + body hash (so revisions bust the cache)
  const cacheKey = await summaryCacheKey(body.slug, body.body, env.CORPUS_VERSION);
  const cached = await env.CACHE.get(cacheKey);
  if (cached) {
    const cachedResponse = JSON.parse(cached) as SummaryResponse;
    cachedResponse.meta.cache = 'hit';
    cachedResponse.meta.ms = Date.now() - start;
    return Response.json(cachedResponse, { headers: CORS_HEADERS });
  }

  // Build the user prompt
  const userPrompt = buildUserPrompt(body);

  // Generate via chat — direct call (not routing surface) so we can use
  // higher max_tokens than the routing default
  const raw = await chat(env, {
    model: env.NIM_CHAT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 768,
    temperature: 0.3,
    top_p: 0.95,
  });

  const parsed = parseSummaryResponse(raw);
  if (!parsed) {
    return Response.json(
      {
        error: 'failed_to_parse_model_output',
        raw_response: raw.slice(0, 500),
        hint: 'model did not return parseable JSON; try again or shorten the post',
      },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  const yamlFragment = formatYamlFragment(parsed.summary, parsed.canonical_questions);

  const response: SummaryResponse = {
    slug: body.slug,
    summary: parsed.summary,
    canonical_questions: parsed.canonical_questions,
    yaml_fragment: yamlFragment,
    meta: { ms: Date.now() - start, cache: 'miss', model: env.NIM_CHAT_MODEL },
  };

  ctx.waitUntil(
    env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: CACHE_TTL }),
  );

  return Response.json(response, { headers: CORS_HEADERS });
}

function buildUserPrompt(req: SummaryRequest): string {
  const sections: string[] = [`Title: ${req.title}`];
  if (req.excerpt) sections.push(`Author excerpt: ${req.excerpt}`);
  if (req.existingConcepts?.length) {
    sections.push(`Existing tagged concepts: ${req.existingConcepts.join(', ')}`);
  }
  // Truncate body to keep within context — first 6000 chars is plenty for summary
  sections.push(`Body:\n${req.body.slice(0, 6000)}`);
  sections.push('Return JSON: {"summary": "...", "canonical_questions": ["...", "...", "...", "..."]}');
  return sections.join('\n\n');
}

interface ParsedSummary {
  summary: string;
  canonical_questions: string[];
}

function parseSummaryResponse(raw: string): ParsedSummary | null {
  const text = raw.trim();
  // Strategy 1: parse the full text as JSON
  // Strategy 2: find {...} block
  // Strategy 3: extract summary and questions from any JSON-shaped chunk
  for (const candidate of [text, text.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as Partial<ParsedSummary>;
      if (typeof parsed.summary === 'string' && Array.isArray(parsed.canonical_questions)) {
        const questions = parsed.canonical_questions
          .filter((q): q is string => typeof q === 'string' && q.length > 0)
          .slice(0, 8);
        if (questions.length >= 1) {
          return { summary: parsed.summary, canonical_questions: questions };
        }
      }
    } catch {
      // try next strategy
    }
  }
  return null;
}

function formatYamlFragment(summary: string, questions: string[]): string {
  // Match the existing posts' llm: block shape (see reality-compile, etc.)
  const escapedSummary = summary.replace(/\n/g, ' ').trim();
  const questionLines = questions.map((q) => `    - ${escapeYamlString(q)}`).join('\n');
  return `llm:
  summary: >
    ${escapedSummary}
  canonical_questions:
${questionLines}`;
}

function escapeYamlString(s: string): string {
  // If the string contains : or starts with characters that confuse YAML, quote it
  if (/[:#\[\]&*!|>'"%@`]/.test(s) || /^[-?]/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

async function summaryCacheKey(slug: string, body: string, version: string): Promise<string> {
  const bytes = new TextEncoder().encode(body);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `summary:v${version}:${slug}:${hex}`;
}
