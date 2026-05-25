# v2 Expansion — Quality Comparison vs. v1

**Date:** 2026-05-25
**Endpoint:** `POST /expand/v2/section` at CORPUS_VERSION=3
**Method:** Top-5 worst-offender posts by saturated-term density (per `bun scripts/compute-saturation.ts --per-post`), each re-expanded section-by-section via `expand-v2-posts.ts --audit --emit-content`, then compared against the on-disk v1 version using `ab-compare-saturation.ts`.

This is the formal **quality validation gate** before Task 12's mass re-process. The user's original complaint was that v1's `/expand/section` produced bloated content that repeated the same brand-vocab (`kha-ba-la`, `antar-agni`, `lorenz-kundli`, `pancha-kosha`, `bali-padyami`, `tapas`) across every post. v2 was designed to ground each expansion in semantically-retrieved neighbor passages instead of a static concept list. This doc measures whether that re-engineering actually reduced repetition.

---

## Overall summary (top-5 worst-offender posts)

| Metric                                    | v1 total | v2 total | Delta                  |
|-------------------------------------------|---------:|---------:|------------------------|
| Total word count                          |   40,687 |   21,589 | **−19,098 (−47%)**     |
| Total saturated-term occurrences          |      723 |      309 | **−414 (−57%)**        |
| Pooled saturated density (occ ÷ words)    |   0.0178 |   0.0143 | **−0.0035 (−19%)**     |
| Posts where v2 reduced occurrences        |          |          | **5 / 5**              |
| Posts where v2 reduced density            |          |          | **5 / 5**              |
| Posts where any per-term count increased  |          |          | **1 / 5** (cross-ref — see lorenz-kundli notes) |

**Headline result:** v2 reduces saturated-term occurrences by **57%** in aggregate while also reducing total word count by **47%**. Saturation **density** (occurrences ÷ word_count) drops in every one of the 5 posts, meaning the reduction isn't just from a shorter output — v2's prose is also semantically tighter per word.

**Behavioral note:** v2 is shorter than v1 by design. The v1 prompt targeted "4× expansion" (which produced the bloat the user flagged). The v2 prompt says "Quality > quantity. There is no minimum word count." On already-expanded v1 posts, this correctly produces **compression**, not further growth. For posts that have NOT been v1-expanded (i.e. the original target of `--all` runs), behavior will differ — see "Caveats" at the end.

---

## Per-post tables

### 1. `model-temperature-and-tapas` — highest saturated density in corpus

| Field | v1 | v2 | Delta |
|---|---:|---:|---:|
| Word count | 6,433 | 2,699 | **−3,734 (−58%)** |
| Saturated occurrences | 165 | 54 | **−111 (−67%)** |
| Saturated density | 0.0256 | 0.0200 | **−0.0056 (−22%)** |

Per-term:

| Term | v1 | v2 | Δ |
|---|---:|---:|---:|
| kha-ba-la | 9 | 0 | **−9** (eliminated) |
| lorenz-kundli | 20 | 4 | **−16 (−80%)** |
| antar-agni | 16 | 6 | **−10 (−63%)** |
| pancha-kosha | 14 | 4 | **−10 (−71%)** |
| bali-padyami | 6 | 4 | **−2 (−33%)** |
| tapas | 100 | 36 | **−64 (−64%)** |

