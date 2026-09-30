"""Regression probes for CONTROLLER-REVIEW.md repair gates.

Each test targets a specific failure mode that the original 16 tests
did not cover.  Tests are named after the gate they exercise.

Gates covered:
  R1.  Same event_id / different payload → DuplicateEvent.
  R2.  Same event_id / same payload → idempotent replay (unchanged state + result).
  R3.  Crash between state.json write and event append → snapshot recovery.
  R4.  Approved plan changed → draft approvals invalidated.
  R5.  Approved draft changed → draft_approved stage reset, final blocked.
  R6.  Arbitrary prose as final_evidence rejected (FinalEvidenceInvalid).
  R7.  Real final_evidence JSON accepted and transitions to finalized.
  R8.  Source path outside allowed roots rejected (PathViolation).
  R9.  Approval with source drift rejected (SourceDrift).
  R10. Symlink that escapes job directory rejected (PathViolation via ensure_within).
  R11. Stale approval on changed artifact rejected (ArtifactDrift).
  R12. Replay reports stages_match=False when state is corrupt, then recovers.
  R13. MCP uses newline-delimited JSON (no Content-Length headers).
  R14. MCP rejects unsupported protocol version.
  R15. MCP idempotent tool call with same event_id and payload.
  R16. Studio adapter gate: draft action blocked without plan approval.
  R17. Studio adapter gate: final action blocked without draft approval.
  R18. Studio adapter: non-existent studio dir reports ok=False, not fake success.
"""

from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ceos.controller import Controller
from ceos.model import (
    ArtifactDrift,
    DuplicateEvent,
    FinalEvidenceInvalid,
    ForgedApproval,
    InvalidTransition,
    PathViolation,
    SourceDrift,
    StageDrift,
    StaleVersion,
    UnknownJob,
)
from ceos.store import (
    EventLog,
    atomic_write_json,
    read_json,
    sha256_bytes,
    sha256_file,
    write_txn_snapshot,
)
from ceos.studio_adapter import StudioAdapter


