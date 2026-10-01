# Agent ecosystem handoff — Grok and Antahkarana

Planning owner: this Synchronocities chat. Implementation owner: Antahkarana. Owner instruction on October 1: proceed with the two drafts and use the existing Grok bot for handoff and continuing work. The role and receipt contract is reusable for future agents; no new bot or dispatcher is created by this packet.

## Ready work

- [Birth-blueprint wiring #47](https://github.com/Sheshiyer/antahkarana/issues/47): source-only CLI change, synthetic tests, six-workflow schema discovery. Live preview/confirm remains owner-run; no chart values belong in the public issue or handoff.
- [Delegation protocol #48](https://github.com/Sheshiyer/antahkarana/issues/48): JSON card/receipt schemas, read-only validation, claim lifecycle tests, label preview and synthetic docs cycle. Additive to #39/#44.

Exact issue bodies and verified GitHub readbacks are stored beside this document. Antahkarana baseline was freshly checked: 214 CLI tests, 95 truth checks, TypeScript/Vite build, secrets gate and whitespace gate passed. These are pre-state checks, not implementation acceptance for #47/#48.

## Roles

| Participant | Responsibility | Output |
|---|---|---|
| Owner and this planning chat | Direction, review, approved scope and consequential decisions | Versioned task card and acceptance decision |
| Existing Grok bot | Read selected issues, prepare bounded task cards, inspect receipts and report meaningful changes | Proposed work and evidence summaries |
| Codex/Claude Code executor | Atomically claim an approved task and implement within allowed paths/caps | Diff, exact test evidence and durable receipt |
| Independent verifier/owner | Check receipt, scope, claims and actual behavior | Accepted or rejected criteria |
| Antahkarana | Shared CLI/schema, private operation claims and source/evidence contracts | Versioned capabilities and operation receipts |

## Initial operating choices

Use JSON, retain current labels, and read Antahkarana issues directly (S3). Comments coordinate ownership; only the atomic approval/claim gate can authorize exclusive execution. Initial receipts are local review candidates. Provider route and effective spending cap must be verified before dispatch; the proposed $2/1800-second values are not spend authorization. NEXT-WAVE second-target integration (S1) remains a later host-owned change.

## Grok handoff

Grok: read #47 and #48. Compare the card’s base HEAD with the actual implementation checkout. Prepare a source-only work proposal with allowed paths, dependencies, cap/route state and required evidence. Do not approve a gate, claim executor work, request birth data, access credentials, run the live workflow, publish, merge, or dispatch a paid worker. Report missing prerequisites explicitly. Return a task-card proposal and, after independently scoped execution, summarize the receipt back to the owner’s planning surface.

Continuous mode must use the existing bot’s actual supported runtime. Verify identity, issue read permission, handoff delivery/readback, checkpoint persistence, restart behavior and a stop mechanism. Poll only selected tasks with backoff; remain quiet while unchanged. Notify on a meaningful receipt, failure, completion or owner action. Do not turn each poll into a new task/claim/comment. Idempotency uses task/attempt/operation IDs; work already claimed or completed is not resubmitted.

## Current integration evidence

The local Grok config has no Antahkarana MCP registration. Antahkarana’s current docs and accepted handoff explicitly mark the Grok remote transport as pending. The owner’s statement that an existing bot is configured is preserved as current intent; the exact bot endpoint/runtime remains to be identified, rather than contradicted or replaced with a different agent.

Status: issues and handoff prepared/verified; bot delivery and continuous runtime unverified. An exact chat link, bot handle or runtime/project path has been requested. No bot message, worker dispatch, new schedule, credential change or activation occurred. Use the existing bot once its destination is resolved; do not substitute an unrelated Codex heartbeat.

## Next action

Resolve the pending exact Grok destination, inspect its existing supported transport and permission scope, deliver this bounded public-issue packet, and obtain a substantive readback. Then test one low-risk read-only planner/reporting cycle and persistence before claiming continuous operation. Until that input arrives, the two issues remain available as concrete reviewable work with dispatch prerequisites explicit.

Concurrent-source checkpoint: another Antahkarana session has prepared `docs/delegation-protocol.md`, its issue-draft review and ISA-184 onward while this packet was assembled. Those files were inspected and preserved. Reuse them; no parallel duplicate implementation is dispatched. Its handoff records a quota failure and unresolved provider/cost state, so source tests are not evidence of worker availability.
