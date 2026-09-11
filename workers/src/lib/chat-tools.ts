/**
 * lib/chat-tools.ts — bounded tool-use loop for /chat (feature flag: CHAT_TOOLS).
 *
 * When CHAT_TOOLS=1, chat.ts runs ONE tool-planning round (non-streaming
 * chatWithTools call) between retrieval and the final grounded stream. The
 * planner sees the user query + a summary of the already-retrieved passages
 * and may call up to three tools, all backed by the SAME server-side code
 * paths as the existing HTTP surfaces (no duplicated logic):
 *
 *   corpus_search(query)  → embed.query → Vectorize kNN → rerank.default  (≈ GET /search)
 *   related_posts(slug)   → getByIds → Vectorize kNN excluding self       (≈ GET /related/:slug)
 *   cluster_map()         → R2 clusters artifact                           (≈ GET /maps/cluster)
 *
 * Hard caps (both enforced, whichever hits first):
 *   • MAX_TOOL_ROUNDS = 2 planning rounds
 *   • MAX_TOOL_CALLS  = 3 tool executions total
 *
 * Failure posture: any planning error, malformed tool arguments, or tool
 * execution error degrades silently to today's single-pass behavior — the
 * final stream always runs. Tool results are appended to the RAG context
 * as compact JSON (each result set is truncated to stay under ~2 KB).
 *
 * Observability: one console.log per execution (name, ms, result count),
 * visible via `wrangler tail`.
 */

import type { Env } from '../index';
import { chatWithTools, type ChatToolCall, type ToolLoopMessage } from './nim';
import { runSurface, withFailOpen, type RoutingConfig } from './routing';

export const MAX_TOOL_ROUNDS = 2;
export const MAX_TOOL_CALLS = 3;

/** Bound on a single planning round-trip; aborts degrade to no-tools. */
const PLANNING_TIMEOUT_MS = 12_000;

/** SSE-visible event emitted around each tool execution. */
export interface ToolEvent {
  name: string;
  status: 'start' | 'done';
  ms?: number;
  results?: number;
  error?: string;
}

export interface ToolLoopOutcome {
  /** Start/done pairs in execution order; empty when nothing ran. */
  events: ToolEvent[];
  /** Context section to append to the final RAG prompt; '' when nothing ran. */
  contextBlock: string;
  planningMs: number;
}

// ============================================================================
// TOOL SCHEMAS (OpenAI function-calling format)
// ============================================================================

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'corpus_search',
      description:
        'Semantic search across the blog corpus. Use when the retrieved passages miss an aspect of the question, or the user asks about a different topic than what was retrieved.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query, phrased for semantic retrieval.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'related_posts',
      description:
        'Find posts most similar to a given post slug. Use when the user asks "what else is like X", "related reading", or references a specific post by name.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'The post slug (lowercase, hyphenated).' },
        },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cluster_map',
      description:
        'Get the concept-cluster map of the whole corpus (cluster labels, sizes, top concepts). Use for corpus-level questions: "what themes exist", "how is the corpus organized".',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// ============================================================================
// MAIN LOOP
// ============================================================================

const PLANNER_SYSTEM = `You are a retrieval planner for a blog-corpus chat assistant. The corpus covers consciousness research, contemplative systems, and technical essays on this blog — NOT general knowledge, cooking, weather, sports, or everyday life.

Given the user's question and the passages already retrieved, decide whether calling a tool would materially improve the answer.

Decision rules (apply in order):
1. If the question asks about the STRUCTURE or ORGANIZATION of the whole corpus ("what themes exist", "how is the corpus organized", "main themes across all posts"), call cluster_map — the retrieved passages are excerpts, not a corpus-wide map.
2. If the question references a specific post by name or asks "what else is like X", call related_posts.
3. If the question is about a topic clearly OUTSIDE the corpus domain (baking, weather, sports, general chitchat, personal advice), call NO tools. The corpus cannot help these.
4. If the retrieved passages already contain a direct answer or enough context, call NO tools.
5. Only if the retrieved passages clearly miss a distinct aspect of an IN-DOMAIN question, call corpus_search.

Prefer at most one tool call. Err on the side of NOT calling tools.`;