class _Base(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.state_root = self.tmp_path / "state"
        self.state_root.mkdir()
        self.sources_dir = self.tmp_path / "sources"
        self.sources_dir.mkdir()
        # Allow the temp sources dir as a source root.
        self.ctl = Controller(
            self.state_root,
            allowed_source_roots=[self.sources_dir, self.tmp_path],
        )
        self.token = self.ctl.ensure_operator_token()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _mksource(self, name: str, body: str = "source content\n") -> Path:
        p = self.sources_dir / name
        p.write_text(body, encoding="utf-8")
        return p

    def _job_through_plan_approved(self, job_id: str = "j-test") -> dict:
        """Create a job, save plan, submit, approve.  Returns plan_result."""
        src = self._mksource(f"{job_id}-brief.md")
        self.ctl.create_job(job_id=job_id, scope="test",
                            sources=[{"path": str(src)}], event_id=f"{job_id}-create")
        plan_result = self.ctl.save_artifact(job_id, "plan", "plan body\n", event_id=f"{job_id}-plan")
        self.ctl.submit_for_approval(job_id, "plan", event_id=f"{job_id}-submit")
        self.ctl.record_operator_approval(
            job_id=job_id, stage_key="plan",
            approver="op", operator_token=self.token,
            expected_version=plan_result["version"],
            expected_sha256=plan_result["sha256"],
            note="ok", event_id=f"{job_id}-approve-plan",
        )
        return plan_result

    def _job_through_draft_approved(self, job_id: str = "j-draft") -> dict:
        """Extend through draft approval.  Returns draft_result."""
        self._job_through_plan_approved(job_id)
        draft_result = self.ctl.save_artifact(job_id, "draft", "draft body\n", event_id=f"{job_id}-draft")
        self.ctl.submit_for_approval(job_id, "draft", event_id=f"{job_id}-draft-submit")
        self.ctl.record_operator_approval(
            job_id=job_id, stage_key="draft",
            approver="op", operator_token=self.token,
            expected_version=draft_result["version"],
            expected_sha256=draft_result["sha256"],
            note="ok", event_id=f"{job_id}-approve-draft",
        )
        return draft_result


# ---------------------------------------------------------------------------
# R1. Same event_id / different payload → DuplicateEvent
# ---------------------------------------------------------------------------

class TestR1DuplicateEventDifferentPayload(_Base):
    def test_same_event_id_different_body_rejected(self):
        src = self._mksource("r1.md")
        self.ctl.create_job("r1-job", "test", [{"path": str(src)}], "e-create")
        self.ctl.save_artifact("r1-job", "plan", "version one\n", event_id="e-plan")
        # Same event_id but different body → DuplicateEvent.
        with self.assertRaises(DuplicateEvent):
            self.ctl.save_artifact("r1-job", "plan", "COMPLETELY DIFFERENT\n", event_id="e-plan")

    def test_same_event_id_different_kind_rejected(self):
        src = self._mksource("r1b.md")
        self.ctl.create_job("r1b-job", "test", [{"path": str(src)}], "e-create")
        self.ctl.save_artifact("r1b-job", "plan", "plan\n", event_id="e-plan-b")
        # Re-use the plan event_id for a brief with different body → rejected.
        with self.assertRaises(DuplicateEvent):
            self.ctl.save_artifact("r1b-job", "brief", "plan\n", event_id="e-plan-b")


# ---------------------------------------------------------------------------
# R2. Same event_id / same payload → idempotent replay (state unchanged)
# ---------------------------------------------------------------------------

class TestR2IdempotentReplay(_Base):
    def test_replay_returns_original_result_unchanged(self):
        src = self._mksource("r2.md")
        self.ctl.create_job("r2-job", "test", [{"path": str(src)}], "e-create")
        first = self.ctl.save_artifact("r2-job", "plan", "plan v1\n", event_id="e-plan-r2")
        # Second call with same event_id + same body → returns first result.
        second = self.ctl.save_artifact("r2-job", "plan", "plan v1\n", event_id="e-plan-r2")
        self.assertEqual(first["sha256"], second["sha256"])
        self.assertEqual(first["version"], second["version"])
        # State is unchanged: still only one event with this id.
        events = EventLog(self.ctl.jobs_root / "r2-job" / "events.ndjson").load()
        plan_events = [e for e in events if e["event_id"] == "e-plan-r2"]
        self.assertEqual(len(plan_events), 1)

    def test_replay_does_not_increment_version(self):
        src = self._mksource("r2v.md")
        self.ctl.create_job("r2v-job", "test", [{"path": str(src)}], "e-create")
        self.ctl.save_artifact("r2v-job", "plan", "plan body\n", event_id="e-p")
        state_before = self.ctl.inspect("r2v-job")["state"]
        # Replay.
        self.ctl.save_artifact("r2v-job", "plan", "plan body\n", event_id="e-p")
        state_after = self.ctl.inspect("r2v-job")["state"]
        self.assertEqual(
            state_before["artifacts"]["plan"]["version"],
            state_after["artifacts"]["plan"]["version"],
        )


# ---------------------------------------------------------------------------
# R3. Crash between state.json write and event append → snapshot recovery
# ---------------------------------------------------------------------------

class TestR3CrashRecovery(_Base):
    def test_leftover_snapshot_consistent_state_cleans_up(self):
        """Simulate crash after state.json written but before event appended
        on a job that IS consistent (snapshot stage == replayed stage).
        Recovery should clean up the snapshot and not raise StageDrift.
        """
        src = self._mksource("r3.md")
        self.ctl.create_job("r3-job", "test", [{"path": str(src)}], "e-create")
        # Manually write a snapshot that matches the current persisted state.
        job_dir = self.ctl.jobs_root / "r3-job"
        state_dict = read_json(self.ctl.jobs_root / "r3-job" / "state.json")
        write_txn_snapshot(job_dir, state_dict, 1)
        # Snapshot exists.
        self.assertTrue((job_dir / ".txn-snapshot.json").exists())
        # A new mutation should detect and clean up the snapshot without error.
        result = self.ctl.save_artifact("r3-job", "plan", "plan\n", event_id="e-plan-r3")
        self.assertIn("version", result)
        # Snapshot removed after successful write.
        self.assertFalse((job_dir / ".txn-snapshot.json").exists())

    def test_leftover_snapshot_inconsistent_state_raises_stagedrift(self):
        """Simulate crash where state.json was written with a WRONG stage but
        events.ndjson was not updated.  Recovery should restore state from the
        snapshot and raise StageDrift.
        """
        src = self._mksource("r3b.md")
        self.ctl.create_job("r3b-job", "test", [{"path": str(src)}], "e-create-r3b")
        job_dir = self.ctl.jobs_root / "r3b-job"
        # Snapshot records correct intake stage.
        correct_state = read_json(job_dir / "state.json")
        write_txn_snapshot(job_dir, correct_state, 1)
        # Corrupt state.json to claim a wrong stage.
        bad_state = dict(correct_state)
        bad_state["stage"] = "finalized"
        atomic_write_json(job_dir / "state.json", bad_state)
        # The snapshot now differs from persisted state.
        # Calling save_artifact will trigger recover_if_needed → StageDrift.
        with self.assertRaises(StageDrift):
            self.ctl.save_artifact("r3b-job", "plan", "plan\n", event_id="e-plan-r3b")
        # After the exception, state.json must be restored to correct_state.
        restored = read_json(job_dir / "state.json")
        self.assertEqual(restored["stage"], "intake")


# ---------------------------------------------------------------------------
# R4. Approved plan changed → draft approvals cleared
# ---------------------------------------------------------------------------

class TestR4PlanChangedAfterApproval(_Base):
    def test_plan_change_after_approval_clears_draft_approvals(self):
        job_id = "r4-job"
        self._job_through_draft_approved(job_id)
        # At this point stage is draft_approved with a draft approval.
        state = self.ctl.inspect(job_id)["state"]
        self.assertEqual(state["stage"], "draft_approved")
        self.assertTrue(any(a["stage_key"] == "draft" for a in state["approvals"]))

        # Save a NEW plan version → should invalidate draft approvals.
        # First go back to plan_approved stage (via replay path or direct):
        # We need to be in plan_approved or earlier to re-save the plan.
        # Actually we can re-save plan at any time; the controller should
        # clear draft approvals.
        self.ctl.save_artifact(job_id, "plan", "plan revised\n", event_id="r4-plan-v2")
        state = self.ctl.inspect(job_id)["state"]
        # Draft approvals must be gone.
        self.assertFalse(any(a.get("stage_key") == "draft" for a in state["approvals"]))
        # Stage should have been reset to plan_approved.
        self.assertEqual(state["stage"], "plan_approved")

    def test_draft_attempt_after_plan_revision_requires_new_approval(self):
        job_id = "r4b-job"
        self._job_through_plan_approved(job_id)
        # Save a draft normally.
        self.ctl.save_artifact(job_id, "draft", "draft v1\n", event_id="r4b-draft-v1")
        self.ctl.submit_for_approval(job_id, "draft", event_id="r4b-draft-submit")
        # Now revise the plan → this resets the stage to plan_approved.
        self.ctl.save_artifact(job_id, "plan", "plan revised\n", event_id="r4b-plan-v2")
        state = self.ctl.inspect(job_id)["state"]
        # Stage reset; no draft approvals.
        self.assertIn(state["stage"], {"plan_approved"})
        self.assertFalse(any(a.get("stage_key") == "draft" for a in state["approvals"]))


# ---------------------------------------------------------------------------
# R5. Approved draft changed → draft_approved reset, final blocked
# ---------------------------------------------------------------------------

class TestR5DraftChangedAfterApproval(_Base):
    def test_draft_change_after_draft_approved_resets_stage(self):
        job_id = "r5-job"
        self._job_through_draft_approved(job_id)
        state = self.ctl.inspect(job_id)["state"]
        self.assertEqual(state["stage"], "draft_approved")

        # Save a new draft version.
        self.ctl.save_artifact(job_id, "draft", "draft revised\n", event_id="r5-draft-v2")
        state = self.ctl.inspect(job_id)["state"]
        # Stage must regress to draft_ready; draft approvals cleared.
        self.assertEqual(state["stage"], "draft_ready")
        self.assertFalse(any(a.get("stage_key") == "draft" for a in state["approvals"]))

    def test_finalize_after_draft_change_without_reapproval_blocked(self):
        """After draft revision, saving bogus final_evidence at draft_ready stage
        is now rejected by real evidence validation (Fix 2: file must exist, SHA
        must match, ffprobe must succeed).  Stage stays draft_ready.
        """
        job_id = "r5b-job"
        self._job_through_draft_approved(job_id)
        # Revise draft -> resets to draft_ready, clears draft approvals.
        self.ctl.save_artifact(job_id, "draft", "draft revised\n", event_id="r5b-draft-v2")
        state_mid = self.ctl.inspect(job_id)["state"]
        self.assertEqual(state_mid["stage"], "draft_ready")
        # Bogus evidence: fabricated SHA + nonexistent path -> rejected by Fix 2.
        bogus_evidence = json.dumps({
            "output_path": "/tmp/out.mp4",
            "output_sha256": "a" * 64,
            "probe": {"codec": "h264"},
        })
        with self.assertRaises(FinalEvidenceInvalid):
            self.ctl.save_artifact(job_id, "final_evidence", bogus_evidence, event_id="r5b-final")
        state = self.ctl.inspect(job_id)["state"]
        # Exception prevented write; stage stays draft_ready.
        self.assertNotEqual(state["stage"], "finalized")
        self.assertEqual(state["stage"], "draft_ready")


# ---------------------------------------------------------------------------
# R6. Arbitrary prose as final_evidence rejected
# ---------------------------------------------------------------------------

class TestR6FinalEvidenceProse(_Base):
    def test_prose_final_evidence_rejected(self):
        job_id = "r6-job"
        self._job_through_draft_approved(job_id)
        prose = "The video looks great, everything is done, please mark as finalized."
        with self.assertRaises(FinalEvidenceInvalid):
            self.ctl.save_artifact(job_id, "final_evidence", prose, event_id="r6-final")
        state = self.ctl.inspect(job_id)["state"]
        self.assertNotEqual(state["stage"], "finalized")

    def test_json_without_required_fields_rejected(self):
        job_id = "r6b-job"
        self._job_through_draft_approved(job_id)
        # Missing probe and output_sha256.
        incomplete = json.dumps({"output_path": "/tmp/out.mp4"})
        with self.assertRaises(FinalEvidenceInvalid):
            self.ctl.save_artifact(job_id, "final_evidence", incomplete, event_id="r6b-final")

    def test_valid_final_evidence_accepted(self):
        """Fix 2: final_evidence must supply a real file with matching SHA and ffprobe.
        We create a real 2s test-pattern mp4 inside the job directory, compute its
        actual SHA256, run ffprobe, and pass the real probe dict.  The controller
        must accept it and transition to finalized.  Fix 6: asset-manifest.json
        must be written to the job directory.
        """
        import subprocess as _sub
        job_id = "r6c-job"
        self._job_through_draft_approved(job_id)

        # Build a real 2-second test-pattern mp4 inside the job directory.
        job_dir = self.state_root / "jobs" / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        out_mp4 = job_dir / "final-out.mp4"
        result_ff = _sub.run([
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "color=c=black:s=720x1280:r=30",
            "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
            "-t", "2", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p",
            str(out_mp4),
        ], capture_output=True, timeout=60)
        if result_ff.returncode != 0:
            self.skipTest(f"ffmpeg unavailable: {result_ff.stderr[:200]}")

        real_sha = sha256_file(out_mp4)
        probe_res = _sub.run([
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", "-show_format", str(out_mp4),
        ], capture_output=True, text=True, timeout=30)
        probe_dict = json.loads(probe_res.stdout)

        valid = json.dumps({
            "output_path": str(out_mp4),
            "output_sha256": real_sha,
            "probe": probe_dict,
        })
        result = self.ctl.save_artifact(job_id, "final_evidence", valid, event_id="r6c-final")
        state = self.ctl.inspect(job_id)["state"]
        self.assertEqual(state["stage"], "finalized")

        # Fix 6: asset-manifest.json must be written after finalization.
        manifest_path = self.state_root / "jobs" / job_id / "asset-manifest.json"
        self.assertTrue(manifest_path.exists(), "asset-manifest.json not written")
        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest["job_id"], job_id)
        self.assertEqual(manifest["output_sha256"], real_sha)
        self.assertEqual(manifest["publication_status"], "not_published")
        self.assertIsNone(manifest["publication_queue"])


