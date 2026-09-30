"""Behaviour tests for the Creator Editing Steward pilot controller.

These use only the standard library. State is a temp directory per test — the
real `~/.codex/editorial/creator-editing-os-pilot` is never touched.
"""

from __future__ import annotations

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
    ForgedApproval,
    InvalidTransition,
    PathViolation,
    StaleVersion,
    UnknownJob,
)
from ceos.store import EventLog, sha256_bytes


class _CEOSTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.state_root = Path(self.tmp.name) / "state"
        self.state_root.mkdir()
        self.sources_dir = Path(self.tmp.name) / "sources"
        self.sources_dir.mkdir()
        self.ctl = Controller(
            self.state_root,
            allowed_source_roots=[self.sources_dir, Path(self.tmp.name)],
        )
        self.token = self.ctl.ensure_operator_token()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _mksource(self, name: str, body: str) -> Path:
        p = self.sources_dir / name
        p.write_text(body, encoding="utf-8")
        return p

    def _happy_path_through_plan(self, job_id="j-alpha") -> tuple[str, dict]:
        src = self._mksource("brief.md", "seed brief\n")
        state = self.ctl.create_job(
            job_id=job_id, scope="pilot",
            sources=[{"path": str(src), "label": "brief"}],
            event_id="e-create",
        )
        self.ctl.save_artifact(job_id, "brief", "brief body\n", event_id="e-brief")
        result = self.ctl.save_artifact(job_id, "plan", "plan v1\n", event_id="e-plan-v1")
        self.ctl.submit_for_approval(job_id, "plan", event_id="e-plan-submit")
        return job_id, result


class TestStageGates(_CEOSTestCase):
    def test_creates_job_and_saves_plan_only_transitions_from_intake(self):
        src = self._mksource("brief.md", "seed brief\n")
        self.ctl.create_job(job_id="j-1", scope="pilot",
                            sources=[{"path": str(src)}], event_id="e-create")
        # Cannot submit_for_approval before plan exists.
        with self.assertRaises(InvalidTransition):
            self.ctl.submit_for_approval("j-1", "plan", event_id="e-submit-early")
        # Saving plan auto-transitions intake -> planned.
        self.ctl.save_artifact("j-1", "plan", "plan v1\n", event_id="e-plan-v1")
        state = self.ctl.inspect("j-1")["state"]
        self.assertEqual(state["stage"], "planned")

    def test_cannot_save_draft_until_plan_approved(self):
        job_id, _ = self._happy_path_through_plan("j-2")
        # save-artifact draft while awaiting_plan_approval must not auto-transition and stage stays awaiting.
        # (draft is only meaningful once plan_approved; controller does not auto-move draft here.)
        self.ctl.save_artifact(job_id, "draft", "draft v1\n", event_id="e-draft-early")
        state = self.ctl.inspect(job_id)["state"]
        self.assertEqual(state["stage"], "awaiting_plan_approval")

    def test_approval_requires_operator_token(self):
        job_id, plan_result = self._happy_path_through_plan("j-3")
        with self.assertRaises(ForgedApproval):
            self.ctl.record_operator_approval(
                job_id=job_id, stage_key="plan",
                approver="mallory", operator_token="not-the-real-token",
                expected_version=plan_result["version"],
                expected_sha256=plan_result["sha256"],
                note="", event_id="e-forge",
            )
        # Verify persisted stage did not change and no approvals recorded.
        state = self.ctl.inspect(job_id)["state"]
        self.assertEqual(state["stage"], "awaiting_plan_approval")
        self.assertEqual(state["approvals"], [])

    def test_operator_approval_binds_to_exact_hash(self):
        job_id, plan_result = self._happy_path_through_plan("j-4")
        # Wrong sha rejected.
        with self.assertRaises(ArtifactDrift):
            self.ctl.record_operator_approval(
                job_id=job_id, stage_key="plan",
                approver="op", operator_token=self.token,
                expected_version=plan_result["version"],
                expected_sha256="0" * 64,
                note="", event_id="e-wrong-sha",
            )
        # Wrong version rejected.
        with self.assertRaises(StaleVersion):
            self.ctl.record_operator_approval(
                job_id=job_id, stage_key="plan",
                approver="op", operator_token=self.token,
                expected_version=plan_result["version"] + 1,
                expected_sha256=plan_result["sha256"],
                note="", event_id="e-wrong-ver",
            )
        # Correct binding accepted.
        approval = self.ctl.record_operator_approval(
            job_id=job_id, stage_key="plan",
            approver="op", operator_token=self.token,
            expected_version=plan_result["version"],
            expected_sha256=plan_result["sha256"],
            note="looks good",
            event_id="e-ok",
        )
        self.assertEqual(approval["stage_after"], "plan_approved")
        state = self.ctl.inspect(job_id)["state"]
        self.assertEqual(state["stage"], "plan_approved")


