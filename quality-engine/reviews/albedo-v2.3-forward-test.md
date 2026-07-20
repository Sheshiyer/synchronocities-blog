# Albedo v2.3 Fresh-Agent Forward Test

**Grammar tested:** `Albedo Epistemic Grammar — Noesis Writer Skill v2.3.0`  
**Evaluation inputs:** the canonical grammar and the three named raw source posts only  
**Leakage control:** no Nigredo/Albedo audits, calibration manifests, rationales, ledgers, schemas, scripts, or other review artifacts informed the substantive judgments below

## Executive verdict

| Probe | Verdict | Reason |
|:---|:---:|:---|
| Grammar usability | **PASS** | The two-axis grammar produced determinate atomic decisions without averaging a paragraph into one verdict. |
| Decorative-math rejection | **PASS** | “Non-Euclidean” fails the structural-consequence and provenance locks and is rejected as `DECORATIVE`; the Vimshottari numeral error is separately rejected as `WRONG`. |
| House-model preservation | **PASS** | The Kha-Ba-La structure is preserved as a coherent house model, with a nearby Noesis-frame declaration rather than an irrelevant demand for empirical proof. |

Overall result: **PASS (3/3)**.

## 1. `judgement-recollection-in-pai.md`: “non-Euclidean”

### Exact source excerpt

> Pai delivered the Aeon between limestone cliffs and rice paddies. The landscape itself was non-Euclidean — paths that appeared straight curved back on themselves. Distances were deceptive. A mountain that seemed thirty minutes away took three hours to reach. Space didn't behave according to the mental map.

### Atomic decisions

| ID | Exact claim | Claim mode | Evidence status | Math role | Remediation |
|:---|:---|:---|:---|:---|:---|
| J1 | “Pai delivered the Aeon between limestone cliffs and rice paddies.” | `HOUSE-MODEL` | `MODE-CONFLATED` | `NONE` | `R-REMODE + R-MODEL` |
| J2 | “The landscape itself was non-Euclidean” | `DECLARED-METAPHOR` | `MODE-CONFLATED` | `DECORATIVE` | `R-SPLIT + R-METAPHOR + R-DELETE` (preferred), or `R-MATH` if retained |
| J3 | “paths that appeared straight curved back on themselves. Distances were deceptive. A mountain that seemed thirty minutes away took three hours to reach.” | `DIRECT-OBSERVATION` | `VERIFIED` | `NONE` | `KEEP` |
| J4 | “Space didn't behave according to the mental map.” | `DECLARED-METAPHOR` | `MODE-CONFLATED` | `NONE` | `R-METAPHOR` |

J1 is a tarot interpretation of a situated event, not a literal event claim. It can be retained by declaring the interpretive frame. J3 is a local narrative observation: the narrator, Pai landscape, paths, mountain, estimated travel time, and actual elapsed time supply the situated vantage and limited scope. It does not justify a formal claim about geometry.

J2's actual literary function is analogy, but the copula “was” presents the mathematical description literally. No nearby “as if,” “metaphorically,” or equivalent boundary declares it non-literal, so the failure is `MODE-CONFLATED`, not a passing `DECLARED-METAPHOR + DECLARED` pair.

### Load-bearing mathematics locks

| Lock | Result | Rationale |
|:---|:---:|:---|
| Correctness | **NOT DEMONSTRATED** | Paths looking straight, looping, and defeating distance estimates do not by themselves establish a non-Euclidean metric or geometry. This is insufficient for correctness, though not enough to adjudicate a formal geometry as demonstrably false. |
| Structural consequence | **FAIL** | Removing “non-Euclidean” leaves the travel observation and the paragraph's mental-map thesis intact. |
| Provenance | **FAIL** | No definition, measurement, formula, source, or reproducible derivation connects the terrain report to non-Euclidean geometry. |

Result: `DECORATIVE`. Structural consequence fails decisively, and the absent provenance independently blocks `LOAD-BEARING`. `WRONG` is reserved here for a demonstrated mathematical falsehood; the present problem is precision-aura without a formal claim trace.

### Recommended repair

Preferred deletion repair:

> Pai delivered the Aeon between limestone cliffs and rice paddies. The landscape defeated the mental map: paths that looked straight curved back, and distances were hard to judge. A mountain that seemed thirty minutes away took three hours to reach.

If the mathematical image is artistically indispensable, declare it:

> Metaphorically, the landscape felt non-Euclidean: paths that looked straight seemed to curve back, and ordinary distance estimates repeatedly failed.

The second version becomes `DECLARED-METAPHOR + DECLARED`, with math role `ANALOGICAL`; no literal geometric inference may follow from it.

## 2. `awareness-isnt-access.md`: Kha-Ba-La structural passage

### Exact source excerpt, lines 23–47

> ---
>
> # Awareness Isn't Access
>
> You can be self-aware and still run the same loop.
>
> Awareness is not access.
>
> Self-consciousness is. Here's the difference.
>
> ## The Distinction
>
> Awareness is Kha without Ba — the observer floating above the pattern, narrating it beautifully, changing nothing.
>
> Self-consciousness is Kha examining Kha. The eye turning on itself. The debugger stepping into its own source code.
>
> One describes. The other intervenes.
>
> ## The Problem
>
> Therapy gave you the narrative. Meditation gave you the gap between stimulus and response. Journaling gave you the vocabulary.
>
> And at 2 AM you still run the same defensive sequence. Same trigger. Same contraction. Same rationalisation afterward.
>
> Better language didn't rewrite the code. It just made the comments more articulate.

### Decision: preserve the cosmology

**Preserve it.** The Kha/Ba distinction is doing legitimate `HOUSE-MODEL` work: it defines an internal vocabulary, distinguishes witnessing from somatic intervention, and derives the “describes/intervenes” contrast consistently. The rest of the raw post extends the same terms rather than contradicting them. Under v2.3, external empirical proof is not the pass condition for a house model; explicit house declaration plus internal coherence is.

The excerpt is coherent but locally under-declared. Its first use should state that Kha and Ba belong to the Noesis house frame. That is an `R-MODEL` boundary repair, not grounds for deleting the cosmology.

| ID | Exact claim | Claim mode | Current status | Target status after repair | Math role | Remediation |
|:---|:---|:---|:---|:---|:---|:---|
| A1 | “Awareness is Kha without Ba” | `HOUSE-MODEL` | `MODE-CONFLATED` | `COHERENT` | `NONE` | `R-MODEL` |
| A2 | “Self-consciousness is Kha examining Kha.” | `HOUSE-MODEL` | `MODE-CONFLATED` | `COHERENT` | `NONE` | `R-MODEL` |
| A3 | “One describes. The other intervenes.” | `HOUSE-MODEL` | `MODE-CONFLATED` | `COHERENT` | `NONE` | `R-MODEL` |
| A4 | “The eye turning on itself. The debugger stepping into its own source code.” | `DECLARED-METAPHOR` | `MODE-CONFLATED` | `DECLARED` | `NONE` | `R-METAPHOR` |
| A5 | “Therapy gave you the narrative. Meditation gave you the gap between stimulus and response. Journaling gave you the vocabulary.” | `EMPIRICAL-CORRELATE` if read literally as a general effect claim | `UNSUPPORTED` | — | `NONE` | `R-SCOPE`, or recast as a situated/example premise |

A5 is deliberately not granted house-model immunity. It is a separable generalization about interventions and must be scoped, sourced, or framed as a hypothetical reader scenario. That separation is evidence that the grammar preserves declared cosmology without allowing adjacent empirical claims to shelter inside it.

### Minimal framing repair

> Within the Noesis Kha-Ba-La house model, Kha names the witnessing function and Ba the somatic vehicle. Awareness is Kha without Ba — the observer above the pattern, able to describe it but not yet intervene in it.

For the imagery, add an explicit analogy marker:

> Self-consciousness is Kha examining Kha: like an eye turning on itself, or a debugger stepping into its own source code.

After those repairs, A1–A3 pass as `HOUSE-MODEL + COHERENT`, while A4 passes independently as `DECLARED-METAPHOR + DECLARED`.

## 3. `sixteen-engines-one-purpose.md`: Vimshottari paragraph

### Exact source excerpt

> **Vimshottari Dasha** provides the long-term timeline: a 120-year planetary cycle divided into periods ruled by specific planets. Where you are in this cycle determines which areas of your chart are active. The 19-year Saturn period has a fundamentally different operating character than the 6-year Venus period.

### Mode separation