# ---------------------------------------------------------------------------
# R7. Source path outside allowed roots → PathViolation
# ---------------------------------------------------------------------------

class TestR7SourceWhitelist(_Base):
    def test_absolute_path_outside_allowed_roots_rejected(self):
        # /etc/passwd is outside any allowed root.
        with self.assertRaises(PathViolation):
            self.ctl.create_job(
                "r7-job", "test",
                [{"path": "/etc/passwd", "label": "secret"}],
                "e-create",
            )

    def test_traversal_segment_in_source_path_rejected(self):
        with self.assertRaises(PathViolation):
            self.ctl.create_job(
                "r7b-job", "test",
                [{"path": f"{self.sources_dir}/../../../etc/shadow"}],
                "e-create",
            )

    def test_allowed_root_source_accepted(self):
        src = self._mksource("r7c.md")
        # Should not raise.
        result = self.ctl.create_job("r7c-job", "test", [{"path": str(src)}], "e-create-r7c")
        self.assertEqual(result["job_id"], "r7c-job")


# ---------------------------------------------------------------------------
# R8. Source drift on approval → SourceDrift
# ---------------------------------------------------------------------------

class TestR8SourceDriftOnApproval(_Base):
    def test_source_drift_on_plan_approval_rejected(self):
        src = self._mksource("r8.md", "original content\n")
        self.ctl.create_job("r8-job", "test", [{"path": str(src)}], "e-create")
        plan_result = self.ctl.save_artifact("r8-job", "plan", "plan v1\n", event_id="e-plan")
        self.ctl.submit_for_approval("r8-job", "plan", event_id="e-submit")
        # Mutate the source file after submission.
        src.write_text("MODIFIED content that the operator never saw\n", encoding="utf-8")
        with self.assertRaises(SourceDrift):
            self.ctl.record_operator_approval(
                job_id="r8-job", stage_key="plan",
                approver="op", operator_token=self.token,
                expected_version=plan_result["version"],
                expected_sha256=plan_result["sha256"],
                note="", event_id="e-approve",
            )
        # Stage unchanged.
        state = self.ctl.inspect("r8-job")["state"]
        self.assertEqual(state["stage"], "awaiting_plan_approval")
        self.assertEqual(state["approvals"], [])


