# Rubedo Coverage Finding — Albedo v2.3

**Date:** 2026-07-18  
**Gate:** clean/no-op calibration control  
**Verdict:** `PARTIAL` — row recertification is structurally complete, source-to-claim coverage is not certified

## What Rubedo found

The 125 Albedo ledgers pass the deterministic v2.3 row contract: 3,037 migrated claims, zero unresolved review flags, valid anchors for every migrated row, valid mode/status pairs, and valid math-lock states under the corrected contract. That result proves the migrated Nigredo rows were recertified. It does **not** prove that every relevant claim in every source post was extracted.

The distinction became visible when the legacy `CLEAN` control, `200-ok-mental-status-codes.md`, was checked after recertification. Its v2.3 ledger contains six failing rows, invalidating the inherited clean label. An independent reviewer then tested six alternative zero-failure ledgers as possible clean controls:

- `the-fools-satchel.md`
- `you-dont-need-more-frameworks.md`
- `the-sword-of-speech.md`
- `bangkok-initiation-samui-invitation.md`
- `consciousness-legacy-code.md`
- `temperance-compresses-to-essence.md`

None qualified. The reviewer found omitted traditional attributions, undeclared metaphor boundaries, unsupported empirical generalizations, unproven mathematical provenance, or consequential protocol quantities absent from the corresponding ledger. The most important contract defect exposed by the review was also corrected: `DECORATIVE` mathematics may be consequential yet provisionally fail because provenance is absent; it is no longer forced to record `consequence=FAIL` when only provenance fails.

## What remains valid

- The original 125 Nigredo audits remain immutable.
- Every row migrated into the 125 Albedo ledgers received semantic v2.3 classification.
- The pre-transmutation source corpus and the recertified ledger corpus have deterministic SHA-256 manifests.
- The six calibrated source edits remain bounded to recertified findings and reversible.
- Rubedo may issue `PARTIAL` or `ESCALATE-TO-MANUAL`; it may not issue a corpus-wide clean certification.

## Required next Albedo pass

Run a fresh **source-to-claim coverage extraction** rather than another legacy-row normalization:

1. Re-read each raw post without using the Nigredo row list as the extraction boundary.
2. Extract every empirical, traditional, historical, house-model, derived-synthesis, declared-metaphor, and mathematical claim.
3. Compare the fresh set with the existing Albedo ledger and add missing rows with explicit `origin` metadata instead of counterfeit legacy fields.
4. Re-run semantic classification and the corrected three-lock contract.
5. Require an independent coverage reviewer before any post can serve as a clean/no-op control.
6. Rebuild the inventory and corpus seal only after a genuine clean control passes.

Until that pass exists, “125 ledgers valid” means **all migrated rows validate**, not **all source claims are certified**.
