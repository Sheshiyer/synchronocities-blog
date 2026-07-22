/**
 * Unit tests for the /chat bounded tool-use loop (CHAT_TOOLS feature flag).
 *
 * All NIM traffic is mocked at globalThis.fetch; Cloudflare bindings
 * (CACHE KV, CORPUS_INDEX Vectorize, ARTIFACTS R2) are in-memory fakes.
 * Covered:
 *   1. CHAT_TOOLS=0 bypasses planning entirely (legacy single-pass)
 *   2. No-tool-call planning → SSE output identical to flag-off
 *   3. Tool-call path executes and appends results to the final context
 *   4. Hard cap: max 3 tool executions across 2 planning rounds
 *   5. Malformed tool arguments handled gracefully (stream still completes)
 */

import { test, expect, beforeEach, afterEach } from 'bun:test';
import { handleChat } from './chat';
import type { Env } from '../index';

// ─── Fakes ──────────────────────────────────────────────────────────────────

const EMB_VEC = new Array(1024).fill(0.01);

const KNN_MATCHES = [
  { id: 'post-a', score: 0.9, metadata: { title: 'Post A', excerpt: 'Excerpt about inner fire.' } },
  { id: 'post-b', score: 0.8, metadata: { title: 'Post B', excerpt: 'Excerpt about cavities.' } },
];

function makeEnv(chatTools: string | undefined): Env {
  const kvStore = new Map<string, string>();
  return {
    NVIDIA_API_KEY: 'test-key',
    NIM_BASE_URL: 'https://nim.test/v1',
    NIM_EMBED_MODEL: 'embed-model',
    NIM_CHAT_MODEL: 'chat-model',
    NIM_RERANK_MODEL: 'rerank-model',
    NIM_CLUSTER_LABEL_MODEL: 'label-model',
    NIM_SAFETY_MODEL: 'safety-model',
    CORPUS_VERSION: '1',
    CHAT_TOOLS: chatTools,
    CACHE: {
      get: async (k: string) => kvStore.get(k) ?? null,
      put: async (k: string, v: string) => void kvStore.set(k, v),
    } as unknown as KVNamespace,
    CORPUS_INDEX: {
      query: async () => ({ matches: KNN_MATCHES, count: KNN_MATCHES.length }),
      getByIds: async (ids: string[]) =>
        ids.map((id) => ({ id, values: EMB_VEC, metadata: { title: `Title ${id}` } })),
    } as unknown as VectorizeIndex,
    ARTIFACTS: {
      get: async () => null,
    } as unknown as R2Bucket,
  } as unknown as Env;
}

const fakeCtx = {
  waitUntil(p: Promise<unknown>) {
    void p.catch(() => {});
  },
} as unknown as ExecutionContext;

let ipCounter = 0;
function makeRequest(query: string): Request {
  ipCounter++;
  return new Request('https://worker.test/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.9.8.${ipCounter}` },
    body: JSON.stringify({ query }),
  });
}

// ─── NIM fetch mock ─────────────────────────────────────────────────────────

interface ToolCallSpec {
  id: string;
  name: string;
  arguments: string;
}

let planningResponses: Array<{ content: string | null; tool_calls?: ToolCallSpec[] }> = [];
let planningRequests: Array<Record<string, unknown>> = [];
let streamRequests: Array<{ messages: Array<{ role: string; content: string }> }> = [];

function completion(content: string | null, toolCalls?: ToolCallSpec[]) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content,
          ...(toolCalls
            ? {
                tool_calls: toolCalls.map((c) => ({
                  id: c.id,
                  type: 'function',
                  function: { name: c.name, arguments: c.arguments },
                })),
              }
            : {}),
        },
        finish_reason: toolCalls ? 'tool_calls' : 'stop',
      },
    ],
  };
}