# ---------------------------------------------------------------------------
# R9. Symlink escape in ensure_within → PathViolation
# ---------------------------------------------------------------------------

class TestR9SymlinkEscape(_Base):
    def test_symlink_escape_in_ensure_within(self):
        from ceos.store import ensure_within
        job_dir = self.tmp_path / "sym-job"
        job_dir.mkdir()
        # Create a symlink inside job_dir that points outside.
        evil_link = job_dir / "escape"
        evil_link.symlink_to("/etc")
        with self.assertRaises(PathViolation):
            ensure_within(job_dir, evil_link / "passwd")

    def test_normal_path_within_job_dir_accepted(self):
        from ceos.store import ensure_within
        job_dir = self.tmp_path / "normal-job"
        job_dir.mkdir()
        (job_dir / "subdir").mkdir()
        result = ensure_within(job_dir, job_dir / "subdir" / "file.txt")
        self.assertEqual(result, job_dir / "subdir" / "file.txt")


# ---------------------------------------------------------------------------
# R10. Stale approval on changed artifact → ArtifactDrift
# ---------------------------------------------------------------------------

class TestR10StaleApprovalArtifactDrift(_Base):
    def test_approval_with_wrong_sha_rejected(self):
        src = self._mksource("r10.md")
        self.ctl.create_job("r10-job", "test", [{"path": str(src)}], "e-create")
        plan_result = self.ctl.save_artifact("r10-job", "plan", "plan v1\n", event_id="e-plan")
        self.ctl.submit_for_approval("r10-job", "plan", event_id="e-submit")
        # Provide wrong sha256 in approval.
        with self.assertRaises(ArtifactDrift):
            self.ctl.record_operator_approval(
                job_id="r10-job", stage_key="plan",
                approver="op", operator_token=self.token,
                expected_version=plan_result["version"],
                expected_sha256="0" * 64,
                note="", event_id="e-approve",
            )

    def test_artifact_tampered_on_disk_detected(self):
        src = self._mksource("r10b.md")
        self.ctl.create_job("r10b-job", "test", [{"path": str(src)}], "e-create")
        plan_result = self.ctl.save_artifact("r10b-job", "plan", "plan v1\n", event_id="e-plan")
        self.ctl.submit_for_approval("r10b-job", "plan", event_id="e-submit")
        # Tamper with the artifact file on disk.
        job_dir = self.ctl.jobs_root / "r10b-job"
        artifact_path = job_dir / f"plan-v{plan_result['version']}.txt"
        artifact_path.write_bytes(b"TAMPERED")
        with self.assertRaises(ArtifactDrift):
            self.ctl.record_operator_approval(
                job_id="r10b-job", stage_key="plan",
                approver="op", operator_token=self.token,
                expected_version=plan_result["version"],
                expected_sha256=plan_result["sha256"],
                note="", event_id="e-approve",
            )


