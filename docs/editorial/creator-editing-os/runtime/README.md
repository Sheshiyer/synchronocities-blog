# Creator Editing Steward local runtime

Python 3.11+ standard library controller and scoped MCP stdio server. Run here with `python3 -m ceos --help` or `python3 -m ceos.mcp`; optional `pip install -e .` provides entry points. The installed studio is `/Users/sheshnarayaniyer/VideoStudio`.

Durable stages: intake → planned → awaiting_plan_approval → plan_approved → draft_ready → awaiting_draft_approval → draft_approved → finalized. Atomic snapshots and event commit markers recover interrupted mutations. Operator-only approvals bind exact artifact versions and hashes. MCP cannot approve; artifact.read returns the verified current body.

Ten tools expose scoped jobs, artifacts, feedback, replay, capabilities and named studio.run actions: create, prep, stills, draft and final. No arbitrary shell, network, model calls, cloud activation or public publisher. Source access requires explicit roots. Final evidence checks a real job-owned file, SHA and ffprobe.

The adapter rechecks source bytes, approved artifacts and render fingerprints, locks each job, and persists invocation intent before launch. Unfinished or timed-out renders require operator reconciliation. Cached finals require identical inputs and output hash; damaged finalized outputs are held without rerender. Held receipts preserve audit evidence.

Asset manifests attach sources, output hash, probe and approval records to Editorial Steward draft packets. Publication status remains not_published; the existing publication queue is separate.

Verification: 108 fast tests passed; official Python MCP SDK 1.26.0 interoperated with ten tools. scripts/verify_local_pipeline.py ran actual synthetic create/prep/draft/final with TEST-ONLY approvals, restart, cached replay and drift checks. scripts/verify_mcp_sdk.py requires the optional mcp package. Pipeline diagnostics expect the synthetic fixture at /tmp/creator-editing-fixtures/synthetic-original.mp4.

Private pilot awaits plan approval; synthetic tests recorded no human approval. No API agent, long-running service or cloud executor is activated. Advisory locks support one local operator. Supplied SRT word timing is approximate. Speech alignment, transcription, advanced music/SFX mixing and cloud restart acceptance remain unverified.
