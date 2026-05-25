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
 * Graceful degradation: as of Task 4, Vectorize metadata stores `excerpt`
 * (author-written) but not `body_excerpt`. The helper prefers body_excerpt,
 * falls back to excerpt, and filters out candidates with no usable text.
 * Task 5 will reindex to populate body_excerpt for richer grounding.
 */

import { embed, rerank, type NimConfig } from './nim';

export interface Neighbor {
  slug: string;
  title: string;
  passage_text: string;
  score: number;
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
  const topK = opts.topKFromVectorize ?? 12;
  const topN = opts.finalTopN ?? 3;

  // 1. Embed the section text as a passage
  const [vector] = await embed(config, {
    model: config.NIM_EMBED_MODEL,
    texts: [sectionText],
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
  //    Prefer body_excerpt (Task 5 will populate). Fall back to excerpt
  //    (author-written, already in the index). Drop candidates with no
  //    usable text so we never feed the reranker empty strings.
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
      return {
        slug: c.slug,
        title: c.title,
        passage_text: c.passage_text,
        score: r.score,
      };
    })
    .filter((x): x is Neighbor => x !== null);
}