/**
 * Run the bounded tool-planning loop. Never throws — any failure returns an
 * empty outcome so the caller falls back to single-pass behavior.
 *
 * @param retrievedSummary  short text summary of the passages already
 *                          retrieved (titles + truncated excerpts)
 */
export async function runChatToolLoop(
  env: Env,
  ctx: ExecutionContext,
  query: string,
  retrievedSummary: string,
): Promise<ToolLoopOutcome> {
  const empty: ToolLoopOutcome = { events: [], contextBlock: '', planningMs: 0 };
  const start = Date.now();

  try {
    const messages: ToolLoopMessage[] = [
      { role: 'system', content: PLANNER_SYSTEM },
      {
        role: 'user',
        content: `Question: ${query}\n\nAlready-retrieved passages:\n${retrievedSummary}`,
      },
    ];

    const events: ToolEvent[] = [];
    const executedResults: Array<{ name: string; content: string }> = [];
    let totalCalls = 0;

    for (let round = 0; round < MAX_TOOL_ROUNDS && totalCalls < MAX_TOOL_CALLS; round++) {
      const planned = await chatWithTools(env, {
        model: env.NIM_CHAT_MODEL,
        messages,
        tools: TOOL_SCHEMAS,
        tool_choice: 'auto',
        max_tokens: 256,
        temperature: 0,
        signal: AbortSignal.timeout(PLANNING_TIMEOUT_MS),
      });

      if (planned.tool_calls.length === 0) break;

      const executedCalls: ChatToolCall[] = [];
      const toolMessages: ToolLoopMessage[] = [];

      for (const call of planned.tool_calls) {
        if (totalCalls >= MAX_TOOL_CALLS) break; // hard cap — reject the rest
        totalCalls++;
        executedCalls.push(call);

        events.push({ name: call.function.name, status: 'start' });
        const callStart = Date.now();
        let result: { content: string; count: number };
        let callError: string | undefined;
        try {
          result = await executeTool(env, ctx, call);
        } catch (err) {
          callError = err instanceof Error ? err.message : String(err);
          console.error(`[chat-tools] ${call.function.name} threw: ${callError}`);
          result = { content: JSON.stringify({ error: 'tool execution failed' }), count: 0 };
        }
        const ms = Date.now() - callStart;
        console.log(
          `[chat-tools] ${call.function.name} ${ms}ms results=${result.count}${callError ? ` error=${callError}` : ''}`,
        );
        events.push({
          name: call.function.name,
          status: 'done',
          ms,
          results: result.count,
          ...(callError ? { error: callError } : {}),
        });

        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: result.content });
        executedResults.push({ name: call.function.name, content: result.content });
      }

      // Feed executions back for the next planning round (if any). Only the
      // executed calls go on the assistant frame so the tools protocol stays
      // valid (every tool_call has a matching tool message).
      messages.push({ role: 'assistant', content: planned.content || null, tool_calls: executedCalls });
      messages.push(...toolMessages);
    }

    if (executedResults.length === 0) {
      return { events: [], contextBlock: '', planningMs: Date.now() - start };
    }

    const contextBlock =
      'Additional retrieval results from tools:\n' +
      executedResults.map((r) => `${r.name}: ${r.content}`).join('\n');

    return { events, contextBlock, planningMs: Date.now() - start };
  } catch (err) {
    // Planning failure (NIM error, timeout, abort) → silent fallback.
    console.error(
      '[chat-tools] planning failed, falling back to single-pass:',
      err instanceof Error ? err.message : String(err),
    );
    return empty;
  }
}

// ============================================================================
// TOOL DISPATCH
// ============================================================================

async function executeTool(
  env: Env,
  ctx: ExecutionContext,
  call: ChatToolCall,
): Promise<{ content: string; count: number }> {
  let args: Record<string, unknown> = {};
  try {
    args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
  } catch {
    console.error(`[chat-tools] malformed tool arguments for ${call.function.name}`);
    return { content: '{"error":"malformed tool arguments"}', count: 0 };
  }

  switch (call.function.name) {
    case 'corpus_search': {
      const q = typeof args.query === 'string' ? args.query.trim().slice(0, 500) : '';
      if (!q) return { content: '{"error":"query required"}', count: 0 };
      return execCorpusSearch(env, ctx, q);
    }
    case 'related_posts': {
      const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
      return execRelatedPosts(env, slug);
    }
    case 'cluster_map':
      return execClusterMap(env);
    default:
      return { content: JSON.stringify({ error: `unknown tool: ${call.function.name}` }), count: 0 };
  }
}

