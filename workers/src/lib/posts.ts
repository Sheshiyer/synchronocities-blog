/**
 * Post payload shape and helpers shared between the indexer script and
 * the /embed/batch endpoint.
 *
 * The indexer reads src/content/posts/*.md, parses frontmatter + body,
 * computes a content hash, and POSTs an array of these payloads. The
 * endpoint validates, embeds, and upserts into Vectorize.
 */

export interface PostMetadata {
  slug: string;
  title: string;
  /** Body markdown without frontmatter. May be empty for index-only posts. */
  body: string;
  /** Author-written excerpt, if present. */
  excerpt?: string;
  /** ISO date string. */
  date?: string;
  draft?: boolean;
  hidden?: boolean;
  tags?: string[];
  concepts?: string[];
  kosha?: string;
  /** SHA-256 hex of the body — used for idempotent reindexing. */
  contentHash: string;
  /**
   * Source bucket this record came from. Defaults to 'blog' in the legacy
   * indexer for the 125 published posts. Vault-indexer chunks carry
   * 'noesis' | 'area' | 'resource' | 'project' so retrieval can surface
   * (and downstream code can analyze) source-type diversity.
   */
  source_type?: string;
  /**
   * Absolute path to the source file. For blog posts this is the .md file
   * in src/content/posts. For vault chunks this is the original vault doc
   * path. Stored in metadata for traceability and de-dup across runs.
   */
  source_path?: string;
}

export interface IndexBatchRequest {
  posts: PostMetadata[];
  /** Re-embed even if the content hash is unchanged. */
  force?: boolean;
  /** Max posts dispatched to NIM in parallel within one batch call. */
  concurrency?: number;
}

export interface IndexBatchResponse {
  total: number;
  embedded: number;
  skipped_unchanged: number;
  skipped_draft: number;
  errors: Array<{ slug: string; reason: string }>;
  ms: number;
}

/**
 * Build the text that gets embedded for a given post. Combines title,
 * excerpt, and a body window. Sized to stay within the e5 family's
 * 512-token cap: title + excerpt + first ~1200 chars body ≈ 400 tokens
 * with ~100 token safety margin for tokenizer expansion of CJK/symbols.
 *
 * For better long-document retrieval, switch to chunked embeddings:
 * split body into 400-token chunks, embed each, store as separate
 * vectors with a `parent_slug` metadata field. Out of scope for phase A.
 */
// Dropped from 1200 to 800 after the first vault-index run produced NIM
// 400 errors ("Input length N exceeds maximum allowed token size 512") on
// token-dense content (Sanskrit transliteration, em-dashes, AIPRM exports).
// At ~0.74 tokens/char worst-case, 800 chars of body + ~30 title + ~200
// excerpt ≈ 1030 chars total ≈ 510 tokens worst-case — under the 512-token
// e5 cap. For blog posts (3.5–4 chars/token) this is a 33% smaller embed
// window than before but still captures lede + first paragraph, which is
// the load-bearing chunk for retrieval grounding.
const MAX_BODY_CHARS = 800;
/** Max chars for body_excerpt stored in Vectorize metadata. */
const MAX_BODY_EXCERPT_CHARS = 500;

/**
 * Strip markdown structural noise (headers, link syntax, fenced code blocks,
 * list markers, runs of blank lines) so the resulting text is dense prose
 * suitable for either embedding or rerank-grounding.
 *
 * Shared between buildEmbedText() (window into the body for the embedding
 * vector) and buildVectorMetadata() (body_excerpt stored as metadata so the
 * reranker sees real body content, not the author's marketing excerpt).
 */
export function cleanBodyForEmbedding(body: string): string {
  // Order matters: remove fenced code blocks FIRST so their interior (which
  // may legitimately contain `# comments`, `[brackets]`, or `- list items`
  // as code) is excised whole, not partially mutated by later regexes.
  return body
    .replace(/```[\s\S]*?```/g, '') // code blocks (must run first)
    .replace(/^#+\s+/gm, '') // headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // link text only
    .replace(/^\s*[-*]\s+/gm, '') // list markers
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildEmbedText(post: PostMetadata): string {
  const parts: string[] = [post.title];
  if (post.excerpt) parts.push(post.excerpt);
  if (post.body) {
    const cleanedBody = cleanBodyForEmbedding(post.body);
    parts.push(cleanedBody.slice(0, MAX_BODY_CHARS));
  }
  return parts.join('\n\n');
}

/**
 * Reduce a post's frontmatter to the metadata we store alongside its
 * vector in Vectorize. Keep this lean — Vectorize metadata has byte limits
 * and we don't want to bloat the index.
 */
export function buildVectorMetadata(post: PostMetadata): Record<string, string | number | boolean> {
  const md: Record<string, string | number | boolean> = {
    slug: post.slug,
    title: post.title,
    content_hash: post.contentHash,
  };
  if (post.date) md.date = post.date;
  if (post.kosha) md.kosha = post.kosha;
  if (post.tags?.length) md.tags = post.tags.join(',');
  if (post.concepts?.length) md.concepts = post.concepts.join(',');
  if (post.excerpt) md.excerpt = post.excerpt.slice(0, 500); // keep small
  // First ~500 chars of cleaned body — used as the rerank-grounding passage in
  // /expand/v2 retrieval. Far stronger signal than the marketing excerpt above.
  if (post.body) {
    const cleaned = cleanBodyForEmbedding(post.body);
    if (cleaned.length > 0) md.body_excerpt = cleaned.slice(0, MAX_BODY_EXCERPT_CHARS);
  }
  if (post.source_type) md.source_type = post.source_type;
  if (post.source_path) md.source_path = post.source_path;
  return md;
}

/**
 * KV key for tracking the last-indexed content hash per post slug.
 * Used by /embed/batch for idempotency — only re-embed when the hash changes.
 */
export function postHashCacheKey(slug: string, corpusVersion: string): string {
  return `post-hash:v${corpusVersion}:${slug}`;
}
