# Independent studio adapter acceptance gaps

Source inspection during final repair found these concrete integration defects to verify after the producer finishes:

- `_exec_script` scans individual lines for JSON. Current studio scripts emit pretty multiline JSON; the parser returns no result and nevertheless reports `ok=True`. Parse the actual trailing JSON object with a decoder, fail if no valid structured result, and test the real create/prep/draft/final contracts.
- `new-video` outputs directory paths; hashing any existing path as a file raises on directories. Only fingerprint regular files and report directories as such.
- Draft checks only that some plan approval exists; final checks only that some draft approval exists. Recheck the current approved version/hash and registered source hashes immediately before execution. The fixture must be an exact registered source, not just any file under `/tmp`. Default sources must not grant the agent blanket access to all temp directories.
- `stills` accepts arbitrary `comp_id`; restrict to this job's named composition, excluding another job/sample. Enforce job containment on every reported output before reading or hashing it.
- Final replay key uses a 16-character draft prefix and ignores requested format. Bind full draft hash, requested format and relevant source/config fingerprints. Verify cached output exists with matching hash; missing/drifted output must not replay success.
- Timeout returns an ephemeral error but does not persist uncertain state. Record an invocation before launch and uncertain outcome durably; refuse automatic retry until reconciliation. Kill the owned subprocess tree on timeout to avoid continuing a render after reporting failure.
- Finalization should actually verify successful script output and save final evidence/asset manifest, or expose one explicit named reconcile operation. Passing `--version` only as metadata does not prove that the rendered composition/config matches the approved draft; bind config/media to the approval.

Use an actual isolated controller job against the installed studio, not mocked script output, to complete create -> prep -> draft -> exact test-only draft approval -> final -> manifest -> cached replay. Synthetic approval fixtures stay in temporary state and are never recorded as real human approval. Preserve new recovery/final-file tests and official SDK handshake.
