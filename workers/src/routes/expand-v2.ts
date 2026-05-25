/**
 * POST /expand/v2/section — retrieval-grounded section expansion.
 *
 * Pipeline:
 *   1. Cache check (KV, keyed on slug + hash(slug|header|content) at CORPUS_VERSION)
 *   2. In parallel: retrieveNeighbors() (embed → Vectorize → rerank → top-3)
 *      and getSaturatedTerms() (R2 saturation map, KV-cached 1h).
 *   3. buildUserPrompt() assembles the deterministic per-request user prompt.
 *   4. chat() with SYSTEM_PROMPT_V2 against env.NIM_CHAT_MODEL.
 *   5. Post-process: strip leaked headers, then run enforceSaturationCap()
 *      (currently a no-op pass-through — Task 8 replaces the body).
 *   6. Cache the response for 30d (ctx.waitUntil, never blocks the response).
 *
 * Response shape is documented inline in `ExpandV2Response`. v1's /expand and
 * /expand/section are untouched.
 *
 * `enforceSaturationCap` is exported so Task 8 can rewrite its body without
 * churning callers and so unit tests can pin the current no-op behavior.
 */

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
    /**
     * Full saturation blacklist that was injected into the user prompt.
     * Snapshot of the current saturation map's `saturated_terms` field.
     */
    saturated_terms: string[];
    /**
     * Terms actually REMOVED from the model output by enforceSaturationCap.
     * Populated by Task 8's sentence-level enforcement; remains [] while the
     * Task 7 pass-through stub is in place. Reserving the field name now
     * means Task 8's schema change is additive only — no cached responses
     * need to be invalidated.
     */
    saturated_terms_blocked: string[];
    cache: 'hit' | 'miss';
  };
}

const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days

/**
 * Read the saturation map from R2 (KV-cached 1h). Falls back to empty list
 * if the map isn't uploaded — the route still functions, just without a
 * blacklist injected into the user prompt.
 */
async function getSaturatedTerms(env: Env): Promise<string[]> {
  // Caller must guard against undefined/empty CORPUS_VERSION before reaching
  // here. We assert it as a defense-in-depth — a missing version would cache
  // every deploy under `saturation:vundefined`, poisoning future reads.
  if (!env.CORPUS_VERSION) {
    console.warn('[expand-v2] getSaturatedTerms called with empty CORPUS_VERSION; returning empty list');
    return [];
  }
  const cacheKey = `saturation:v${env.CORPUS_VERSION}`;
  const cached = await env.CACHE.get(cacheKey);
  let body: string;
  if (cached) {
    body = cached;
  } else {
    const r2Object = await env.ARTIFACTS.get(`saturation/v${env.CORPUS_VERSION}.json`);
    if (!r2Object) {
      console.warn(
        `[expand-v2] saturation map missing for CORPUS_VERSION=${env.CORPUS_VERSION} ` +
          `(r2 key saturation/v${env.CORPUS_VERSION}.json absent); proceeding without blacklist`,
      );
      return [];
    }
    body = await r2Object.text();
    await env.CACHE.put(cacheKey, body, { expirationTtl: 3600 });
  }
  try {
    const map = JSON.parse(body) as { saturated_terms?: string[] };
    return map.saturated_terms ?? [];
  } catch (err) {
    console.warn(`[expand-v2] saturation map JSON parse failed: ${(err as Error).message}`);
    return [];
  }
}