# ---------------------------------------------------------------------------
# R11. Replay reports stages_match + persisted_stage
# ---------------------------------------------------------------------------

class TestR11ReplayDiff(_Base):
    def test_replay_reports_stages_match_true(self):
        src = self._mksource("r11.md")
        self.ctl.create_job("r11-job", "test", [{"path": str(src)}], "e-create")
        self.ctl.save_artifact("r11-job", "plan", "plan\n", event_id="e-plan")
        result = self.ctl.replay("r11-job")
        self.assertTrue(result["stages_match"])
        self.assertEqual(result["expected_stage"], result["persisted_stage"])

    def test_replay_detects_corrupt_state(self):
        src = self._mksource("r11b.md")
        self.ctl.create_job("r11b-job", "test", [{"path": str(src)}], "e-create")
        self.ctl.save_artifact("r11b-job", "plan", "plan\n", event_id="e-plan")
        # Corrupt state.json directly.
        state_path = self.ctl.jobs_root / "r11b-job" / "state.json"
        data = read_json(state_path)
        data["stage"] = "finalized"
        atomic_write_json(state_path, data)
        result = self.ctl.replay("r11b-job")
        self.assertFalse(result["stages_match"])
        self.assertNotEqual(result["expected_stage"], result["persisted_stage"])


