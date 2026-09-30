# Required controller repair gates

Review of first arriving implementation, September 30. Recheck final worker output before applying; these observations were made while files were in progress.

1. Duplicate event detection must precede every mutation. A replay must not overwrite an artifact or increment a version before raising duplicate. Same ID/different payload rejects; same ID/same payload returns original result.
2. State/artifacts/events require recoverable transaction semantics. Atomic replacement of individual files does not make their combined update atomic. Use one authoritative transaction snapshot or WAL with proven crash recovery; replay must compare full persisted state rather than only report a guessed stage.
3. Approval records must bind source and artifact hashes and be checked before dependent work. Changing a plan after approval resets its dependent draft approvals; changing a draft after approval resets final authorization.
4. Reject saving stage-incompatible draft/final artifacts. Saving arbitrary final_evidence prose must never by itself mark a job verified. Final requires actual existing output paths/hashes plus probe metadata and matching approval.
5. MCP intake must constrain source paths to the explicitly allowed source/studio roots. No caller-controlled arbitrary source path read; deny traversal, symlink escape and cross-job paths on read as well as write.
6. Check source drift on approval/submission/finalization as well as artifact save.
7. Restrict operator approval to a documented trusted invocation; never present an agent-readable local token as proof of a human decision. Require human evidence reference and exact digest, and clearly document trust boundary.
8. Private directory descendants need mode700 and files600. Lock paths must not escape through job-directory symlinks.
9. MCP initialize must negotiate supported protocol version; tool names and input schema should conform to MCP clients. Exercise real stdio request/response lifecycle.
10. Add regression probes for duplicate-save unchanged state, crash between persistence operations, approved-plan changed then draft attempted, arbitrary final prose, outside source, approval source drift, same ID conflicting payload and symlink job directory.
11. MCP stdio transport uses newline-delimited JSON, not LSP Content-Length headers. Correct the current framing and test via an official MCP SDK client if available. Negotiate the supported protocol rather than assuming the claim in the first implementation.
