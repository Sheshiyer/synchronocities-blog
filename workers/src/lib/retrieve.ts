/**
 * Per-section retrieval grounding for /expand/v2.
 *
 * Pipeline:
 *   1. Embed the section text (input_type: 'passage')
 *   2. Vectorize kNN query — over-fetch, filter out the source slug
 *   3. LLM-as-judge rerank to top-N
 *   4. Return neighbors with attribution (slug, title, passage_text, score)
 *
 * Why this exists: the v1 /expand endpoint was a naked chat() call with
 * zero retrieval grounding, so the model had nothing to anchor it to
 * neighboring corpus content — hence repeated brand-term bloat. v2 will
 * combine retrieveNeighbors() (this) with the saturation map to constrain
 * expansion to ideas already present in the corpus.
 *
 * Graceful degradation: Vectorize metadata stores both `body_excerpt`
 * (first ~500 chars of cleaned body, populated in Task 5 / CORPUS_VERSION=3)
 * and `excerpt` (author-written). The helper prefers body_excerpt, falls
 * back to excerpt for any legacy/edge-case records, and filters out
 * candidates with no usable text.
 */

import { embed, rerank, type NimConfig } from './nim';

export interface Neighbor {
  slug: string;
  title: string;
  passage_text: string;
  /**
   * Rerank relevance score, 0–10 (higher = more relevant).
   *
   * This is the LLM-as-judge reranker's score, NOT Vectorize's cosine
   * similarity (0..1). The Vectorize score is discarded after reranking
   * because the reranker's judgement is what we actually trust for
   * grounding selection.
   */
  score: number;
  /**
   * Where this passage originated. Populated for vault chunks indexed at
   * CORPUS_VERSION=4 (`noesis | area | resource | project`). Legacy blog
   * vectors written before the v2.1 reindex have this undefined; callers
   * should treat `undefined` as 'blog' for diagnostics.
   */
  source_type?: string;
}

export interface RetrieveOptions {
  /** Initial Vectorize fetch size (before filtering + reranking). Default 12. */
  topKFromVectorize?: number;
  /** Final top-N after rerank. Default 3. */
  finalTopN?: number;
}

export interface RetrieveConfig extends NimConfig {
  NIM_EMBED_MODEL: string;
  NIM_RERANK_MODEL: string;
  CORPUS_INDEX: VectorizeIndex;
}

/**
 * Retrieve top-N corpus neighbors for a section of text, excluding the
 * source post by slug. Returns empty array if no usable candidates exist
 * (e.g. metadata lacks any passage text).
 */
export async function retrieveNeighbors(
  config: RetrieveConfig,
  sectionText: string,
  excludeSlug: string,
  opts: RetrieveOptions = {},
): Promise<Neighbor[]> {
  const topN = opts.finalTopN ?? 3;
  // Floor the candidate pool so reranking always sees more than topN even
  // if a caller passes topKFromVectorize === finalTopN. Without this, the
  // source-slug filter could drop the pool below topN and the reranker
  // would return fewer neighbors than requested.
  const topK = Math.max(opts.topKFromVectorize ?? 12, topN + 5);

  // Empty or whitespace-only section text would hit embed() with an empty
  // string, which NIM rejects with a 400. Return cleanly so the caller's
  // empty-neighbors branch handles it gracefully.
  if (!sectionText.trim()) return [];

  // 1. Embed the section text as a passage.
  //
  // The e5 family caps input at 512 tokens. Section text may run well over
  // that (the post `the-devil-in-the-detail` has 1000+ word sections, ~1500
  // tokens), so a naive call returns NIM 400 "Input length N exceeds
  // maximum allowed token size 512" and the whole pipeline fails.
  //
  // We don't have an in-Worker tokenizer, so we approximate: e5 averages
  // ~3.5–4 chars/token for English prose. A conservative 1800-char cap
  // (~450–510 tokens) keeps us under the limit even on token-dense text
  // (CJK, heavy punctuation, em-dashes — all increase tokens/char). For
  // retrieval grounding the embedding only needs the section's TOPIC
  // signal, not every word, so truncating the long tail is acceptable.
  const EMBED_INPUT_CHAR_CAP = 1800;
  const embedInput =
    sectionText.length > EMBED_INPUT_CHAR_CAP
      ? sectionText.slice(0, EMBED_INPUT_CHAR_CAP)
      : sectionText;
  const [vector] = await embed(config, {
    model: config.NIM_EMBED_MODEL,
    texts: [embedInput],
    input_type: 'passage',
  });
  if (!vector) return [];

  // 2. Vectorize kNN — over-fetch by a few so we can drop the source slug
  //    then take topK candidates for reranking.
  const result = await config.CORPUS_INDEX.query(Array.from(vector), {
    topK: topK + 5,
    returnMetadata: 'all',
    returnValues: false,
  });

  // 3. Filter out the source post, extract usable text.
  //    Prefer body_excerpt (populated as of CORPUS_VERSION=3). Fall back to
  //    excerpt (author-written) for any legacy/edge-case records. Drop
  //    candidates with no usable text so we never feed the reranker empty strings.
  const candidates = result.matches
    .filter((m) => m.metadata?.slug !== excludeSlug)
    .slice(0, topK)
    .map((m) => {
      const md = m.metadata ?? {};
      const passage = String(md.body_excerpt ?? md.excerpt ?? '');
      return {
        slug: String(md.slug ?? ''),
        title: String(md.title ?? ''),
        passage_text: passage,
        score: m.score,
        source_type: md.source_type ? String(md.source_type) : undefined,
      };
    })
    .filter((c) => c.slug && c.passage_text.length > 0);

  if (candidates.length === 0) {
    console.warn(
      `[retrieveNeighbors] zero usable candidates for exclude=${excludeSlug} ` +
        `(Vectorize matches=${result.matches.length}). Metadata may lack body_excerpt/excerpt.`,
    );
    return [];
  }

  // 4. LLM-as-judge rerank to topN
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
      const out: Neighbor = {
        slug: c.slug,
        title: c.title,
        passage_text: c.passage_text,
        score: r.score,
      };
      if (c.source_type) out.source_type = c.source_type;
      return out;
    })
    .filter((x): x is Neighbor => x !== null);
}