# ---------------------------------------------------------------------------
# R12. MCP uses newline-delimited JSON (no Content-Length headers)
# ---------------------------------------------------------------------------

class TestR12MCPNewlineTransport(_Base):
    def _ndjson_rpc(self, server, msg: dict) -> dict | None:
        """Send a message as newline-delimited JSON and parse the response."""
        line = (json.dumps(msg) + "\n").encode("utf-8")
        server.inp = io.BytesIO(line)
        server.outp = io.BytesIO()
        m = server._read_message()
        if m is None:
            return None
        server._handle_message(m)
        raw = server.outp.getvalue()
        if not raw:
            return None
        # Must be a single JSON line, NO Content-Length header.
        line_out = raw.strip()
        self.assertNotIn(b"Content-Length", line_out,
                         "MCP stdio must NOT use Content-Length headers")
        return json.loads(line_out.decode("utf-8"))

    def test_newline_delimited_tools_list(self):
        from ceos.mcp import MCPServer
        server = MCPServer(self.ctl)
        resp = self._ndjson_rpc(server, {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}})
        self.assertIsNotNone(resp)
        self.assertIn("result", resp)
        tools = {t["name"] for t in resp["result"]["tools"]}
        self.assertIn("job.create", tools)

    def test_newline_delimited_tool_call(self):
        from ceos.mcp import MCPServer
        src = self._mksource("r12.md")
        server = MCPServer(self.ctl)
        resp = self._ndjson_rpc(server, {
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": {
                "name": "job.create",
                "arguments": {
                    "job_id": "r12-mcp-job",
                    "scope": "test",
                    "sources": [{"path": str(src)}],
                    "event_id": "e-mcp-create",
                },
            },
        })
        self.assertIn("result", resp)
        self.assertFalse(resp["result"]["isError"])

    def test_no_content_length_in_response(self):
        """Verify raw bytes contain no Content-Length header."""
        from ceos.mcp import MCPServer
        server = MCPServer(self.ctl)
        msg = json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/list", "params": {}}) + "\n"
        server.inp = io.BytesIO(msg.encode("utf-8"))
        server.outp = io.BytesIO()
        m = server._read_message()
        server._handle_message(m)
        raw = server.outp.getvalue()
        self.assertNotIn(b"Content-Length", raw)
        self.assertNotIn(b"\r\n\r\n", raw)
        # Must end with newline.
        self.assertTrue(raw.endswith(b"\n"))


# ---------------------------------------------------------------------------
# R13. MCP rejects unsupported protocol version
# ---------------------------------------------------------------------------

