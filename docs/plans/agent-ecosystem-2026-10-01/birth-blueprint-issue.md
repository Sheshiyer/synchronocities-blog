## Summary
Register birth-blueprint as the second executable CLI workflow, retaining preview, owner confirmation, atomic claim and durable receipt behavior.

## Context
The accepted daily-practice slice already exists. Current local baseline is 214 CLI tests, 95 truth checks and a passing secrets gate. Local branch is ahead of remote; execution must verify the exact base rather than assume GitHub main contains the accepted slice.

Current Selemene source registry defines birth-blueprint at required_phase 0 with numerology, human-design, vimshottari, biofield and face-reading. Registry authority takes precedence over stale portal and older three-engine issues. Source HEAD: f1ba0180b34926c5aea2668cb9784d6c4c236215. No live birth-blueprint execution has been performed.

## Task card
```json
{
  "schema": "antahkarana-task-card.v1",
  "repository": "Sheshiyer/antahkarana",
  "issue_id": 47,
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
  "task_id": "birth-blueprint-cli",
  "iscs": [
    "ISC-184 through ISC-192 reserved in current local ISA; verify before implementation"
  ],
  "allowed_paths": [
    "cli/commands/selemene.mjs",
    "cli/lib/workflow-input.mjs",
    "tests/cli/selemene-security.test.mjs",
    "tests/cli/selemene-ext.test.mjs",
    "tests/cli/workflow-input.test.mjs",
    "tests/cli/workflow-binding.test.mjs",
    "docs/agent-cli.md",
    "docs/workflow-input-schemas.md"
  ]
}
```
Generalize expected-engine validation and workflow identity checks; make bounded input validation workflow-aware. Birth data is required for this workflow: date, latitude, longitude and timezone; time and name remain optional at the input-contract level, with completeness limitations made explicit. Inject current_time fresh. Do not admit precision/options without a verified contract. Preserve daily-practice behavior and all current path, body, freshness, redirect, replay and concurrent-confirm protections.

Document the six registered workflows and distinguish source-known fields from TBD requirements. Calculation stays separate from interpretation.

## Acceptance
- Proposed ISC-184: workflow listed/accepted; unknown IDs fail.
- 185: missing/invalid birth input fails without leaking private values.
- 186: expected-engine table detects missing, unexpected, failed and partial output; daily-practice regressions pass.
- 187: synthetic tests prove no blind retry, no second POST on replay and exactly one POST on concurrent confirm.
- 188: later owner-run private chart execution follows preview/confirm/claim/receipt and separately authorized vault publication/readback.
- 189: independent verification of that later private payload and digest.
- 190: CLI suite, 95 truth checks, build, secrets and diff checks pass.
- 191: six-workflow schema document contains no invented fields.
- 192: no secret/raw birth values in repository, issues, PR, logs or public receipts.

The source-only worker must return 188/189 as awaiting owner live confirmation, not manufacture acceptance. Existing account phase gating, missing birth-time behavior, numerology name completeness, precision/options support, biofield/face-reading inputs and per-run publication approval remain TBD. Partial output must remain partial.

## Out of scope
Selemene service fixes, gateway authentication/capabilities, the other four CLI workflows, UI/Rust/sidecars, automatic vault publication, bot activation, gate redesign and spending beyond an independently verified cap. Default vault publication remains an owner operation. No credentialed run is authorized by this issue.

## Implementation handoff
Protocol extension: #48. Grok Bot prepares/report tasks only; this issue is not an executor claim or a live-run approval.

## References
#22 #26 #27 #23 #28 #33 #39 #44 #17 #31; PR #46; Sheshiyer/Selemene-engine#1491. Owner planning remains in the Synchronocities chat; implementation and acceptance belong to Antahkarana.