export async function handleExpandV2Section(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { error: 'method_not_allowed' },
      { status: 405, headers: CORS_HEADERS },
    );
  }

  let body: ExpandV2Request;
  try {
    body = (await request.json()) as ExpandV2Request;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400, headers: CORS_HEADERS });
  }

  if (!body.slug || !body.title || body.content === undefined) {
    return Response.json(
      { error: 'slug, title, content required' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Hard guard: refuse to read or write the cache without a CORPUS_VERSION.
  // Without this, a missing binding would funnel every request into the
  // shared key `expand-v2:vundefined:{slug}:{hash}` across deploys —
  // catastrophic cache poisoning.
  if (!env.CORPUS_VERSION) {
    console.error('[expand-v2] CORPUS_VERSION env binding is missing or empty');
    return Response.json(
      { error: 'server_misconfigured', detail: 'CORPUS_VERSION not configured' },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const start = Date.now();

  // Cache check — keyed on (slug, header, content) hash at CORPUS_VERSION
  const sectionHash = await hashContent(
    `${body.slug}|${body.header ?? ''}|${body.content}`,
  );
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

  // Observability — degraded modes are quiet failure modes during the Task 12
  // mass-reprocess (1250 sections). Surface them in Worker logs.
  if (neighbors.length === 0) {
    console.warn(`[expand-v2] zero neighbors retrieved for slug=${body.slug} — prompt will use no-neighbors marker`);
  }
  if (saturatedTerms.length === 0) {
    console.warn(`[expand-v2] empty saturation blacklist (R2 map missing or empty) — prompt will signal "all terms available"`);
  }

  const userPrompt = buildUserPrompt({
    postTitle: body.title,
    sectionHeader: body.header ?? '',
    sectionContent: body.content,
    neighbors,
    saturatedTerms,
  });

  let raw: string;
  try {
    raw = await chat(env, {
      model: env.NIM_CHAT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_V2 },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2800,
      temperature: 0.45,
      top_p: 0.88,
    });
  } catch (err) {
    console.error(`[expand-v2] chat() failed for slug=${body.slug}: ${(err as Error).message}`);
    return Response.json(
      { error: 'upstream_error', detail: 'chat model unreachable or returned malformed response' },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  const stripped = stripLeadingHeader(raw.trim(), body.header ?? '');
  const finalContent = enforceSaturationCap(stripped, saturatedTerms);

  const response: ExpandV2Response = {
    slug: body.slug,
    header: body.header ?? '',
    original_words: countWords(body.content),
    expanded_words: countWords(finalContent),
    expanded_content: finalContent,
    meta: {
      ms: Date.now() - start,
      model: env.NIM_CHAT_MODEL,
      retrieved_neighbors: neighbors.map((n) => ({ slug: n.slug, score: n.score })),
      // Full blacklist injected into the prompt.
      saturated_terms: saturatedTerms,
      // Subset actually removed by enforceSaturationCap. Task 7 stub is a
      // pass-through, so always empty here; Task 8 populates this.
      saturated_terms_blocked: [],
      cache: 'miss',
    },
  };

  ctx.waitUntil(
    env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: CACHE_TTL }),
  );

  return Response.json(response, { headers: CORS_HEADERS });
}

// ============================================================================
// Helpers — exported where Task 8 (or unit tests) need them.
// ============================================================================

/**
 * Strip a leading header (markdown or bare-text repeat of the source header)
 * from a section expansion. Mirrors v1's `stripLeadingHeaders` in
 * `routes/expand.ts` — copied rather than imported to keep v1 untouched.
 */
export function stripLeadingHeader(text: string, originalHeader: string): string {
  const lines = text.split('\n');
  const headerText = originalHeader.replace(/^#+\s+/, '').trim().toLowerCase();
  let i = 0;
  while (i < lines.length && i < 5) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    if (/^#+\s+/.test(trimmed)) {
      i++;
      continue;
    }
    if (
      headerText &&
      trimmed.toLowerCase().replace(/[*_]/g, '').trim() === headerText
    ) {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i).join('\n').trim();
}

/**
 * Programmatic backstop for saturated-term leakage in the model output.
 *
 * Phase 1 (this task, Task 7): no-op pass-through. The user prompt already
 * tells the model not to introduce saturated terms; this hook exists so
 * Task 8 can replace its body with sentence-level enforcement without
 * touching callers.
 *
 * Phase 2 (Task 8): count occurrences vs the source section's baseline and
 * strip sentences that newly introduce a saturated term.
 */
export function enforceSaturationCap(
  text: string,
  _saturatedTerms: string[],
): string {
  return text;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function hashContent(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
