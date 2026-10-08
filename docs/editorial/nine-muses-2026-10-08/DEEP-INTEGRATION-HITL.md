# Deep integration and human review — proposed implementation

Source inspection: 8 October 2026. This is a design, not an activated connector or implemented question service.

## Current foundation

The existing owner-private Site has a D1-backed research store, research run receipts, human archive/restore, revision checks, exact draft approval and an approved handoff queue. Native Grok has nine active Muse reporting routines, Calliope transcript aggregation and interactive questions. The separate Fieldwork repository has 25 written review decisions; these are interview material, not a dynamic question inbox. Reuse answers already given.

Missing: authenticated Muse-to-Site access; structured review/question records; answer routing and acknowledgement; delivery executor. Grok currently receives401 from the Site. The research evidence validator currently accepts GitHub-shaped provenance only, so public web, bookmark and human-return evidence need a typed schema extension rather than being disguised as GitHub evidence.

## Closed loop

Source observation → responsible Muse report → relevant second review → proposal or human question → human decision → bounded continuation → result receipt → next report.

Field Report holds canonical reports, questions, answers and execution receipts. Grok presents reminders and links to the exact record. Existing schedules become triggers for this same loop; no duplicate monitoring fleet.

## Integration contract

- Provide an authenticated, supported bridge. Assign each Muse its own verified identity and permitted records. Agents can append reports, review findings and questions; they cannot answer as the human or change approval/queue state.
- Do not copy Site service credentials, cookies or unrestricted source access into Bot prompts. Any new access grant is a separately reviewable setup action.
- Use stable run IDs, payload hashes, source versions and receipts. Record unavailable sources explicitly. Extend provenance by source type: GitHub blob, public page, bookmark snapshot, human supplied material, platform receipt.
- A report includes responsible Muse, record/project, observed time, source/evidence version, claim stage, changes, gaps, next action and proposed question IDs.
- One owner plus one relevant reviewer per proposed item. Clio checks provenance, Polymnia checks scope/precision, Melpomene reviews material risk. Avoid asking all nine Muses to repeat every review. A reviewer recommendation is not human approval.

## Human question model

Question fields: stable ID, record ID, asking Muse, type, concise question, two or three choices plus free text, recommendation with reason, evidence links/hash, consequence of each option, action scope, source revision, priority, created time and optional deadline. Do not invent deadlines.

States: open → answered → applied; alternatives deferred, cancelled or stale. A changed source/payload invalidates an action-dependent answer until reconciled. Repeated same-record/same-question/same-source-version findings reuse the existing open question.

Answer fields: question ID, selected choice or text, signed-in human identity, timestamp, expected question revision and granted action scope. Preserve history; silence is not an answer.

## Review experience

Add a Questions/Reviews page to every record and a global Needs you inbox. Show one-screen evidence, recommendation, alternatives, the consequence and next permitted action. Include accept, request revision, supply source, defer and reject as appropriate to the question type.

Separate three decisions:

1. Author/source review: does this preserve the intended meaning and actual evidence?
2. Plan review: which next step should the responsible Muse take?
3. Public action approval: exact current copy, account, destination, audience, email/media and fingerprint.

Choosing an editorial angle never grants public publication. Use the existing exact-draft approval boundary for public actions.

Grok reminders point to the same question ID in Field Report. First implement answering in the signed-in Site. Mirroring answers from native Grok question cards requires a verified authenticated human-answer event; plain Bot transcript claims are insufficient.

## Answer return and continuation

Saving a human answer atomically creates an outbox item. Deliver only the answer and required evidence to the responsible Bot through a verified supported route. The Bot acknowledges the same answer ID/version; retries cannot duplicate work. The UI shows answer saved, delivered, acknowledged, applied or failed distinctly.

A drafting answer resumes drafting. An approved external action still requires a supported executor and exact account/payload check. Record actual results; an acknowledgement is not execution success.

## Reminder policy

Calliope includes unanswered questions and important blockers in its existing10:15digest and Monday10:30review. Interrupt outside that cadence only for a real urgent failure or a blocked action that already has authorization. Deduplicate reminders and honor deferred items. Show missing/stale Muse reports instead of filling gaps with invented health.

## First vertical slice

Use an editorial question on Let the Sentence Finish: Euterpe submits a report and one question about the companion's angle; Clio adds a source review; the human answers in Field Report; Euterpe receives and acknowledges the exact answer, updates a draft proposal, and returns a revision receipt. Public copy and the existing approved draft remain unchanged throughout this test.

Proposed implementation additions (not existing endpoints): report/review/question storage; question submission and human answer routes; answer outbox and Bot acknowledgement; record review UI and Needs you inbox; scoped bridge; migration/rollback and tests.

## Acceptance probes

- Authenticated Muse can write only its permitted proposal records.
- Agent/service cannot write human answers or public approvals.
- Human answer persists across reload and another signed-in session.
- Stale revision/source hash is rejected without losing the previous answer.
- Retry of a report/question/answer delivery is idempotent.
- Bot receives and acknowledges the correct answer exactly once.
- A review request does not mutate existing exact-copy approval or publication queue.
- Missing access is visible and cannot be bypassed by another tool.
- Owner sees pending/deferred/resolved questions and exact result stage on desktop/mobile.
- First real loop is verified from submission through answer, acknowledgement and revised proposal.