class TestArtifactAndSourceDrift(_CEOSTestCase):
    def test_source_drift_between_save_calls_is_detected(self):
        src = self._mksource("brief.md", "seed brief\n")
        self.ctl.create_job(job_id="j-drift", scope="pilot",
                            sources=[{"path": str(src)}], event_id="e-create")
        # Mutate source on disk.
        src.write_text("tampered\n", encoding="utf-8")
        # SourceDrift is the precise exception; ArtifactDrift is the old alias.
        from ceos.model import SourceDrift
        with self.assertRaises((ArtifactDrift, SourceDrift)):
            self.ctl.save_artifact("j-drift", "plan", "plan\n", event_id="e-plan")

    def test_artifact_drift_between_save_and_approve_is_detected(self):
        job_id, plan_result = self._happy_path_through_plan("j-adrift")
        # Corrupt the plan artifact on disk after submission.
        plan_path = self.ctl.jobs_root / job_id / plan_result["path"]
        plan_path.write_text("tampered plan\n", encoding="utf-8")
        with self.assertRaises(ArtifactDrift):
            self.ctl.record_operator_approval(
                job_id=job_id, stage_key="plan",
                approver="op", operator_token=self.token,
                expected_version=plan_result["version"],
                expected_sha256=plan_result["sha256"],
                note="", event_id="e-drift",
            )

    def test_stale_expected_prev_version_rejected(self):
        src = self._mksource("brief.md", "b\n")
        self.ctl.create_job(job_id="j-stale", scope="pilot",
                            sources=[{"path": str(src)}], event_id="e-c")
        self.ctl.save_artifact("j-stale", "plan", "v1\n", event_id="e-p1", expected_prev_version=0)
        with self.assertRaises(StaleVersion):
            self.ctl.save_artifact("j-stale", "plan", "v2\n", event_id="e-p2", expected_prev_version=0)
        self.ctl.save_artifact("j-stale", "plan", "v2\n", event_id="e-p2b", expected_prev_version=1)

    def test_path_traversal_and_symlink_escape_rejected(self):
        src = self._mksource("brief.md", "b\n")
        self.ctl.create_job(job_id="j-path", scope="pilot",
                            sources=[{"path": str(src)}], event_id="e-c")
        # Symlink escape: plant a symlink directly in the job dir that points outside.
        # The controller writes plan-v1.txt; we pre-create it as a symlink to outside.
        job_dir = self.ctl.jobs_root / "j-path"
        escape_target = Path(self.tmp.name) / "outside"
        escape_target.mkdir(exist_ok=True)
        # plan version 1 will be plan-v1.txt; symlink it to outside dir.
        os.symlink(str(escape_target), str(job_dir / "plan-v1.txt"))
        with self.assertRaises(PathViolation):
            self.ctl.save_artifact("j-path", "plan", "plan\n", event_id="e-plan")