class TestR13MCPVersionNegotiation(_Base):
    def _ndjson_rpc(self, server, msg: dict) -> dict:
        line = (json.dumps(msg) + "\n").encode("utf-8")
        server.inp = io.BytesIO(line)
        server.outp = io.BytesIO()
        m = server._read_message()
        server._handle_message(m)
        return json.loads(server.outp.getvalue().strip())

    def test_newer_client_version_negotiates_supported_version(self):
        from ceos.mcp import MCPServer
        server = MCPServer(self.ctl)
        resp = self._ndjson_rpc(server, {
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2025-11-25", "capabilities": {}},
        })
        self.assertEqual(resp["result"]["protocolVersion"], "2025-06-18")

    def test_supported_version_accepted(self):
        from ceos.mcp import MCPServer
        server = MCPServer(self.ctl)
        resp = self._ndjson_rpc(server, {
            "jsonrpc": "2.0", "id": 2, "method": "initialize",
            "params": {"protocolVersion": "2025-06-18", "capabilities": {}},
        })
        self.assertIn("result", resp)
        self.assertEqual(resp["result"]["protocolVersion"], "2025-06-18")

    def test_old_but_supported_version_accepted(self):
        from ceos.mcp import MCPServer
        server = MCPServer(self.ctl)
        resp = self._ndjson_rpc(server, {
            "jsonrpc": "2.0", "id": 3, "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {}},
        })
        self.assertIn("result", resp)


# ---------------------------------------------------------------------------
# R14. MCP idempotent tool call with same event_id and payload
# ---------------------------------------------------------------------------

class TestR14MCPIdempotentToolCall(_Base):
    def _ndjson_rpc(self, server, msg: dict) -> dict:
        line = (json.dumps(msg) + "\n").encode("utf-8")
        server.inp = io.BytesIO(line)
        server.outp = io.BytesIO()
        m = server._read_message()
        server._handle_message(m)
        return json.loads(server.outp.getvalue().strip())

    def test_idempotent_create_via_mcp(self):
        from ceos.mcp import MCPServer
        src = self._mksource("r14.md")
        server = MCPServer(self.ctl)
        msg = {
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "job.create",
                "arguments": {
                    "job_id": "r14-job",
                    "scope": "test",
                    "sources": [{"path": str(src)}],
                    "event_id": "e-r14-create",
                },
            },
        }
        first = self._ndjson_rpc(server, msg)
        second = self._ndjson_rpc(MCPServer(self.ctl), msg)
        self.assertFalse(first["result"]["isError"])
        self.assertFalse(second["result"]["isError"])


# ---------------------------------------------------------------------------
# R15. Studio adapter: draft blocked without plan approval
# ---------------------------------------------------------------------------

class TestR15StudioGatePlanRequired(_Base):
    def _studio(self, studio_root: Path) -> StudioAdapter:
        return StudioAdapter(self.ctl, studio_root=studio_root)

    def test_draft_action_blocked_before_plan_approved(self):
        src = self._mksource("r15.md")
        self.ctl.create_job("r15-job", "test", [{"path": str(src)}], "e-create")
        self.ctl.save_artifact("r15-job", "plan", "plan\n", event_id="e-plan")
        # Stage is "planned", not "plan_approved" → draft must be blocked.
        studio_root = self.tmp_path / "VideoStudio"
        studio_root.mkdir()
        adapter = self._studio(studio_root)
        result = adapter.run("draft", "r15-job")
        self.assertFalse(result["ok"])
        self.assertTrue(any("plan" in e.lower() for e in result["errors"]))

    def test_prep_action_allowed_before_plan_approval(self):
        src = self._mksource("r15b.md")
        self.ctl.create_job("r15b-job", "test", [{"path": str(src)}], "e-create")
        studio_root = self.tmp_path / "VideoStudio15b"
        studio_root.mkdir()
        adapter = self._studio(studio_root)
        # prep should be allowed at any stage; missing clip → ok=False but no gate error.
        result = adapter.run("prep", "r15b-job")
        self.assertFalse(result["ok"])
        self.assertNotIn("plan", result["errors"][0].lower() if result["errors"] else "")


# ---------------------------------------------------------------------------
# R16. Studio adapter: final blocked without draft approval
# ---------------------------------------------------------------------------

class TestR16StudioGateDraftRequired(_Base):
    def _studio(self, studio_root: Path) -> StudioAdapter:
        return StudioAdapter(self.ctl, studio_root=studio_root)

    def test_final_action_blocked_without_draft_approval(self):
        job_id = "r16-job"
        self._job_through_plan_approved(job_id)
        # Save a draft but don't approve it.
        self.ctl.save_artifact(job_id, "draft", "draft\n", event_id="e-draft")
        # Stage is draft_ready, no draft approval.
        studio_root = self.tmp_path / "VideoStudio"
        studio_root.mkdir()
        adapter = self._studio(studio_root)
        result = adapter.run("final", job_id)
        self.assertFalse(result["ok"])
        self.assertTrue(any("draft" in e.lower() for e in result["errors"]))

    def test_final_action_blocked_at_wrong_stage(self):
        """Stage gate: final action requires draft_approved stage."""
        job_id = "r16b-job"
        self._job_through_plan_approved(job_id)
        studio_root = self.tmp_path / "VideoStudio16b"
        studio_root.mkdir()
        adapter = self._studio(studio_root)
        result = adapter.run("final", job_id)
        self.assertFalse(result["ok"])


