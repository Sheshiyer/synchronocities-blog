# Creator Editing Steward — practical implementation plan

September 30, 2026. User selected: build the video-editing studio and connect it to the Editorial Steward. This supersedes a PDF-to-article trial. The original PDF remains private; source provenance is in source-manifest.json.

## First working cycle

Build a local studio at ~/VideoStudio and a durable controller with scoped stdio MCP tools. Run a synthetic five-second composition in both aspect ratios, inspect rendered stills, and retain probe receipts. Then run a real ten-second original clip through prep, script alignment, captions and draft render before accepting production footage. The agent prepares artifacts; the human approves the exact editing plan and exact draft. Final rendering approval is separate from public publication approval.

## Ownership and connection

The Editorial Steward owns ideas, editorial source/claim review and the existing calendar. The Creator Editing Steward owns one isolated video job, its brief, timeline, footage manifest, previews and revision history. The private job registry owns progress and event deduplication. Remotion owns deterministic rendering. Existing platform executors continue to own public submissions and readback. Video files become versioned editorial assets only after final evidence is accepted; they never grant publishing approval.

Keep mutable job state outside Git under ~/.codex/editorial/creator-editing-os-pilot. Controller source lives in docs/editorial/creator-editing-os/runtime; video studio code lives outside this blog checkout. Never migrate or reset the existing editorial queue as part of this pilot.

## Delivery sequence

| Stage | Concrete output | Acceptance |
|---|---|---|
| 1. Durable controller | Job registry, versioned artifacts, locks, events, scoped MCP | Restart and replay preserve next action; changed artifacts invalidate approval |
| 2. Studio | Pinned Remotion v4, tokens, parts, templates, safe project scripts | Typecheck and isolation checks pass; five-second outputs exist in both layouts |
| 3. Local integration | Restricted adapter invokes the installed studio for one job | Intake creates only that job; prep returns actual capability report; draft records hashes |
| 4. Actual footage | Original short clip plus exact script | Measured audio/video streams; timings follow script; visual and listening review |
| 5. Editorial attachment | Final asset manifest associated with editorial draft | Final file hash, format, duration, source and human approval recorded |
| 6. Persistent API agent | Saved configuration and tested execution environment | Scoped MCP reachable and one session resumes from registry; budget set before activation |

## State and event contract

Editing states: intake → planned → awaiting_plan_approval → plan_approved → draft_ready → awaiting_draft_approval → draft_approved → finalized. Feedback creates a new artifact version and requires fresh approval. Any interrupted render is inspected against its output receipt before repeating. Finalized means local render accepted, not published.

Events carry event_id, job_id, expected_revision, source digest and artifact digest. Same event plus same payload is an idempotent replay. Same event_id with different content is rejected. Claims and state writes are locked and atomic; source changes hold work for review. The durable registry, not conversational recall, determines the next action.

## Tool authority

MCP exposes inspect, intake, artifact saving, feedback and capability reporting. It cannot grant human approval, execute arbitrary shell, reach unrelated jobs, export browser cookies or publish. Separate trusted local approval records exact artifact digests and human evidence. The studio adapter allows named create/prep/stills/draft/final operations with validated job IDs and no shell interpolation. Final requires matching draft approval and source fingerprints.

## Debug in production

Use the actual installed tools and a real private job; make failures inspectable. Start with a synthetic render clearly labelled synthetic. Capture failures, correct the smallest cause, rerun only the failed gate. Keep setup checkboxes honest. Improve shared tokens or components when a recurring defect appears; restrict a one-video revision to its requested notes. Record approved/rejected style only from human decisions.

## Media acceptance and limits

Use original footage; working conversions never overwrite it. Detect codec, colour transfer, frame rate, resolution and audio. A missing transcription engine produces an explicit SRT/manual-timing hold; it must not fabricate word timings. No large speech-model download is implied. Human review determines motion feel, lip sync, audio quality and phone safe-zone acceptance.

Measure loudness and true peak. A fixed gain may be unable to meet both the playbook loudness target and peak ceiling: report the measured conflict and request an audio decision instead of silently introducing a limiter. Music/SFX provenance belongs in the source manifest.

## Rollout and rollback

No new scheduler or cloud service during the local pilot. Preserve current Substack schedules. Install connection as an additive skill/tool configuration only after local integration passes. Retain package lock, controller version and job-state backup before migration. Rollback removes the additive integration and restores the backed-up registry; existing videos and publication records stay intact.

## Remaining decisions

Neutral provisional style, English and both video categories allow setup to proceed. Actual brand tokens and reference tastes need author review after preview. Cloud runtime, model budget and executor reachability remain activation decisions after local proof. No claim of cloud persistence is established by the local pilot.
