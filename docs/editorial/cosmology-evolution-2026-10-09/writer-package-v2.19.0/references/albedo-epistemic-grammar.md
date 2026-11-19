# Albedo Epistemic Grammar — Noesis Writer Skill v2.3.1

**Version:** v2.3.1

**Canonical status:** authoritative for claim classification, evidence, mathematics, and remediation

**Compatibility layer:** [`fools-wisdom-grounding-gate.md`](fools-wisdom-grounding-gate.md)

## Contents

1. [The two axes](#1-the-two-axes)
2. [Claim modes](#2-claim-modes)
3. [Evidence statuses](#3-evidence-statuses)
4. [Pass matrix](#4-mode-specific-pass-matrix)
5. [Derived synthesis](#5-derived-synthesis-and-synthesis-laundering)
6. [Mathematical roles](#6-mathematical-roles)
7. [Remediation](#7-remediation-codes)
8. [Migration](#8-v22-migration)
9. [Edge cases](#9-edge-cases)

This grammar replaces v2.2's single verdict axis. Audit every **atomic claim** on two independent axes:

```text
CLAIM = CLAIM MODE + EVIDENCE STATUS
```

The mode says **what kind of claim is being made**. The status says **whether that claim is adequately supported on its own terms**. Neither axis determines the other.

## 1. The Two Axes

Record one row per atomic claim:

| Field | Required value |
|:---|:---|
| Claim ID | Stable local identifier |
| Exact text | Verbatim claim or the smallest sufficient span |
| Claim mode | One mode from §2 |
| Evidence status | One status from §3 |
| Evidence rationale | Observation record, source, derivation, declaration, and judgment trace |
| Math role | One role from §6; use `NONE` when absent |
| Remediation | One or more §7 codes; use `KEEP` when clean |

Split a sentence when it makes more than one mode of claim. Do not average statuses across a sentence or paragraph.

Serialize new v2.3 audits as `{slug}-albedo-ledger.json`. Existing v2.2 `*-nigredo-audit.md` files are immutable historical traces: reference them from the ledger when useful, but never overwrite or repurpose them.

**Non-negotiable:** statuses never imply claim modes. `VERIFIED` does not mean empirical; `ATTRIBUTED` does not mean traditional; `COHERENT` does not mean house model; and `DECLARED` does not mean metaphor. A pair passes only when it appears in the mode-specific pass set in §4.

## 2. Claim Modes

| Mode | Use when the claim primarily does this | Boundary condition |
|:---|:---|:---|
| `DIRECT-OBSERVATION` | Reports what a situated observer directly noticed, including an instrument reading | Separate the observation from its interpretation; do not universalize beyond the recorded conditions |
| `EMPIRICAL-CORRELATE` | Reports a measured relationship, experiment, estimate, or externally testable causal claim | State population, measure, conditions, uncertainty, and correlation/causation at the strength the source supports |
| `TRADITIONAL-SOURCE` | Reports what a named tradition, text, lineage, or teacher teaches | The claim is about the teaching and its meaning, not empirical proof of the teaching |
| `HISTORICAL-CLAIM` | Asserts or reports a past event, authorship, quotation, date, practice, or reception | Distinguish “source X reports” from “event X occurred” |
| `HOUSE-MODEL` | States a Noesis/Kha-Ba-La model, axiom, vocabulary, or interpretive frame | Declare the house frame explicitly in the internal ledger and frame it honestly for the reader; do not present internal coherence as external proof |
| `DERIVED-SYNTHESIS` | Makes a new Noesis inference by combining identified ingredients | Trace every ingredient and declare Noesis authorship in the internal ledger; mark the interpretive move honestly in public prose |
| `DECLARED-METAPHOR` | Uses a comparison, image, or analogy without asserting literal mechanism | Mark the figurative boundary near the claim; do not extract literal predictions from it |

Choose the narrowest honest mode. Topic does not determine mode: a sentence about neuroscience may be historical, empirical, metaphorical, or a house model depending on what it claims.

## 3. Evidence Statuses

Assign exactly one primary status after choosing the mode.

| Status | Meaning |
|:---|:---|
| `VERIFIED` | The available evidence meets the selected mode's conditions and supports the claim at its stated strength |
| `ATTRIBUTED` | The named source, speaker, text, tradition, quotation, and relevant context are represented accurately |
| `COHERENT` | The declared premises, terms, transformation, and conclusion are internally consistent |
| `DECLARED` | The non-literal or limited claim boundary is explicit enough that no stronger claim is implied |
| `UNSUPPORTED` | Required evidence is absent, too weak, inaccessible, or does not support the claim's strength |
| `CONTRADICTED` | Reliable evidence at the same claim level conflicts with the claim, or the claim is internally inconsistent |
| `MISATTRIBUTED` | Authorship, quotation, source, tradition, date, or provenance is wrong or materially misleading |
| `MODE-CONFLATED` | The prose presents one mode as another, combines inseparable modes, or launders a synthesis as inherited fact |

When more than one failure is visible, use this primary-status order:

1. `MODE-CONFLATED` when the claim boundary itself is dishonest or inseparable.
2. `MISATTRIBUTED` when a stable mode remains but source identity or content is wrong.
3. `CONTRADICTED` when same-level evidence refutes the claim.
4. `UNSUPPORTED` when the needed evidence is merely missing or inadequate.

Capture secondary problems in the evidence note and remediation codes, not by inventing another status.

## 4. Mode-Specific Pass Matrix

All four failure statuses fail in every mode. Positive statuses pass only as follows:

| Claim mode | Passing status set | Minimum evidence conditions |
|:---|:---|:---|
| `DIRECT-OBSERVATION` | `{VERIFIED}` | Name observer or vantage, object noticed, conditions or procedure, and scope. Preserve the distinction between observed signal and interpretation. |
| `EMPIRICAL-CORRELATE` | `{VERIFIED}` | Use a real traceable source or dataset; match its method, population, measures, uncertainty, and causal strength. Authority alone neither passes nor fails. |
| `TRADITIONAL-SOURCE` | `{ATTRIBUTED}` | Name tradition/text/teacher, verify quotation or faithful paraphrase, and distinguish source teaching, translation, and commentary. Empirical proof is not required. |
| `HISTORICAL-CLAIM` | `{ATTRIBUTED, VERIFIED}` | Use `ATTRIBUTED` for “source/person says”; use `VERIFIED` for an asserted event or fact supported by suitable primary evidence or responsible corroboration. |
| `HOUSE-MODEL` | `{COHERENT}` | Explicitly mark the Noesis/house frame in the internal record, define its operative terms, and show internal consistency. Give readers an honest interpretive boundary. Declaration without coherence is insufficient; empirical proof is not required. |
| `DERIVED-SYNTHESIS` | `{COHERENT, VERIFIED}` | Trace passing ingredients and the transformation; declare Noesis authorship internally and the interpretive move publicly. Use `VERIFIED` only when the derivation is reproducible, otherwise `COHERENT` for a valid interpretive synthesis. |
| `DECLARED-METAPHOR` | `{DECLARED}` | Use a nearby metaphor/analogy marker and make no literal causal, numeric, historical, or predictive inference from the comparison. |

Examples of positive statuses outside these sets still fail the gate. A `HOUSE-MODEL + DECLARED` row has named its mode but has not demonstrated coherence. An `EMPIRICAL-CORRELATE + ATTRIBUTED` row has identified a source but has not yet shown that the source supports the empirical claim.

### House-model boundary

House models have no blanket immunity. They pass on **explicit declaration plus internal coherence**, not on alignment with preferred vocabulary and not on empirical proof. If a house model also claims a measured effect or historical origin, split that assertion into an `EMPIRICAL-CORRELATE` or `HISTORICAL-CLAIM` row and test it separately.

### Traditional-source boundary

Protect traditional knowledge through accurate attribution, not through misplaced empirical demands. “The *Śvetāśvatara Upaniṣad* describes…” is tested as a source claim. “This description causes a measurable physiological effect” is a separate empirical claim.

## 5. Derived Synthesis and Synthesis Laundering

A `DERIVED-SYNTHESIS` passes only when its trace contains:

1. Every ingredient as a separate claim with its own mode, passing status, and source or observation trace.
2. The transformation: comparison, mapping, calculation, or inference that produces the new claim.
3. Explicit Noesis authorship in the internal ledger, plus an honest reader-facing transition such as “read here,” “in this essay,” “this suggests,” or another clear interpretive boundary.
4. A conclusion no stronger than the ingredients and transformation permit.

The public artifact does not need to narrate the engine, ledger, prompt, vault, or transmutation mechanics. When the system is not the subject, phrases such as “This is a Noesis synthesis” can become process leakage that displaces the actual inquiry. Audience-appropriate framing is not concealment so long as the prose does not attribute the new conclusion to an ingredient source.

If the ingredients are traced but one fails, mark the synthesis `UNSUPPORTED` or `CONTRADICTED` as appropriate. If the internal trace or authorship is hidden, if the public interpretive boundary is dishonest, or if the new conclusion is attributed to an ingredient source, mark it `MODE-CONFLATED`. This is **synthesis laundering**.

## 6. Mathematical Roles

Assign one role to every mathematical object, term, equation, quantity, ratio, or computational reference.

| Role | Meaning | Gate result |
|:---|:---|:---|
| `NONE` | No mathematical object, term, equation, quantity, ratio, or computational reference appears in the claim | Pass |
| `LOAD-BEARING` | Correct mathematics changes a consequential part of the work and has traceable provenance | Pass only when all three tests below pass |
| `ANALOGICAL` | Mathematics is an explicitly declared comparison, with no literal inference drawn from it | Pass with `DECLARED-METAPHOR + DECLARED` |
| `DECORATIVE` | Mathematics adds precision-aura but no demonstrated structural consequence, or cannot yet satisfy the load-bearing tests | Fail; remove or repair |
| `WRONG` | Definition, operation, mapping, units, or number is demonstrably false or misapplied | Fail; correct or remove |

### Load-bearing triple gate

`LOAD-BEARING` requires **all three**:

1. **Correctness:** definitions, units, operations, mappings, and computed values are correct at the precision claimed.
2. **Structural consequence:** removing the mathematics changes the thesis, inference, prediction, procedure, calculation, or downstream code.
3. **Provenance:** formulas, inputs, constants, measurements, and transformations trace to a source or reproducible Noesis derivation.

If correctness fails, assign `WRONG`. If structural consequence fails, assign `DECORATIVE`. If consequence exists but correctness or provenance is not demonstrated, assign `DECORATIVE` provisionally, set the claim status to `UNSUPPORTED`, and use `R-MATH` or `R-PROVENANCE`.

### Coverage is a separate gate

A valid judgment over an extracted row does not prove that the source was exhaustively extracted. For transmutation and clean/no-op certification, perform a blind raw-source claim pass **before** consulting Nigredo or an existing Albedo ledger, then compare the fresh set with the migrated rows. Schema validity, zero failing rows, and a legacy `CLEAN` verdict certify neither coverage nor cleanliness. Any material source claim missing from the ledger blocks clean certification and routes the post to `PARTIAL` until the gap is repaired. Newly extracted claims must be marked as new coverage findings; never counterfeit a legacy row or provenance record for them.

### Consequential numbers

A number is consequential **only if removing or changing it alters the thesis, inference, prediction, procedure, calculation, or downstream code**. Dates, version labels, line numbers, ornamental ratios, and atmospheric quantities are not consequential merely because they are specific. Consequential numbers require units, context, precision, and provenance.

No named structure—dasha arithmetic, Sri Yantra geometry, 432 Hz, Fibonacci, entropy, a torus, or any other house-favored or scientific form—is load-bearing by definition.

## 7. Remediation Codes

Status diagnoses the claim. Remediation is a separate editorial decision; never use an action word as a status.

| Code | Treatment |
|:---|:---|
| `KEEP` | Retain the claim and its evidence trace |
| `R-SPLIT` | Divide mixed observation, interpretation, history, model, synthesis, or metaphor into atomic claims |
| `R-REMODE` | Reclassify and explicitly frame the claim in the mode it actually supports |
| `R-SCOPE` | Narrow population, time, certainty, causality, or universality to the evidence |
| `R-SOURCE` | Supply a traceable source, dataset, observation record, or primary text |
| `R-ATTRIBUTE` | Correct author, quotation, tradition, translation, date, or context |
| `R-CAUSE` | Replace causal language with the measured relationship, or supply causal evidence |
| `R-MODEL` | Declare the Noesis house frame and repair definitions or internal logic |
| `R-SYNTHESIS` | Trace ingredients and transformation; declare Noesis authorship internally and the interpretive boundary publicly |
| `R-METAPHOR` | Mark the analogy explicitly and remove literal consequences |
| `R-MATH` | Correct definitions, units, operations, mappings, or calculations |
| `R-PROVENANCE` | Trace formulas, inputs, constants, quantities, code, or derivation |
| `R-DELETE` | Remove a nonessential claim that cannot be supported cleanly |
| `R-MANUAL` | Escalate a thesis-level conflict or irreducible source ambiguity |

A failing claim may take more than one code. Example: `EMPIRICAL-CORRELATE + MODE-CONFLATED` may require `R-SPLIT + R-CAUSE + R-SCOPE`.

## 8. v2.2 Migration

The v2.2 verdicts remain valid only as historical trace labels. Migrate them claim by claim:

| v2.2 verdict | v2.3 migration |
|:---|:---|
| `ALIGNED` | Reclassify by function. Common results: `HOUSE-MODEL + COHERENT`, `TRADITIONAL-SOURCE + ATTRIBUTED`, or `DIRECT-OBSERVATION + VERIFIED`. Never auto-pass. |
| `GROUNDED-OBSERVATIONAL` | Split the old combined category: direct report → `DIRECT-OBSERVATION + VERIFIED`; explicit working model → `HOUSE-MODEL + COHERENT`; analogy → `DECLARED-METAPHOR + DECLARED`. |
| `AUTHORITY-BORROWED` | Reclassify the claim. A method-matched source may become `EMPIRICAL-CORRELATE + VERIFIED`; a source merely named becomes `UNSUPPORTED`; a traditional teaching may become `TRADITIONAL-SOURCE + ATTRIBUTED`. Authority is not itself a verdict. |
| `CONTESTED-AS-FACT` | Usually `MODE-CONFLATED` until the prose distinguishes empirical claim, historical report, external model, and house model. Then evaluate evidence normally. No topic watch-list decides status. |
| `FABRICATED` | False quotation/source → `MISATTRIBUTED`; invented unsupported statistic → `UNSUPPORTED`; demonstrably false claim → `CONTRADICTED`. |
| `INVERTED` | Remove cosmological disagreement as an automatic failure. Correlate stated as cause → `EMPIRICAL-CORRELATE + MODE-CONFLATED` or `UNSUPPORTED`; a faithfully described external theory may pass as historical or attributed reporting. |
| `INTEGRATED` (math) | Assign `LOAD-BEARING` only after correctness, structural consequence, and provenance all pass; otherwise `DECORATIVE` or `WRONG`. |
| `DECORATIVE` (math) | Keep `DECORATIVE` unless the comparison is explicitly declared, in which case use `ANALOGICAL`; repair or remove. |
| `WRONG` (math) | Keep `WRONG`; pair the claim with `CONTRADICTED` when the error is demonstrated, otherwise `UNSUPPORTED` pending verification. |

## 9. Edge Cases

| Case | Ruling |
|:---|:---|
| First-person report followed by a universal claim | Split: `DIRECT-OBSERVATION` for the report, `EMPIRICAL-CORRELATE` for the generalization |
| Instrument reading plus interpretation | Reading may be `DIRECT-OBSERVATION`; inferred mechanism is a separate empirical or model claim |
| Traditional cosmology stated as world fact | Use `TRADITIONAL-SOURCE + ATTRIBUTED` only when reporting the teaching; split any literal world claim and evaluate its actual mode |
| House model borrows several traditions | Use `DERIVED-SYNTHESIS`, trace ingredients, and declare Noesis authorship; otherwise synthesis laundering |
| House model predicts a measurement | Model statement may be `HOUSE-MODEL + COHERENT`; prediction result is `EMPIRICAL-CORRELATE` |
| Real study introduced with “studies show” | Not an automatic failure. Verify the actual study and rewrite to its population, measure, limits, and causal strength |
| Disputed scientific topic | No watch-list verdict. Classify the exact claim and test its source and strength |
| Quote used as a metaphor | Split quote provenance (`TRADITIONAL-SOURCE` or `HISTORICAL-CLAIM`) from its application (`DECLARED-METAPHOR`) |
| Conflicting historical sources | Attribute each report; use `VERIFIED` for an asserted event only when the evidence warrants adjudication |
| Translation cannot be checked | `UNSUPPORTED` until a reliable edition or qualified attribution is available; do not invent certainty |
| Declared mathematical metaphor | `DECLARED-METAPHOR + DECLARED`, math role `ANALOGICAL`; no literal numeric or causal inference may follow |
| Correct equation with no argumentative effect | Math role `DECORATIVE`, regardless of prestige or house preference |
| Consequential calculation generated by code | `LOAD-BEARING` requires input provenance, code/version trace, and a reproducible correctness check |
| Synthesis ingredients are sound but authorship is hidden | `DERIVED-SYNTHESIS + MODE-CONFLATED`; apply `R-SYNTHESIS` |
| Meta-critical quotation of a bad claim | Classify the writer's act of reporting separately from the quoted claim; unambiguous critique does not endorse it |

When uncertain, split first. Atomicity resolves most apparent epistemic conflicts.