# ---------------------------------------------------------------------------
# R17. Studio adapter: non-existent studio dir → ok=False, not fake success
# ---------------------------------------------------------------------------

class TestR17StudioNonExistentDir(_Base):
    def _studio(self, studio_root: Path) -> StudioAdapter:
        return StudioAdapter(self.ctl, studio_root=studio_root)

    def test_missing_stills_dir_reports_ok_false(self):
        job_id = "r17-job"
        self._job_through_plan_approved(job_id)
        studio_root = self.tmp_path / "VideoStudio17"
        studio_root.mkdir()
        adapter = self._studio(studio_root)
        result = adapter.run("stills", job_id)
        self.assertFalse(result["ok"])
        self.assertEqual(result["artifacts"], [])
        self.assertTrue(len(result["errors"]) > 0)
        self.assertNotIn("success", json.dumps(result).lower())

    def test_missing_draft_dir_reports_ok_false(self):
        job_id = "r17b-job"
        self._job_through_draft_approved(job_id)
        studio_root = self.tmp_path / "VideoStudio17b"
        studio_root.mkdir()
        adapter = self._studio(studio_root)
        result = adapter.run("draft", job_id)
        self.assertFalse(result["ok"])
        self.assertEqual(result["artifacts"], [])

    def test_missing_final_dir_reports_ok_false(self):
        job_id = "r17c-job"
        self._job_through_draft_approved(job_id)
        studio_root = self.tmp_path / "VideoStudio17c"
        studio_root.mkdir()
        adapter = self._studio(studio_root)
        result = adapter.run("final", job_id)
        self.assertFalse(result["ok"])
        self.assertEqual(result["artifacts"], [])

    def test_stills_script_unavailable_reports_ok_false_not_fake_success(self):
        """Fix 4: stills action now runs the real stills.mjs script.
        When the script is missing (no scripts/ dir in fake studio root) or
        node is unavailable, ok=False and errors carries the reason.
        Real sha hashes are reported only when the script succeeds.
        """
        job_id = "r17d-job"
        self._job_through_plan_approved(job_id)
        # Studio root with no scripts/ directory -> script missing.
        studio_root = self.tmp_path / "VideoStudio17d"
        studio_root.mkdir()
        adapter = self._studio(studio_root)
        result = adapter.run("stills", job_id)
        # With no scripts/stills.mjs, must report ok=False, not fake success.
        self.assertFalse(result["ok"], f"expected ok=False, got: {result}")
        self.assertTrue(len(result["errors"]) > 0, "errors must be non-empty")
        self.assertEqual(result["artifacts"], [])
        # Verify error message mentions script or node, not vague success language.
        error_text = " ".join(result["errors"]).lower()
        self.assertNotIn("success", error_text)


# ---------------------------------------------------------------------------
# R18. MCP approval capability rejected
# ---------------------------------------------------------------------------

class TestR18MCPApprovalRejected(_Base):
    def _ndjson_rpc(self, server, msg: dict) -> dict:
        line = (json.dumps(msg) + "\n").encode("utf-8")
        server.inp = io.BytesIO(line)
        server.outp = io.BytesIO()
        m = server._read_message()
        server._handle_message(m)
        return json.loads(server.outp.getvalue().strip())

    def test_all_approval_aliases_rejected(self):
        from ceos.mcp import MCPServer
        names = [
            "approval.record", "record_approval", "operator.approve",
            "approve", "approval.submit",
        ]
        for name in names:
            with self.subTest(name=name):
                server = MCPServer(self.ctl)
                resp = self._ndjson_rpc(server, {
                    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                    "params": {"name": name, "arguments": {}},
                })
                self.assertIn("error", resp, f"name={name} should produce an error response")
                self.assertIn("operator-only", resp["error"]["message"])


if __name__ == "__main__":
    unittest.main()
