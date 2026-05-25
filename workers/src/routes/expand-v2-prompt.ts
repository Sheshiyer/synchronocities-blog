/**
 * Prompt layer for /expand/v2/section.
 *
 * Pure string construction — no Worker bindings, no network. Task 7 will
 * wire these into a route handler; Task 8 will enforce saturation on
 * the output programmatically.
 *
 * THREE structural differences from the v1 expand prompt — do not
 * undo these without re-reading docs/plans/2026-05-25-expand-v2-retrieval-grounded.md:
 *   1. No "corpus concepts to connect" list baked into the system prompt.
 *      v1's bloat came from pre-suggesting brand-anchor vocabulary; v2
 *      replaces that with retrieved neighbor passages at runtime.
 *   2. The saturation blacklist is injected by the USER prompt at request
 *      time (from the R2 saturation map), not hard-coded here.
 *   3. No 4× length quota. The user prompt says "deepen with specific
 *      evidence" and explicitly disclaims a minimum word count.
 */

/**
 * System prompt for /expand/v2/section.
 *
 * See module JSDoc for the three structural differences from v1. The
 * voice exemplar paragraph and the forbidden-words list are verbatim
 * from the plan and load-bearing — do not paraphrase.
 */
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

/**
 * Assemble the per-request user prompt for /expand/v2/section.
 *
 * Deterministic: same input → byte-identical output. No timestamps,
 * no random IDs.
 *
 * Special cases:
 *   - `neighbors` empty → renders a "no neighbors retrieved" marker
 *     instead of an empty passage block. This should be rare in
 *     practice (retrieveNeighbors normally returns top-k) but the
 *     prompt must remain well-formed if it happens.
 *   - `saturatedTerms` empty → renders "(none — all terms available)".
 *
 * `passage_text` is NOT truncated here — retrieve.ts already caps body
 * excerpts at ~500 chars upstream.
 */
/**
 * Shape buildUserPrompt accepts per neighbor. Compatible with the
 * `Neighbor` type from `../lib/retrieve.ts` (which adds a `score` field
 * we ignore here) so Task 7 can pass `Neighbor[]` directly without
 * conversion.
 */
export interface PromptNeighbor {
  slug: string;
  title: string;
  passage_text: string;
  /** Optional — present on retrieve.Neighbor, not used by the prompt. */
  score?: number;
}

/** ASCII number-word for small counts; falls back to digits beyond 5. */
const COUNT_WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'] as const;

/**
 * Sanitize a metadata field that will be interpolated into a passage block
 * header. Closes two prompt-injection vectors:
 *   - Embedded newlines that could synthesize a new "--- RETRIEVED PASSAGE …"
 *     block (structural attack).
 *   - Embedded `---` runs that could visually impersonate the block
 *     delimiter on a single line (semantic confusion).
 *
 * Slug and title are always single-line in the corpus, so collapsing both
 * is lossless. Passage_text is multi-line by design and is NOT sanitized
 * — the visible block boundaries are the ones buildUserPrompt emits.
 */
function singleLine(s: string): string {
  return s
    .replace(/[\r\n]+/g, ' ')
    .replace(/-{3,}/g, '—')
    .trim();
}

export function buildUserPrompt(args: {
  postTitle: string;
  sectionHeader: string;
  sectionContent: string;
  neighbors: PromptNeighbor[];
  saturatedTerms: string[];
}): string {
  const { postTitle, sectionHeader, sectionContent, neighbors, saturatedTerms } = args;

  const neighborBlock =
    neighbors.length > 0
      ? neighbors
          .map(
            (n, i) =>
              `--- RETRIEVED PASSAGE ${i + 1} (from post '${singleLine(n.slug)}', titled "${singleLine(n.title)}") ---\n${n.passage_text}\n`,
          )
          .join('\n')
      : "(no neighbors retrieved — proceed with the section's own internal evidence only)";

  const saturatedList =
    saturatedTerms.length > 0 ? saturatedTerms.join(', ') : '(none — all terms available)';

  // Use a number-word that matches the actual neighbor count so the model
  // is never told "THREE" when it actually sees 1, 2, or 5 passages. Falls
  // back to a numeric form for unusual counts. Empty case renders cleanly.
  const passageCountWord =
    neighbors.length === 0
      ? 'NO'
      : (COUNT_WORDS[neighbors.length] ?? String(neighbors.length));
  const passagesIntro =
    neighbors.length === 0
      ? "RETRIEVED PASSAGES — none returned for this section. Proceed using the section's own internal evidence."
      : `${passageCountWord} RETRIEVED PASSAGE${neighbors.length === 1 ? '' : 'S'} from neighboring posts in this corpus, semantically similar to the section you're deepening. Use these as triangulation material — make at most ONE specific reference per passage if it serves the argument.`;

  return `Post title: ${postTitle}

Section header (for context only — do NOT include in your output): ${sectionHeader}

${passagesIntro}

${neighborBlock}

SATURATED TERMS (already over-used corpus-wide — do NOT introduce in this expansion):
${saturatedList}

SECTION TO DEEPEN:
${sectionContent}

Now deepen the section by adding specific evidence and concrete claims. Start immediately with the first paragraph of expanded prose. No header, no preamble.`;
}
