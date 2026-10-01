## Summary
Define provider-neutral task-card, coordination-claim and evidence-receipt contracts so Grok Bot, Hermes and future agents can participate in an inspectable workflow.

## Context
Extend #39 and #44 additively. Planning remains in the owner’s Synchronocities chat. Grok Bot is the requested planner/reporter participant; its exact runtime and transport must be verified independently. Existing repo documentation records no activated Grok transport. A configured bot is not evidence of a working Antahkarana adapter.

## Task card
```json
{
  "schema": "antahkarana-task-card.v1",
  "repository": "Sheshiyer/antahkarana",
  "issue_id": 48,
  "priority": "medium",
  "read_paths": [
    "AGENTS.md",
    "ISA.md",
    "docs/agent-cli.md",
    "docs/worker-bootstrap-handoff-spec.md",
    "docs/issue-sync-protocol.md"
  ],
  "forbidden_paths": [
    "src/**",
    "src-tauri/**",
    "sidecars/**",
    ".env*",
    ".artifacts/**",
    "credential stores",
    "private birth inputs"
  ],
  "constraints": [
    "No live credentialed calls",
    "No secret or raw birth values in outputs",
    "No public posting or owner gate approval by executors",
    "No silent provider fallback"
  ],
  "cost_cap_usd": 2.0,
  "cost_cap_status": "draft proposal; not dispatch authority; effective cap must also satisfy provider cap",
  "max_duration_seconds": 1800,
  "allowed_providers": [],
  "provider_status": "TBD against current route inventory; empty list blocks dispatch",
  "confirm_gate": "owner-preview-confirm",
  "required_evidence": [
    "exact test commands and summaries",
    "allowed-path diff",
    "HEAD before and after",
    "secrets gate",
    "blocked reasons and remaining TBDs"
  ],
  "pre_state": {
    "head": "f986ffa1d46499eb26ba05d4ee99fab74ce08d0f",
    "cli_tests": "214 passed, 0 failed",
    "truth_checks": "95 passed",
    "secrets": "passed",
    "build": "TypeScript and Vite passed"
  },
  "dependencies": [],
  "dispatch_authorized": false,
  "type": "feature",
  "task_id": "delegation-protocol",
  "iscs": [
    "new stable ISA IDs to allocate; draft A1-A9"
  ],
  "allowed_paths": [
    "docs/delegation-protocol.md",
    "docs/worker-bootstrap-handoff-spec.md",
    "docs/issue-sync-protocol.md",
    "schemas/delegation/**",
    "scripts/check-delegation*.mjs",
    "scripts/preview-delegation-labels.mjs",
    "tests/cli/delegation*.test.mjs"
  ]
}
```
Use JSON task cards and receipts. Grok/Hermes draft cards, inspect allowed issue/evidence sources and summarize receipts; they do not claim executor work, approve gates, access private credentials or publish automatically. Scoped executors implement approved cards and provide receipts. The owner or an independent executor verifies acceptance.

Claim style A uses <!-- antahkarana:claim v1 --> with executor/route/task/issue/time/expiry/base HEAD and an optional claim/active label. Earliest GitHub timestamp is a coordination rule only: comment races cannot provide atomic exclusion. Before any dispatch or side effect, use the existing atomic approval/claim ledger; if unavailable, hold execution. Re-read claims after creation, release losers, preserve expired/released lineage, and never mistake a label for a lock.

Receipt marker: <!-- antahkarana:receipt v1 --> with JSON schema antahkarana-receipt.v1. Include actor/route/times/status, satisfied and blocked ISCs, command evidence, artifact paths/digests, HEADs, allowed-path diff, errors, cost attribution, secret check, gate and operation ID. Unknown cost is UNRESOLVED and blocks paid continuation; it is never silently zero. A claimed satisfied ISC requires evidence and independent verification. Empty successful prose, scope escape, over-cap cost or leaked secrets invalidate acceptance.

The owner-approved planning choice is direct issue reading (S3) for the initial cycle. S1, adding a read-only Antahkarana NEXT-WAVE target, is a later host-owned candidate. Do not modify temperance-next-wave or mirror issues in this slice. This choice was adopted by the planning agent under the owner’s proceed instruction; it is not presented as an answer explicitly supplied by the owner.

Use existing phase/plan and type/feature labels for intake. Proposed claim/active, exec/codex, exec/claude-code, gate/owner-confirm, status/blocked and status/needs-verify labels are documented/previewed before a separate label batch. Existing labels remain valid; no bulk relabel. Executors prepare receipts locally for owner/reporter review in the initial dry run; direct bot GitHub posting stays separately scoped.

## Acceptance
- A1: docs/delegation-protocol.md exists.
- A2: #39/#44 local documentation changes are additive.
- A3: JSON schemas accept valid examples and reject empty success, evidence gaps, scope escape, over-cap cost and secret-bearing fixtures using synthetic values.
- A4: local checker has no network/GitHub mutation.
- A5: race/expiry/release fixtures plus atomic-gate requirement are tested.
- A6: label mapping/dry-run lists proposed changes without writes.
- A7: initial S3 and deferred S1 are recorded with actor/date and authority provenance.
- A8: synthetic low-risk docs cycle covers planner draft, explicit test approval, claim, receipt and independent check. Synthetic approval must never enter the human approval ledger.
- A9: CLI tests, truth checks and secrets gate still pass.

## Existing local draft
The concurrent local Antahkarana preparation now contains docs/delegation-protocol.md and .planning/evidence/2026-10-01-issue-draft-review.md. Inspect and extend those; do not overwrite them or treat the document as implemented schemas/runtime. NEXT-WAVE configuration selection remains pending; S3 here describes immediate direct reading, not an owner-selected host migration.

## Out of scope
New dispatcher/queue/GitHub App, NEXT-WAVE internals, provider selection, secret redistribution, Selemene fixes, cap changes, broad filesystem access, bulk writes, unattended executor activation or new publication authority. Continuous operation requires a separately verified runtime identity, permissions, bounded polling, restart/idempotency and stop behavior.

## References
#39 #44 #22 #26 #27 #23 #28 #33. No old issue is closed or reclassified by creating this extension.