function jsonRes(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseRes(tokens: string[]): Response {
  const frames =
    tokens.map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`).join('') +
    'data: [DONE]\n\n';
  return new Response(frames, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  planningResponses = [];
  planningRequests = [];
  streamRequests = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (url.endsWith('/embeddings')) {
      const inputs = body.input as string[];
      return jsonRes({ data: inputs.map((_, i) => ({ index: i, embedding: EMB_VEC })), model: body.model });
    }

    if (url.endsWith('/chat/completions')) {
      // Final grounded stream
      if (body.stream === true) {
        streamRequests.push(body as never);
        return sseRes(['Hello ', 'world']);
      }
      // Tool-planning round (has tools schema)
      if (Array.isArray(body.tools)) {
        planningRequests.push(body);
        const planned = planningResponses.shift() ?? { content: 'passages suffice' };
        return jsonRes(completion(planned.content, planned.tool_calls));
      }
      // Safety check
      if (body.model === 'safety-model') {
        return jsonRes(completion('{"User Safety": "safe"}'));
      }
      // Rerank (LLM-as-judge): passage 0 best, passage 1 worst
      if (body.model === 'rerank-model') {
        return jsonRes(completion('9,1'));
      }
      return jsonRes(completion('plain'));
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

test('CHAT_TOOLS=0 bypasses planning entirely', async () => {
  // If planning DID run, this response would trigger a tool call — proving bypass.
  planningResponses = [
    { content: null, tool_calls: [{ id: 'c1', name: 'corpus_search', arguments: '{"query":"x"}' }] },
  ];
  const res = await handleChat(makeRequest('what is inner fire?'), makeEnv('0'), fakeCtx);
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(planningRequests.length).toBe(0);
  expect(text).toContain('event: citations');
  expect(text).toContain('event: token');
  expect(text).toContain('event: done');
  expect(text).not.toContain('event: tool');
});

test('no-tool-call planning → SSE output identical to flag-off', async () => {
  planningResponses = [{ content: 'The retrieved passages suffice.' }]; // no tool_calls

  const off = await handleChat(makeRequest('what is inner fire?'), makeEnv('0'), fakeCtx);
  const on = await handleChat(makeRequest('what is inner fire?'), makeEnv('1'), fakeCtx);

  const normalize = (s: string) => s.replace(/"ms":\d+/g, '"ms":X');
  const offText = normalize(await off.text());
  const onText = normalize(await on.text());

  expect(planningRequests.length).toBe(1); // planning ran…
  expect(onText).not.toContain('event: tool'); // …but emitted nothing
  expect(onText).toBe(offText); // byte-identical modulo timing
});

test('tool-call path executes corpus_search and appends results to context', async () => {
  planningResponses = [
    { content: null, tool_calls: [{ id: 'c1', name: 'corpus_search', arguments: '{"query":"antar agni"}' }] },
  ];
  const res = await handleChat(makeRequest('what is inner fire?'), makeEnv('1'), fakeCtx);
  const text = await res.text();

  // Tool start/done events wrap the execution
  expect(text).toContain('event: tool');
  expect(text).toContain('"name":"corpus_search"');
  expect(text).toContain('"status":"start"');
  expect(text).toContain('"status":"done"');
  expect(text).toContain('"results":2');

  // Event order: tool → citations → token → done
  expect(text.indexOf('event: tool')).toBeLessThan(text.indexOf('event: citations'));
  expect(text.indexOf('event: citations')).toBeLessThan(text.indexOf('event: token'));

  // The final grounded stream received the tool results in its context
  expect(streamRequests.length).toBe(1);
  const finalUser = streamRequests[0]!.messages.filter((m) => m.role === 'user').pop()!.content;
  expect(finalUser).toContain('Additional retrieval results from tools');
  expect(finalUser).toContain('corpus_search');
  expect(finalUser).toContain('post-a');
});

test('cap enforcement: max 3 tool calls across 2 planning rounds', async () => {
  planningResponses = [
    {
      content: null,
      tool_calls: [
        { id: 'c1', name: 'corpus_search', arguments: '{"query":"one"}' },
        { id: 'c2', name: 'corpus_search', arguments: '{"query":"two"}' },
      ],
    },
    {
      content: null,
      tool_calls: [
        { id: 'c3', name: 'corpus_search', arguments: '{"query":"three"}' },
        { id: 'c4', name: 'corpus_search', arguments: '{"query":"four"}' }, // must be rejected
      ],
    },
  ];
  const res = await handleChat(makeRequest('compare three concepts'), makeEnv('1'), fakeCtx);
  const text = await res.text();

  expect(planningRequests.length).toBe(2); // both rounds ran
  const doneCount = (text.match(/"status":"done"/g) ?? []).length;
  expect(doneCount).toBe(3); // 4th call rejected by the hard cap
  expect(text).toContain('event: done'); // stream still completed
});

test('malformed tool arguments handled — stream still completes', async () => {
  planningResponses = [
    { content: null, tool_calls: [{ id: 'c1', name: 'corpus_search', arguments: '{not valid json' }] },
  ];
  const res = await handleChat(makeRequest('what is inner fire?'), makeEnv('1'), fakeCtx);
  expect(res.status).toBe(200);
  const text = await res.text();

  expect(text).toContain('event: tool'); // execution attempted, failed gracefully
  expect(text).toContain('"status":"done"');
  expect(text).toContain('event: token'); // final answer still streamed
  expect(text).toContain('event: done');

  // The malformed-args error rides into the context as a tool result
  const finalUser = streamRequests[0]!.messages.filter((m) => m.role === 'user').pop()!.content;
  expect(finalUser).toContain('malformed tool arguments');
});