// ============================================================================
// TOOL IMPLEMENTATIONS — mirror the existing HTTP surfaces, reusing the
// same lib primitives (runSurface / Vectorize / R2). Results are compact
// JSON sized for a prompt: ≤5 entries, titles ≤120 chars, snippets ≤160.
// ============================================================================

async function execCorpusSearch(
  env: Env,
  ctx: ExecutionContext,
  query: string,
): Promise<{ content: string; count: number }> {
  const config: RoutingConfig = env;

  const vectors = await runSurface('embed.query', { texts: [query] }, config, { ctx });
  const queryVec = vectors[0];
  if (!queryVec) throw new Error('embedding failed');

  const knn = await env.CORPUS_INDEX.query(Array.from(queryVec), {
    topK: 8,
    returnValues: false,
    returnMetadata: 'all',
  });
  if (knn.matches.length === 0) return { content: '{"results":[]}', count: 0 };

  const passages = knn.matches.map((m) => {
    const md = (m.metadata ?? {}) as Record<string, string>;
    return md.excerpt ? `${md.title ?? m.id}: ${md.excerpt}` : (md.title ?? m.id);
  });

  const ranked = await withFailOpen(
    runSurface('rerank.default', { query, passages, top_n: 5 }, config, { ctx }),
    knn.matches.slice(0, 5).map((m, i) => ({ index: i, score: m.score * 10, passage: passages[i] ?? '' })),
    'chat-tools-search-rerank',
  );

  const results = ranked.slice(0, 5).map((r) => {
    const match = knn.matches[r.index];
    if (!match) return null;
    const md = (match.metadata ?? {}) as Record<string, string>;
    return {
      slug: match.id,
      title: (md.title ?? match.id).slice(0, 120),
      snippet: (md.excerpt ?? '').slice(0, 160),
      score: round3(match.score),
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  return { content: JSON.stringify({ results }), count: results.length };
}

async function execRelatedPosts(env: Env, slug: string): Promise<{ content: string; count: number }> {
  if (!slug || /[^a-z0-9-]/.test(slug)) {
    return { content: '{"error":"invalid slug"}', count: 0 };
  }

  const fetched = await env.CORPUS_INDEX.getByIds([slug]);
  const sourceVector = fetched[0]?.values;
  if (!sourceVector) {
    return { content: JSON.stringify({ error: 'slug not found in index', slug }), count: 0 };
  }

  const knn = await env.CORPUS_INDEX.query(sourceVector, {
    topK: 6,
    returnValues: false,
    returnMetadata: 'all',
  });

  const related = knn.matches
    .filter((m) => m.id !== slug)
    .slice(0, 5)
    .map((m) => {
      const md = (m.metadata ?? {}) as Record<string, string>;
      return {
        slug: m.id,
        title: (md.title ?? m.id).slice(0, 120),
        snippet: (md.excerpt ?? '').slice(0, 160),
        similarity: round3(m.score),
      };
    });

  return { content: JSON.stringify({ slug, related }), count: related.length };
}

async function execClusterMap(env: Env): Promise<{ content: string; count: number }> {
  const obj = await env.ARTIFACTS.get(`clusters-v${env.CORPUS_VERSION}.json`);
  if (!obj) return { content: '{"error":"no cluster artifact yet"}', count: 0 };

  const artifact = JSON.parse(await obj.text()) as {
    total_posts?: number;
    clusters?: Array<{ label: string; post_count: number; top_concepts?: string[] }>;
  };

  const clusters = (artifact.clusters ?? []).slice(0, 12).map((c) => ({
    label: c.label,
    post_count: c.post_count,
    top_concepts: (c.top_concepts ?? []).slice(0, 4),
  }));

  return {
    content: JSON.stringify({ total_posts: artifact.total_posts ?? 0, clusters }),
    count: clusters.length,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