| ID | Exact claim | Claim mode | Evidence status | Math role | Remediation |
|:---|:---|:---|:---|:---|:---|
| V1 | “Vimshottari Dasha provides the long-term timeline” | `TRADITIONAL-SOURCE` | `UNSUPPORTED` | `NONE` | `R-ATTRIBUTE + R-SOURCE` |
| V2 | “a 120-year planetary cycle divided into periods ruled by specific planets” | `TRADITIONAL-SOURCE` | `UNSUPPORTED` | `DECORATIVE` provisionally | `R-SOURCE + R-PROVENANCE` |
| V3 | “Where you are in this cycle determines which areas of your chart are active.” | `TRADITIONAL-SOURCE` | `MODE-CONFLATED` | `NONE` | `R-SPLIT + R-ATTRIBUTE + R-SCOPE`; use `R-MODEL` if this is instead a Noesis operating axiom |
| V4 | “The 19-year Saturn period” | `TRADITIONAL-SOURCE` | `UNSUPPORTED` | `DECORATIVE` provisionally | `R-SOURCE + R-PROVENANCE` |
| V5 | “the 6-year Venus period” | `TRADITIONAL-SOURCE` | `MISATTRIBUTED` | `WRONG` | `R-MATH + R-ATTRIBUTE + R-SOURCE` |
| V6 | “has a fundamentally different operating character” | `TRADITIONAL-SOURCE` or `HOUSE-MODEL`, depending intended authorship | `MODE-CONFLATED` | `NONE` | `R-SPLIT + R-REMODE`, then either `R-ATTRIBUTE` or `R-MODEL` |

The passage needs atomic separation because it combines (a) a report about a named traditional timing system, (b) Noesis's operational use of that system, and (c) exact quantities. The post provides no traceable text, lineage, edition, or derivation, so the otherwise standard structural claims remain `UNSUPPORTED` in this artifact until attribution and provenance are supplied. V3 and V6 are not empirical facts merely because they are stated declaratively; they must be reported as a traditional interpretation or declared as Noesis house-model operations.

### Quantitative assessment

| Quantity | Correctness | Structural consequence | Provenance in post | Current math decision |
|:---|:---:|:---:|:---:|:---|
| 120-year full cycle | **PASS** | **PASS** | **FAIL** | Candidate `LOAD-BEARING`, but `DECORATIVE` provisionally under the triple gate until sourced |
| 19-year Saturn period | **PASS** | **PASS** | **FAIL** | Candidate `LOAD-BEARING`, but `DECORATIVE` provisionally until sourced |
| 6-year Venus period | **FAIL** | **PASS** | **FAIL** | `WRONG` |

The standard Vimshottari allocation gives Saturn 19 years and Venus 20 years; the six-year period belongs to the Sun. Thus the paragraph contains both correct and incorrect quantities. They must not be averaged into one status. V5 is `MISATTRIBUTED` because it materially misreports the named traditional system, and its mathematical role is independently `WRONG`.

Correcting the duration does not by itself prove “fundamentally different operating character.” That conclusion must be attributed to the tradition or declared and shown coherent within the Noesis model; it cannot be inferred merely from numerical inequality.

### Recommended repair

> Within the Vimshottari Dasha system, the nine mahadasha periods form a 120-year cycle. Saturn's period is 19 years and Venus's is 20 years; the six-year period belongs to the Sun. In the Noesis house model, a person's current period is interpreted as activating particular areas of the natal chart and as having a distinct operating character.

Add a traceable traditional source for the cycle and period allocations. With that source, the first two sentences can pass as `TRADITIONAL-SOURCE + ATTRIBUTED`, the consequential quantities can become `LOAD-BEARING`, and the final sentence can be evaluated separately as `HOUSE-MODEL + COHERENT`.

## Grammar usability notes

The grammar was operationally usable across all three tests because it enforced four useful separations:

1. A local observation can remain valid while its mathematical gloss fails.
2. A coherent house cosmology can be preserved without being misrepresented as empirical proof.
3. A traditional system's attributed structure can be separated from Noesis's own operational interpretation.
4. Correct quantities, unsupported quantities, and one wrong quantity can receive independent roles and statuses inside one paragraph.

The only recurrent editorial sensitivity is the word “declared”: capitalized house vocabulary or a section called “The Frame” is weaker than the grammar's explicit boundary. A short phrase such as “Within the Noesis Kha-Ba-La house model” resolves that ambiguity without flattening or deleting the model.
