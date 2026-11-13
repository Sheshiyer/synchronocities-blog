# Fool's Wisdom Grounding Gate — v2.3 Compatibility Layer

**Compatibility version:** v2.3.0

**Original framework:** v2.2.0, Kha-Ba-La / Selemene Engine / *A Fool's Wisdom* (Steven A. Young)

**Canonical grammar:** [`albedo-epistemic-grammar.md`](albedo-epistemic-grammar.md)

## Contents

1. [Canonical relationship](#1-canonical-relationship)
2. [Historical basis](#2-historical-basis)
3. [Transmutation protocol](#3-transmutation-protocol)
4. [Compatibility gates](#4-compatibility-gates)
5. [v2.2 historical taxonomy](#5-v22-historical-taxonomy)
6. [Recode patterns](#6-recode-patterns)
7. [Legacy traces](#7-legacy-traces)

## 1. Canonical Relationship

The Fool's Wisdom Grounding Gate (FWGG) remains the epistemic audit and transmutation **workflow**. As of v2.3, it no longer defines the claim taxonomy. Load and apply the [Albedo Epistemic Grammar](albedo-epistemic-grammar.md) before running this gate.

If this file, an old trace, or v2.2 wording conflicts with the canonical grammar, the canonical grammar wins. In particular:

- Classify every atomic claim on two independent axes: **claim mode + evidence status**.
- Use only the seven frozen claim modes and eight frozen statuses in the canonical grammar.
- Never infer a status from a mode. No claim passes by mode alone.
- Do not grant house cosmology blanket immunity. A `HOUSE-MODEL` passes only when explicitly declared and internally coherent.
- Do not reject a claim merely because it cites institutional authority. Test whether the source supports the exact empirical or historical claim.
- Preserve traditional knowledge through accurate attribution, not empirical proof demands.
- Treat remediation codes as actions, never as verdicts or statuses.
- Classify mathematics independently with `NONE`, `LOAD-BEARING`, `ANALOGICAL`, `DECORATIVE`, or `WRONG`.

The v2.2 vocabulary is retained below only to interpret legacy documents.

## 2. Historical Basis

FWGG began as an epistemic deconditioning layer alongside brand-voice drift detection. Its durable insight remains: a post can sound exactly like the Anatomist while hiding unsupported authority, silent model changes, counterfeit provenance, or decorative mathematics.

### 2.1 Four source traditions

The v2.2 gate drew its editorial questions from four traditions:

| Tradition | Historical contribution | v2.3 treatment |
|:---|:---|:---|
| Vedic | Situated observation, cyclic time, consciousness as substrate | Attribute textual or lineage claims as `TRADITIONAL-SOURCE`; declare Noesis adaptations as `HOUSE-MODEL` or `DERIVED-SYNTHESIS` |
| Hermetic | Mind-first framing and correspondence across scales | Attribute inherited formulations; classify new cross-scale mappings internally as Noesis synthesis and mark the public interpretive boundary honestly |
| Alchemical | *Solve et coagula* and deletion-before-addition | Retain as the transmutation workflow, not as evidence for external claims |
| Tychonic | Observational primacy, situated frames, and model comparison | Use as a methodological prompt; evaluate each historical, empirical, or house-model claim on its own evidence |

These traditions inform Noesis. They do not create pass-by-association.

**Historical vault sources** (load for framework provenance; do not cite “the vault” in reader-facing output):

- `/Volumes/madara/2026/Projects/tryambakam-noesis/cosmo-align-workspace/integrations/vedic-hermetic-alchemical-tycho-integration-matrix.md`
- `/Volumes/madara/2026/Projects/tryambakam-noesis/cosmo-align-workspace/book-analyses/fools-wisdom-fractal-analysis.md`

### 2.2 Installed-belief prompts

v2.2 used five “installed beliefs” from Young as automatic failure detectors. v2.3 preserves them as **audit prompts**, not pre-decided statuses:

1. Is mathematics being confused with the thing modeled?
2. Is direct observation being dismissed without examining its limits?
3. Is a source name replacing evidence or method?
4. Is a metaphysical premise being presented as an empirical result?
5. Is a mechanistic or meaningful cosmology being presented without declaring its mode?

Answer by classifying the exact claim. Agreement or disagreement with a belief never supplies the status.

## 3. Transmutation Protocol

### 3.1 NIGREDO — Claim Inventory

Extract every factual, observational, empirical, traditional, historical, house-model, synthetic, and metaphorical claim. Split mixed sentences into atomic rows.

Preserve every existing v2.2 `*-nigredo-audit.md` as an immutable historical artifact. Do not overwrite it, append v2.3 fields to it, or reuse its path.

Write the v2.3 inventory to `{slug}-albedo-ledger.json`:

```json
{
  "schema_version": "2.3",
  "ledger_state": "RECERTIFIED",
  "post": "example.md",
  "source_path": "src/content/posts/example.md",
  "source_sha256": "64-character lowercase sha256",
  "legacy_audit_path": "quality-engine/audits/nigredo/example.md-nigredo-audit.md",
  "claims": [
    {
      "id": "C001",
      "anchor": {
        "line_start": 42,
        "line_end": 42,
        "quote": "Verbatim smallest sufficient span"
      },
      "claim_mode": "DIRECT-OBSERVATION",
      "claim_status": "VERIFIED",
      "remediation_codes": ["KEEP"],
      "requires_review": false,
      "math": {
        "role": "NONE",
        "load_bearing": false,
        "locks": {
          "correctness": "NOT-APPLICABLE",
          "consequence": "NOT-APPLICABLE",
          "provenance": "NOT-APPLICABLE"
        },
        "evidence_eligible": false
      },
      "rationale": "Observation, source, derivation, or declaration trace.",
      "legacy": {
        "anchor": "L42",
        "quote": "Historical v2.2 quote",
        "type": "science",
        "verdict": "GROUNDED-OBSERVATIONAL",
        "load_bearing": false,
        "note": "Historical v2.2 note preserved verbatim."
      }
    }
  ]
}
```

Rules:

- Use the mode-specific pass matrix in the canonical grammar.
- Apply a math role to each row; use `NONE` when absent.
- Inventory claims, not taboo topics. There is no Big Bang, black-hole, neuroscience, heliocentrism, or house-vocabulary watch-list verdict.
- Preserve quotations verbatim and line references against the audited file.
- When migrating an old trace, reference its path through `legacy_audit_path`; preserve the original row in `legacy` without modifying the old file.

### 3.2 ALBEDO — Dissolution and Reveal

Record at the head of the transmutation trace:

1. **Load-bearing thesis:** the single claim the post cannot survive without.
2. **Failure structure:** each row with `UNSUPPORTED`, `CONTRADICTED`, `MISATTRIBUTED`, or `MODE-CONFLATED`, plus any `DECORATIVE` or `WRONG` math.
3. **Mode boundaries:** sentences that must be split before evidence can be judged.
4. **Gold beneath the dross:** the observation, attributed teaching, coherent house model, or traceable synthesis the failing wording was attempting to carry.

A passing mode never cancels a failing status. A passing status outside that mode's pass set is also a gate failure.

### 3.3 CITRINITAS — Surgical Remediation

Apply the canonical remediation codes to the failed rows.

- Preserve frontmatter exactly unless the operator explicitly authorizes metadata changes.
- Preserve topic and Anatomist voice.
- Prefer deletion for nonessential failures.
- Recode load-bearing failures without changing the thesis silently.
- Introduce no new unsupported claims.
- Attribute traditions faithfully instead of forcing empirical language onto them.
- Mark house models explicitly and repair their internal logic; do not call coherence “proof.”
- Trace every derived ingredient and declare Noesis authorship.
- Keep declared analogy when useful; remove literal mechanisms or predictions smuggled through it.
- Every edit must trace to an Albedo ledger claim row and one or more remediation codes.

### 3.4 RUBEDO — Integration and Verification

Re-run the full writing-quality suite and both compatibility gates in Section 4. Write `{slug}-transmutation-trace.md` with:

- the ALBEDO diagnosis;
- before → after text for each remediated claim;
- final mode, status, evidence trace, math role, and remediation code;
- gate results and unresolved rows;
- one final verdict.

| Verdict | Meaning |
|:---|:---|
| `TRANSMUTED` | Every claim is in a mode-specific pass pair, all math roles pass, frontmatter is preserved, and the other writing gates remain clean |
| `PARTIAL` | The post improved, but every residual failure is enumerated and the post is not approved as v2.3-clean |
| `ESCALATE-TO-MANUAL` | A thesis-level conflict, irreducible source ambiguity, synthesis-authorship conflict, repeated misattribution, or frontmatter constraint prevents surgical repair |

Reaching the autoregressive iteration limit never converts a failing row into a pass. Mark the section for manual review.

## 4. Compatibility Gates

### 4.1 `albedo_claim_grammar_valid`

Pass only when every atomic claim has one of these pairs:

| Mode | Passing status |
|:---|:---|
| `DIRECT-OBSERVATION` | `VERIFIED` |
| `EMPIRICAL-CORRELATE` | `VERIFIED` |
| `TRADITIONAL-SOURCE` | `ATTRIBUTED` |
| `HISTORICAL-CLAIM` | `ATTRIBUTED` or `VERIFIED` |
| `HOUSE-MODEL` | `COHERENT` |
| `DERIVED-SYNTHESIS` | `COHERENT` or `VERIFIED` |
| `DECLARED-METAPHOR` | `DECLARED` |

The evidence conditions in the canonical grammar are part of the gate. Matching labels without their evidence trace does not pass.

### 4.2 `math_three_locks_passed`

Pass math rows only when:

- role is `NONE`; or
- role is `ANALOGICAL` and the claim is `DECLARED-METAPHOR + DECLARED`; or
- role is `LOAD-BEARING` and correctness, structural consequence, and provenance all pass.

`DECORATIVE` and `WRONG` fail. A number is consequential only when removing or changing it alters the thesis, inference, prediction, procedure, calculation, or downstream code.

## 5. v2.2 Historical Taxonomy

v2.2 assigned one of six science verdicts and one of three math verdicts. That design coupled kind-of-claim, evidence quality, cosmological preference, and remediation. v2.3 separates them.

| Legacy verdict | Historical intent | v2.3 compatibility ruling |
|:---|:---|:---|
| `ALIGNED` | House vocabulary or cosmology supported the frame | Reclassify by actual function; never auto-pass |
| `GROUNDED-OBSERVATIONAL` | Direct observation or an openly labeled model | Split into `DIRECT-OBSERVATION`, `HOUSE-MODEL`, or `DECLARED-METAPHOR` |
| `AUTHORITY-BORROWED` | Institution name substituted for support | Classify the underlying empirical, historical, or traditional claim; a real method-matched source may pass |
| `CONTESTED-AS-FACT` | A disputed model was stated as settled | Use `MODE-CONFLATED` only when the prose actually hides the mode or inflates certainty; no topic is pre-flagged |
| `FABRICATED` | Citation, quotation, statistic, or fact was counterfeit | Use `MISATTRIBUTED`, `UNSUPPORTED`, or `CONTRADICTED` according to the failure |
| `INVERTED` | Matter-first causality conflicted with the house cosmology | Cosmological disagreement is not a status; test causal evidence and mode framing |
| `INTEGRATED` | Mathematics appeared structurally relevant | Require the full load-bearing triple gate |
| `DECORATIVE` | Mathematics supplied prestige without mechanism | Retain as math role unless it is an explicitly declared analogy |
| `WRONG` | Mathematics was false or misapplied | Retain as math role and correct or remove |

For the complete claim-level mapping, use [Section 8 of the canonical grammar](albedo-epistemic-grammar.md#8-v22-migration).

## 6. Recode Patterns

These pairs calibrate structure, not fixed wording:

| Before | v2.3 diagnosis | Treatment |
|:---|:---|:---|
| “Neuroscience confirms meditation rewires the brain.” | Empirical claim; status depends on the actual source and causal strength | `R-SOURCE + R-SCOPE + R-CAUSE`; report the measured population and outcome, or remove |
| “The Big Bang created the universe 13.8 billion years ago.” | Empirical/model claim, not a watch-list failure | Source and scope the claim; distinguish observation, model inference, and house alternative |
| “The Upaniṣad proves consciousness is fundamental.” | Traditional teaching conflated with empirical proof | `R-SPLIT + R-ATTRIBUTE + R-REMODE`; attribute the teaching, then state any Noesis adoption as house model |
| “As above, so below: the cell is a city.” | Potential declared metaphor | Keep as `DECLARED-METAPHOR + DECLARED` if no literal mechanism follows |
| “The dasha sequence is deterministic arithmetic: 120 years.” | Potentially consequential mathematics | Use `LOAD-BEARING` only with correct sequence, structural consequence, and provenance; otherwise repair or remove |
| “Vedic cycles and toroidal dynamics reveal the Noesis recurrence.” | Potential synthesis laundering | `R-SYNTHESIS`; trace both ingredients and Noesis authorship internally, show the transformation, and mark the public result as an interpretation without attributing it to either source |

## 7. Legacy Traces

Existing v2.2 `*-nigredo-audit.md` and `*-transmutation-trace.md` files remain historical artifacts. Their verdicts do not establish v2.3 compliance.

To migrate a trace:

1. Leave the original files byte-for-byte unchanged.
2. Create `{slug}-albedo-ledger.json` and reference the old audit in `legacy_audit_path`.
3. Split each legacy row into atomic ledger claims where necessary.
4. Add canonical mode, status, evidence trace, math role, remediation, and optional `legacy_verdict` fields to the new ledger.
5. Re-run the mode-specific evidence conditions and math triple gate.
6. Issue a new v2.3 final verdict without overwriting the historical result.

This preserves the genealogy of FWGG while preventing legacy verdicts from overriding the canonical two-axis grammar.