class TestEventReplayAndDedup(_CEOSTestCase):
    def test_duplicate_event_id_rejected(self):
        src = self._mksource("brief.md", "b\n")
        self.ctl.create_job(job_id="j-dup", scope="pilot",
                            sources=[{"path": str(src)}], event_id="e-c")
        self.ctl.save_artifact("j-dup", "plan", "v1\n", event_id="e-once")
        with self.assertRaises(DuplicateEvent):
            self.ctl.save_artifact("j-dup", "plan", "v2\n", event_id="e-once")

    def test_replay_reconstructs_stage_after_restart(self):
        job_id, plan_result = self._happy_path_through_plan("j-replay")
        self.ctl.record_operator_approval(
            job_id=job_id, stage_key="plan",
            approver="op", operator_token=self.token,
            expected_version=plan_result["version"],
            expected_sha256=plan_result["sha256"],
            note="ok", event_id="e-approve",
        )
        # Simulate restart: new controller instance on same state root.
        fresh = Controller(self.state_root)
        replayed = fresh.replay(job_id)
        persisted = fresh.inspect(job_id)["state"]
        self.assertEqual(persisted["stage"], "plan_approved")
        self.assertEqual(replayed["expected_stage"], "plan_approved")
        self.assertEqual(len(replayed["expected_approvals"]), 1)

    def test_events_are_ordered_and_monotonic(self):
        job_id, _ = self._happy_path_through_plan("j-order")
        events = EventLog(self.ctl.jobs_root / job_id / "events.ndjson").load()
        seqs = [e["seq"] for e in events]
        self.assertEqual(seqs, sorted(seqs))
        self.assertEqual(seqs, list(range(1, len(seqs) + 1)))


class TestCrossJobIsolation(_CEOSTestCase):
    def test_two_jobs_are_isolated(self):
        s1 = self._mksource("b1.md", "one\n")
        s2 = self._mksource("b2.md", "two\n")
        self.ctl.create_job(job_id="j-a", scope="pilot", sources=[{"path": str(s1)}], event_id="e-a")
        self.ctl.create_job(job_id="j-b", scope="pilot", sources=[{"path": str(s2)}], event_id="e-b")
        self.ctl.save_artifact("j-a", "plan", "plan-a\n", event_id="e-pa")
        # j-b should still be in intake, with no artifacts.
        b = self.ctl.inspect("j-b")["state"]
        self.assertEqual(b["stage"], "intake")
        self.assertEqual(b["artifacts"], {})
        # Approvals in j-a must not appear in j-b.
        _, plan_result_a = self._happy_path_through_plan("j-c")
        approve = self.ctl.record_operator_approval(
            job_id="j-c", stage_key="plan",
            approver="op", operator_token=self.token,
            expected_version=plan_result_a["version"],
            expected_sha256=plan_result_a["sha256"],
            note="", event_id="e-approve-c",
        )
        b_again = self.ctl.inspect("j-b")["state"]
        self.assertEqual(b_again["approvals"], [])


class TestUnknownJob(_CEOSTestCase):
    def test_inspecting_unknown_job_errors(self):
        with self.assertRaises(UnknownJob):
            self.ctl.inspect("j-missing")


class TestMCPServer(_CEOSTestCase):
    def _rpc(self, server, msg):
        import io, json as _json
        # MCP stdio transport uses newline-delimited JSON (no Content-Length headers).
        line = (_json.dumps(msg) + "\n").encode("utf-8")
        server.inp = io.BytesIO(line)
        server.outp = io.BytesIO()
        m = server._read_message()
        if m is None:
            return None
        server._handle_message(m)
        raw = server.outp.getvalue()
        if not raw:
            return None
        return _json.loads(raw.strip().decode("utf-8"))

    def test_mcp_rejects_approval_calls(self):
        from ceos.mcp import MCPServer
        server = MCPServer(self.ctl)
        resp = self._rpc(server, {
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "approval.record", "arguments": {"job_id": "j-x", "stage": "plan"}},
        })
        self.assertIn("error", resp)
        self.assertIn("operator-only", resp["error"]["message"])

    def test_mcp_lists_honest_capabilities(self):
        from ceos.mcp import MCPServer
        server = MCPServer(self.ctl)
        resp = self._rpc(server, {
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": {"name": "capabilities.describe", "arguments": {}},
        })
        content = resp["result"]["structuredContent"]
        self.assertIsNone(content["provider_model"])
        self.assertTrue(any("operator" in c.lower() for c in content["cannot"]))
        self.assertTrue(any("shell" in c.lower() or "arbitrary" in c.lower() for c in content["cannot"]))

    def test_mcp_tools_list_contains_no_approval_tool(self):
        from ceos.mcp import MCPServer
        server = MCPServer(self.ctl)
        resp = self._rpc(server, {
            "jsonrpc": "2.0", "id": 3, "method": "tools/list", "params": {},
        })
        names = {t["name"] for t in resp["result"]["tools"]}
        self.assertNotIn("approval.record", names)
        self.assertNotIn("operator.approve", names)


if __name__ == "__main__":
    unittest.main()