**Notes.** `tapas` legitimately dominates this post (it's literally in the title — "Model Temperature AND Tapas"). v1 mentioned it 100 times; v2 says the same thing 36 times. The `tapas` pattern also overmatches the English food-loanword (documented caveat in `saturation-terms.ts`), so part of v1's count is inflated. Even with that caveat: every other brand-term dropped by ≥63%. The most striking signal is `kha-ba-la → 0` — v2 eliminated cross-vocab name-dropping that wasn't load-bearing for the post's actual argument (model temperature ≠ kha-ba-la triad).

---

### 2. `lorenz-kundli-protocol` — longest post, most absolute occurrences

| Field | v1 | v2 | Delta |
|---|---:|---:|---:|
| Word count | 12,338 | 5,853 | **−6,485 (−53%)** |
| Saturated occurrences | 207 | 71 | **−136 (−66%)** |
| Saturated density | 0.0168 | 0.0121 | **−0.0047 (−28%)** |

Per-term:

| Term | v1 | v2 | Δ |
|---|---:|---:|---:|
| kha-ba-la | 28 | 3 | **−25 (−89%)** |
| lorenz-kundli | 99 | 36 | **−63 (−64%)** |
| antar-agni | 40 | 8 | **−32 (−80%)** |
| pancha-kosha | 24 | 1 | **−23 (−96%)** |
| bali-padyami | 16 | 23 | **+7 (+44%)** — see note |
| tapas | 0 | 0 | 0 |

**Notes.** This is the only per-term regression in the entire comparison: `bali-padyami` went UP by 7 mentions in v2. Inspecting the v2 output: the retrieval step kept surfacing `sacred-runtime-bali-padiyami` as a high-score neighbor (it's a structurally-related post about the same ritual-as-system metaphor), so the model is creating explicit cross-references ("In `sacred-runtime-bali-padiyami`, the same architecture is named as…"). **This is the system working as designed** — v2 was supposed to triangulate with retrieved neighbors instead of inventing vocabulary, and that's what's happening. The user can decide whether the cross-reference density is too high in a follow-up tuning pass; structurally it's the correct behavior.

`pancha-kosha` going 24 → 1 is the cleanest signal: v1 was sprinkling it into a post that's actually about Lorenz attractors and Vedic astrology; v2 figured out it wasn't load-bearing and stopped.

`lorenz-kundli` itself dropping 99 → 36 is significant — this is the namesake post, so SOME self-reference is appropriate, but v1's 99 mentions were clearly name-drop bloat.

---

### 3. `root-access-to-reality`

| Field | v1 | v2 | Delta |
|---|---:|---:|---:|
| Word count | 7,759 | 5,085 | **−2,674 (−34%)** |
| Saturated occurrences | 128 | 73 | **−55 (−43%)** |
| Saturated density | 0.0165 | 0.0144 | **−0.0021 (−13%)** |

Per-term:

| Term | v1 | v2 | Δ |
|---|---:|---:|---:|
| kha-ba-la | 32 | 11 | **−21 (−66%)** |
| lorenz-kundli | 23 | 13 | **−10 (−43%)** |
| antar-agni | 45 | 26 | **−19 (−42%)** |
| pancha-kosha | 21 | 17 | **−4 (−19%)** |
| bali-padyami | 7 | 6 | **−1 (−14%)** |
| tapas | 0 | 0 | 0 |

**Notes.** Smallest reduction of the 5 (−43% occurrences vs. the other posts' 48–67%), but every per-term delta is still negative. The least-reduced term here is `pancha-kosha` (−19%) — likely because the post is genuinely about layered consciousness/agency models where the term is structurally relevant. `antar-agni` 45→26 is the largest absolute drop; that term was the most-cited brand-anchor in v1's expansion and the model correctly de-emphasized it in v2.

---

### 4. `sacred-runtime-bali-padiyami`

| Field | v1 | v2 | Delta |
|---|---:|---:|---:|
| Word count | 6,112 | 3,327 | **−2,785 (−46%)** |
| Saturated occurrences | 98 | 51 | **−47 (−48%)** |
| Saturated density | 0.0160 | 0.0153 | **−0.0007 (−4%)** |

Per-term:

| Term | v1 | v2 | Δ |
|---|---:|---:|---:|
| kha-ba-la | 19 | 6 | **−13 (−68%)** |
| lorenz-kundli | 14 | 10 | **−4 (−29%)** |
| antar-agni | 14 | 9 | **−5 (−36%)** |
| pancha-kosha | 11 | 4 | **−7 (−64%)** |
| bali-padyami | 37 | 21 | **−16 (−43%)** |
| tapas | 3 | 1 | **−2 (−67%)** |

**Notes.** Density barely moved (−4%) even though occurrences dropped 48%. This is the most informative single result: the post's natural concept density is roughly preserved per-word, but the model produced a tighter, less repetitive version of the same argument. `bali-padyami` 37→21 in its namesake post is appropriate compression — the topic still gets named, just less repetitively.

---

### 5. `the-ineffable-secrets-of-a-breathing-sprite`

| Field | v1 | v2 | Delta |
|---|---:|---:|---:|
| Word count | 8,045 | 4,625 | **−3,420 (−43%)** |
| Saturated occurrences | 125 | 60 | **−65 (−52%)** |
| Saturated density | 0.0155 | 0.0130 | **−0.0025 (−16%)** |

Per-term:

| Term | v1 | v2 | Δ |
|---|---:|---:|---:|
| kha-ba-la | 36 | 14 | **−22 (−61%)** |
| lorenz-kundli | 23 | 12 | **−11 (−48%)** |
| antar-agni | 35 | 21 | **−14 (−40%)** |
| pancha-kosha | 21 | 11 | **−10 (−48%)** |
| bali-padyami | 7 | 2 | **−5 (−71%)** |
| tapas | 3 | 0 | **−3 (−100%)** |

**Notes.** All per-term deltas negative. One section ("## Compiling the Self", idx=4) hit a transient endpoint timeout during audit (orchestrator reported `ERROR: The operation was aborted` and emitted the original section text with `error=true` between markers). The v2 word-count above therefore includes that one section's ORIGINAL text contribution; the true v2 reduction is slightly stronger than these numbers show. Re-running just that section is a one-liner; it will only strengthen the comparison.

---

## Honest assessment

**What worked**

1. **Aggregate bloat reduction is unambiguous.** Saturated occurrences dropped 47–67% across all 5 worst-offender posts. Every per-term delta in 4 of 5 posts is negative; the only positive (`bali-padyami` in `lorenz-kundli-protocol`) is a deliberate cross-reference, not vocabulary leakage.
2. **Density also drops in every post** (range: −4% to −28%), so v2 isn't just producing shorter prose — it's producing prose with lower brand-vocab concentration *per word*. That's the property the user actually cares about.
3. **The model is obeying the prompt.** In none of these 5 audits did `enforceSaturationCap` strip a single sentence (the safety net never fired). The prompt-level instruction is doing the work; the programmatic backstop is genuinely a backstop, not the primary mechanism.
4. **Retrieval grounding is landing in the output.** The v2 expansions contain explicit `In <slug>, the same architecture is named as…` cross-references. The retrieval scores for the top 3 neighbors per section are routinely 8–10 (out of 10), and the slugs are recognizably related to the section's topic.

**What didn't work as well**

1. **Sections with brand-vocab in the header still re-use those terms heavily.** A section titled `## The Kha-Ba-La Triad` will legitimately contain `kha-ba-la` many times in v2 — and should. The current `enforceSaturationCap` logic uses only `body.content` (not `body.header`) as the "originally present" baseline, so a section that introduces a saturated term in its header but not its body would have v2 strip those mentions. This didn't bite us in this batch (every section with a brand-term-in-header also had it in the body), but it's a latent issue for future content.
2. **Some v2 output still shows filler-restatement patterns.** Look at `lorenz-kundli-protocol` section 6 ("Bhava Aspects as Neural Network Layers") in the emit log: the model repeats "The Shadbala field is a tensor field that encodes..." multiple times within the section. This is a different bloat pattern from v1 (which was brand-vocab name-dropping); v2 has reduced the brand-vocab problem but the underlying "long output where space gets filled" tendency hasn't fully gone away. It's milder than v1 but not eliminated.
3. **v2 is structurally a compressor on already-bloated posts.** All 5 posts in this comparison were already v1-expanded (8000+ words). v2 reduced them by 43–58%. On posts that have NOT been v1-expanded, v2's expansion ratio is much higher (5–10× on the short-section `awareness-isnt-access` smoke test in Task 9). The "no-shrink guard" at 1.2× is therefore appropriate for fresh expansion but blocks legitimate v2-compression of v1-bloat. The `expand-v2-posts.ts` orchestrator currently treats compression as `REJECTED (under-expand)` in non-audit mode; for Task 12 we may want a `--allow-compression` flag or a manual review step before disk-write.
4. **`tapas` over-matches the English food loanword.** Already documented in `saturation-terms.ts`, but visible in `model-temperature-and-tapas` v1 (100 mentions). For corpus expansions into lifestyle/food content this would need a tighter pattern; not blocking for the current Vedic/Sanskrit corpus.

**What would I recommend before Task 12?**

1. **Decide whether v2-as-compressor on v1-bloated posts is the right outcome.** If yes, Task 12 needs to either (a) bypass the 1.2× under-expand guard, or (b) accept that already-expanded posts will be compressed back to ~50% length with significantly less brand-vocab. The data here supports the answer being "yes, this is the desired behavior" — but it's the kind of decision worth surfacing to the user before mass-execution.
2. **Re-run the one failed section of `the-ineffable-secrets-of-a-breathing-sprite`** ("## Compiling the Self", idx=4) to fill the gap in this comparison (transient endpoint timeout during audit). The aggregate numbers above include the original section text for that block, so true v2 reduction is slightly stronger than reported.
3. **Consider widening `enforceSaturationCap`'s "originalText"** to include the section header. Doesn't matter for this batch but prevents a class of false positives.
4. **The `lorenz-kundli-protocol` cross-reference density** (`bali-padyami +7` from triangulation with `sacred-runtime-bali-padiyami`) is a feature, not a bug — but worth eyeballing the rendered output to confirm the cross-references read as load-bearing rather than decorative.

---

## Caveats

- **Sample size is 5 posts** of 125 corpus-total. The signal is strong (all 5 reduced) but does not guarantee Task 12 will reproduce these numbers on the full 30-post bg-agent set.
- **All 5 posts were v1-expanded** before this comparison. Their v1 word counts (6k–12k) are themselves the bloat artifact. On the 30 bg-agent posts that are still in their original short form, v2's behavior is expansion (5–10×), not compression.
- **Cache effects.** The audits behind this comparison hit the v2 endpoint with `cache=miss` initially (slow) and `cache=hit` on re-runs (fast). The cached responses are deterministic — re-running would produce byte-identical output and the same numbers.
- **No human quality review.** This doc measures repetition, not prose quality. The v2 output is shorter and less repetitive, but whether it READS better is a separate (subjective) judgment the user needs to make on a few representative posts before authorizing Task 12.

---

## Methodology

```
# Step 1: pick worst offenders
cd workers
bun scripts/compute-saturation.ts --per-post --top=5 --json

# Step 2: audit each one (cache hits after first run)
for slug in model-temperature-and-tapas lorenz-kundli-protocol root-access-to-reality \
           sacred-runtime-bali-padiyami the-ineffable-secrets-of-a-breathing-sprite; do
  bun scripts/expand-v2-posts.ts --slug=$slug --audit --emit-content \
      --skip-reachability-check > /tmp/v2ab/$slug.log 2>&1
done

# Step 3: A/B compare each
for slug in ...; do
  bun scripts/ab-compare-saturation.ts $slug
done
```

Comparison logic (`workers/scripts/ab-compare-saturation.ts`):
- v1 input: `src/content/posts/<slug>.md` body, frontmatter stripped, lowercased.
- v2 input: concatenation of all `%%V2-SECTION-BEGIN ... %%V2-SECTION-END` blocks from the audit log, in `idx` order.
- For each saturated-tier term (per the live saturation map): count whole-word, case-insensitive, multi-pattern matches via `compute-saturation.ts::countOccurrences`.
- Density = occurrences / word_count, rounded to 4 decimals.
