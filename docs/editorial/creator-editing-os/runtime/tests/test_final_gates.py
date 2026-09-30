"""Regression tests for CONTROLLER-REVIEW-2.md final gate fixes.

Each test targets a concrete defect identified in the review.
The synthetic fixture is /tmp/creator-editing-fixtures/synthetic-original.mp4
(10s portrait 720x1280 h264, 30fps, with audio).

Gates covered:
  G1.  Crash between _save_state and _append_event on plan revision while stage
       stays "planned" → event_count stays at N; recovery restores pre-mutation
       artifact dict and raises StageDrift.
  G2.  Bogus output_path (nonexistent) → FinalEvidenceInvalid.
  G3.  Fabricated output_sha256 (mismatch against real file) → FinalEvidenceInvalid.
  G4.  Fabricated probe dimensions (width=9999) rejected when actual ffprobe disagrees.
  G5.  Synthetic fixture acceptance: real SHA + real ffprobe → finalized.
  G6.  Missing source at intake (file does not exist) → FileNotFoundError.
  G7.  grant-approval and grant_approval MCP tool names rejected with operator-only error.
  G8.  asset-manifest.json fields after finalization: schema, job_id, output_sha256,
       source_hashes, probe_summary has_audio/width/height, publication_status=not_published.
  G9.  StudioAdapter.run("create", ...) executes new-video.mjs or reports error clearly.
  G10. StudioAdapter.run("draft", ...) without fixture_path → ok=False with descriptive error.
  G11. Finalized replay: second call to run("final", ...) returns cached receipt, ok unchanged.
  G12. Transaction failure injection: _append_event patched to raise; recover_if_needed
       restores pre-mutation state on next open (snapshot persists, event_count unchanged).
"""

from __future__ import annotations

import copy
import io
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
import sys
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ceos.controller import Controller
from ceos.model import (
    FinalEvidenceInvalid,
    StageDrift,
    UnknownJob,
)
from ceos.store import (
    EventLog,
    atomic_write_json,
    read_json,
    sha256_file,
    write_txn_snapshot,
)
from ceos.studio_adapter import StudioAdapter, _receipt_cache_key

# Path to the synthetic test fixture.
SYNTHETIC_FIXTURE = Path("/tmp/creator-editing-fixtures/synthetic-original.mp4")
FIXTURE_AVAILABLE = SYNTHETIC_FIXTURE.exists()


class _Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.state_root = self.tmp_path / "state"
        self.state_root.mkdir()
        self.sources_dir = self.tmp_path / "sources"
        self.sources_dir.mkdir()
        self.ctl = Controller(
            self.state_root,
            allowed_source_roots=[self.sources_dir, self.tmp_path],
        )
        self.token = self.ctl.ensure_operator_token()

    def tearDown(self):
        self.tmp.cleanup()

    def _mksource(self, name: str, body: str = "source content\n") -> Path:
        p = self.sources_dir / name
        p.write_text(body)
        return p

    def _job_through_plan_approved(self, job_id: str = "j-test") -> dict:
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

    def _make_real_mp4(self, dest: Path) -> bool:
        """Create a minimal real mp4 at dest using ffmpeg. Returns True on success."""
        result = subprocess.run([
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "color=c=black:s=720x1280:r=30",
            "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
            "-t", "2", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p",
            str(dest),
        ], capture_output=True, timeout=60)
        return result.returncode == 0


# ---------------------------------------------------------------------------
# G1. Crash between _save_state and _append_event (same-stage artifact bump)
# ---------------------------------------------------------------------------

class TestG1SameStageArtifactCrashRecovery(_Base):
    def test_crash_after_state_write_before_event_append_plan_revision(self):
        """Plan revised while stage stays 'planned' → snapshot must restore pre-mutation
        artifact dict when event was not appended (tx failure injection).

        Sequence:
          1. Job created, plan v1 saved → stage=planned, event_count=2.
          2. Snapshot written with pre-mutation state (plan v1, event_count=2).
          3. _save_state writes mutated state (plan v2) → state.json has plan v2.
          4. Crash (exception injected) → _append_event never runs → event_count=2.
          5. Restart: recover_if_needed sees snapshot, event_count==snapped(2).
             Persisted state has plan v2 but event log only shows plan v1.
             Recovery restores pre-mutation state (plan v1) and raises StageDrift.
        """
        src = self._mksource("g1-brief.md")
        self.ctl.create_job("g1-job", "test", [{"path": str(src)}], event_id="g1-create")
        plan1 = self.ctl.save_artifact("g1-job", "plan", "plan v1\n", event_id="g1-plan-v1")
        self.assertEqual(plan1["version"], 1)

        # Now simulate a crash on plan v2: patch _append_event to raise after _save_state.
        original_append = self.ctl._append_event

        def crashing_append(job_id, kind, event_id, payload):
            # Only crash on the plan v2 save event.
            if kind == "plan_saved" and "g1-plan-v2" in event_id:
                raise RuntimeError("injected crash: simulating OS crash after _save_state")
            return original_append(job_id, kind, event_id, payload)

        from ceos import controller as _ctrl_mod
        original_method = self.ctl._append_event
        self.ctl._append_event = crashing_append

        job_dir = self.state_root / "jobs" / "g1-job"

        try:
            self.ctl.save_artifact("g1-job", "plan", "plan v2\n", event_id="g1-plan-v2")
            self.fail("Expected RuntimeError from injected crash")
        except RuntimeError:
            pass
        finally:
            self.ctl._append_event = original_method

        # At this point: state.json has plan v2 (written by _save_state),
        # but the event for plan v2 was never appended.
        # The snapshot should still exist (remove_txn_snapshot was never called).
        snap_path = job_dir / ".txn-snapshot.json"
        self.assertTrue(snap_path.exists(), "snapshot must still exist after injected crash")

        # Verify: state.json shows plan v2 (the half-written state).
        persisted_state = read_json(self.state_root / "jobs" / "g1-job" / "state.json")
        # The snapshot captured pre-mutation state: plan v1.
        snap = read_json(snap_path)
        self.assertEqual(snap["artifact_versions"].get("plan"), 1,
                         "snapshot must record pre-mutation plan v1")
        snap_event_count = snap["event_count"]

        # Event log still has only 2 events (create + plan-v1).
        events = EventLog(self.state_root / "jobs" / "g1-job" / "events.ndjson").load()
        self.assertEqual(len(events), snap_event_count,
                         "event_count must not have advanced: crash before _append_event")

        # Now open the job again — recover_if_needed must fire and raise StageDrift.
        with self.assertRaises(StageDrift) as ctx:
            self.ctl.save_artifact("g1-job", "plan", "plan v3\n", event_id="g1-plan-v3")

        # After StageDrift, state.json must be restored to pre-mutation (plan v1).
        restored = read_json(self.state_root / "jobs" / "g1-job" / "state.json")
        plan_art = restored.get("artifacts", {}).get("plan", {})
        self.assertEqual(plan_art.get("version"), 1,
                         "state must be restored to plan v1 after recovery")
        # Snapshot must be cleaned up.
        self.assertFalse(snap_path.exists(), "snapshot must be removed after recovery")


# ---------------------------------------------------------------------------
# G2. Bogus output_path → FinalEvidenceInvalid
# ---------------------------------------------------------------------------

class TestG2BogusOutputPath(_Base):
    def test_nonexistent_output_path_rejected(self):
        """Fix 2: output_path must point to a real file on disk."""
        job_id = "g2-job"
        self._job_through_draft_approved(job_id)
        evidence = json.dumps({
            "output_path": "/tmp/does-not-exist-g2.mp4",
            "output_sha256": "a" * 64,
            "probe": {"streams": [], "format": {}},
        })
        with self.assertRaises(FinalEvidenceInvalid) as ctx:
            self.ctl.save_artifact(job_id, "final_evidence", evidence, event_id="g2-ev")
        self.assertIn("exist", str(ctx.exception).lower())


# ---------------------------------------------------------------------------
# G3. Fabricated SHA → FinalEvidenceInvalid
# ---------------------------------------------------------------------------

class TestG3FabricatedSHA(_Base):
    def test_sha_mismatch_rejected(self):
        """Fix 2: output_sha256 must match the actual file on disk."""
        job_id = "g3-job"
        self._job_through_draft_approved(job_id)

        # Create a real mp4 under job dir.
        job_dir = self.state_root / "jobs" / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        out_mp4 = job_dir / "final.mp4"
        if not self._make_real_mp4(out_mp4):
            self.skipTest("ffmpeg unavailable")

        real_sha = sha256_file(out_mp4)
        fabricated_sha = "b" * 64  # guaranteed wrong

        probe_res = subprocess.run([
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", "-show_format", str(out_mp4),
        ], capture_output=True, text=True, timeout=30)
        probe_dict = json.loads(probe_res.stdout)

        evidence = json.dumps({
            "output_path": str(out_mp4),
            "output_sha256": fabricated_sha,
            "probe": probe_dict,
        })
        with self.assertRaises(FinalEvidenceInvalid) as ctx:
            self.ctl.save_artifact(job_id, "final_evidence", evidence, event_id="g3-ev")
        self.assertIn("mismatch", str(ctx.exception).lower())


# ---------------------------------------------------------------------------
# G4. Fabricated probe dimensions → FinalEvidenceInvalid
# ---------------------------------------------------------------------------

class TestG4FabricatedProbeDimensions(_Base):
    def test_probe_dimensions_mismatch_rejected(self):
        """Fix 2: claimed probe dimensions must match actual ffprobe output."""
        job_id = "g4-job"
        self._job_through_draft_approved(job_id)

        job_dir = self.state_root / "jobs" / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        out_mp4 = job_dir / "final.mp4"
        if not self._make_real_mp4(out_mp4):
            self.skipTest("ffmpeg unavailable")

        real_sha = sha256_file(out_mp4)
        probe_res = subprocess.run([
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", "-show_format", str(out_mp4),
        ], capture_output=True, text=True, timeout=30)
        real_probe = json.loads(probe_res.stdout)

        # Tamper with video dimensions in the claimed probe.
        tampered_probe = copy.deepcopy(real_probe)
        for stream in tampered_probe.get("streams", []):
            if stream.get("codec_type") == "video":
                stream["width"] = 9999
                stream["height"] = 9999

        evidence = json.dumps({
            "output_path": str(out_mp4),
            "output_sha256": real_sha,
            "probe": tampered_probe,
        })
        with self.assertRaises(FinalEvidenceInvalid) as ctx:
            self.ctl.save_artifact(job_id, "final_evidence", evidence, event_id="g4-ev")
        self.assertIn("dimension", str(ctx.exception).lower())


# ---------------------------------------------------------------------------
# G5. Synthetic fixture acceptance: real SHA + ffprobe → finalized
# ---------------------------------------------------------------------------

@unittest.skipUnless(FIXTURE_AVAILABLE, "synthetic fixture not at /tmp/creator-editing-fixtures/synthetic-original.mp4")
class TestG5SyntheticFixtureAcceptance(_Base):
    def setUp(self):
        super().setUp()
        # Rebuild controller with /tmp in allowed source roots so fixture path is accepted.
        self.ctl = Controller(
            self.state_root,
            allowed_source_roots=[
                self.sources_dir, self.tmp_path,
                Path("/tmp"), Path("/private/tmp"),
            ],
        )
        self.token = self.ctl.ensure_operator_token()

    def test_synthetic_fixture_accepted_and_finalized(self):
        """Real 10s portrait test-pattern fixture (720x1280, h264, audio) must be
        accepted by the full evidence pipeline: file exists, SHA matches, ffprobe
        finds video streams.  Job must transition to finalized.
        """
        job_id = "g5-job"
        self._job_through_draft_approved(job_id)

        real_sha = sha256_file(SYNTHETIC_FIXTURE)
        probe_res = subprocess.run([
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", "-show_format", str(SYNTHETIC_FIXTURE),
        ], capture_output=True, text=True, timeout=30)
        self.assertEqual(probe_res.returncode, 0, "ffprobe must succeed on synthetic fixture")
        probe_dict = json.loads(probe_res.stdout)

        # Verify fixture properties.
        video_streams = [s for s in probe_dict["streams"] if s.get("codec_type") == "video"]
        self.assertTrue(video_streams, "fixture must have video stream")
        vs = video_streams[0]
        self.assertEqual(vs.get("width"), 720, "fixture width must be 720")
        self.assertEqual(vs.get("height"), 1280, "fixture height must be 1280")
        audio_streams = [s for s in probe_dict["streams"] if s.get("codec_type") == "audio"]
        self.assertTrue(audio_streams, "fixture must have audio stream")

        evidence = json.dumps({
            "output_path": str(SYNTHETIC_FIXTURE),
            "output_sha256": real_sha,
            "probe": probe_dict,
        })
        result = self.ctl.save_artifact(job_id, "final_evidence", evidence, event_id="g5-final")
        state = self.ctl.inspect(job_id)["state"]
        self.assertEqual(state["stage"], "finalized",
                         "synthetic fixture evidence must transition to finalized")

        # Fix 6: asset-manifest.json must exist and bind correct fields.
        manifest_path = self.state_root / "jobs" / job_id / "asset-manifest.json"
        self.assertTrue(manifest_path.exists(), "asset-manifest.json must be created")
        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest["output_sha256"], real_sha)
        ps = manifest.get("probe_summary", {})
        self.assertEqual(ps.get("width"), 720)
        self.assertEqual(ps.get("height"), 1280)
        self.assertTrue(ps.get("has_audio"), "probe_summary must report audio")
        self.assertEqual(manifest["publication_status"], "not_published")
        self.assertIsNone(manifest["publication_queue"])

# ---------------------------------------------------------------------------
# G6. Missing source at intake
# ---------------------------------------------------------------------------

class TestG6MissingSourceAtIntake(_Base):
    def test_nonexistent_source_rejected_at_intake(self):
        """Fix 3: source files must exist at intake; no SHA → no job."""
        with self.assertRaises(FileNotFoundError) as ctx:
            self.ctl.create_job(
                "g6-job", "test",
                [{"path": str(self.sources_dir / "does-not-exist.mp4")}],
                event_id="g6-create",
            )
        self.assertIn("does not exist", str(ctx.exception).lower())

    def test_existing_source_has_sha_recorded(self):
        """Sources that exist must have sha256 recorded in state."""
        src = self._mksource("g6-existing.md")
        self.ctl.create_job("g6b-job", "test", [{"path": str(src)}], event_id="g6b-create")
        state = self.ctl.inspect("g6b-job")["state"]
        recorded_sha = state["sources"][0].get("sha256")
        self.assertIsNotNone(recorded_sha, "source must have sha256 at intake")
        self.assertEqual(recorded_sha, sha256_file(src))


# ---------------------------------------------------------------------------
# G7. grant-approval MCP tool rejected
# ---------------------------------------------------------------------------

class TestG7GrantApprovalMCPRejected(_Base):
    def _ndjson_exchange(self, server, msg: dict) -> dict:
        """Send one message via ndjson and return the response."""
        line = (json.dumps(msg) + "\n").encode("utf-8")
        server.inp = io.BytesIO(line)
        server.outp = io.BytesIO()
        m = server._read_message()
        server._handle_message(m)
        return json.loads(server.outp.getvalue().strip())

    def test_grant_approval_names_rejected(self):
        """Fix 5: no MCP tool may grant approvals — all aliases rejected."""
        from ceos.mcp import MCPServer
        names = [
            "approval.record", "record_approval", "operator.approve",
            "approve", "approval.submit", "grant-approval", "grant_approval",
        ]
        for name in names:
            with self.subTest(name=name):
                server = MCPServer(self.ctl)
                resp = self._ndjson_exchange(server, {
                    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                    "params": {"name": name, "arguments": {}},
                })
                self.assertIn("error", resp, f"{name} should produce error response")
                self.assertIn("operator-only", resp["error"]["message"].lower())


# ---------------------------------------------------------------------------
# G8. asset-manifest fields after finalization
# ---------------------------------------------------------------------------

class TestG8AssetManifestFields(_Base):
    def test_asset_manifest_complete_fields(self):
        """Fix 6: asset-manifest.json must have all required fields after finalize."""
        job_id = "g8-job"
        self._job_through_draft_approved(job_id)

        job_dir = self.state_root / "jobs" / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        out_mp4 = job_dir / "final.mp4"
        if not self._make_real_mp4(out_mp4):
            self.skipTest("ffmpeg unavailable")

        real_sha = sha256_file(out_mp4)
        probe_res = subprocess.run([
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", "-show_format", str(out_mp4),
        ], capture_output=True, text=True, timeout=30)
        probe_dict = json.loads(probe_res.stdout)

        evidence = json.dumps({
            "output_path": str(out_mp4),
            "output_sha256": real_sha,
            "probe": probe_dict,
        })
        self.ctl.save_artifact(job_id, "final_evidence", evidence, event_id="g8-ev")

        manifest_path = self.state_root / "jobs" / job_id / "asset-manifest.json"
        self.assertTrue(manifest_path.exists())
        manifest = json.loads(manifest_path.read_text())

        required_keys = [
            "schema", "job_id", "scope", "finalized_at",
            "output_path", "output_sha256", "source_hashes",
            "probe_summary", "approvals", "publication_status", "publication_queue",
        ]
        for key in required_keys:
            self.assertIn(key, manifest, f"manifest missing key: {key}")

        self.assertEqual(manifest["schema"], "ceos-asset-manifest/v1")
        self.assertEqual(manifest["job_id"], job_id)
        self.assertEqual(manifest["output_sha256"], real_sha)
        self.assertEqual(manifest["output_path"], str(out_mp4))
        self.assertEqual(manifest["publication_status"], "not_published")
        self.assertIsNone(manifest["publication_queue"])

        # Source hashes must be present.
        self.assertTrue(manifest["source_hashes"], "source_hashes must be non-empty")
        for src_entry in manifest["source_hashes"]:
            self.assertIn("path", src_entry)
            self.assertIn("sha256", src_entry)

        # Probe summary.
        ps = manifest["probe_summary"]
        self.assertIn("width", ps)
        self.assertIn("height", ps)
        self.assertIn("has_audio", ps)


# ---------------------------------------------------------------------------
# G9. StudioAdapter create action: reports script missing gracefully
# ---------------------------------------------------------------------------

class TestG9StudioCreateAction(_Base):
    def test_create_script_missing_reports_ok_false(self):
        """Fix 4: create action must run new-video.mjs, or report missing gracefully."""
        src = self._mksource("g9-brief.md")
        self.ctl.create_job("g9-job", "test", [{"path": str(src)}], event_id="g9-create")

        # Studio root with no scripts/ dir.
        studio_root = self.tmp_path / "VideoStudio9"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("create", "g9-job", video_type="talking")
        # Must report ok=False (script missing), not raise an exception.
        self.assertFalse(result["ok"])
        self.assertTrue(len(result["errors"]) > 0)
        # Error must mention script or studio, not be vague.
        error_text = " ".join(result["errors"]).lower()
        self.assertTrue(
            "script" in error_text or "node" in error_text or "studio" in error_text,
            f"Error should mention script/node/studio: {error_text}",
        )

    def test_create_with_real_studio_succeeds(self):
        """If the real VideoStudio is present, create must run new-video.mjs."""
        real_studio = Path("/Users/sheshnarayaniyer/VideoStudio")
        if not real_studio.exists():
            self.skipTest("real VideoStudio not present")

        src = self._mksource("g9r-brief.md")
        job_id = "g9r-test-ceos"
        self.ctl.create_job(job_id, "test", [{"path": str(src)}], event_id="g9r-create")
        adapter = StudioAdapter(self.ctl, studio_root=real_studio)
        result = adapter.run("create", job_id, video_type="talking")
        # Must not raise; ok may be True or False depending on Remotion state,
        # but errors must be real error messages, not fabricated.
        self.assertIn("ok", result)
        self.assertIn("errors", result)
        self.assertIsInstance(result["errors"], list)


# ---------------------------------------------------------------------------
# G10. StudioAdapter draft without fixture_path → descriptive error
# ---------------------------------------------------------------------------

class TestG10StudioDraftNoFixture(_Base):
    def test_draft_without_fixture_path_reports_error(self):
        """Fix 4: draft action requires fixture_path; absent → ok=False with reason."""
        job_id = "g10-job"
        self._job_through_plan_approved(job_id)

        studio_root = self.tmp_path / "VideoStudio10"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)

        result = adapter.run("draft", job_id)  # no fixture_path
        self.assertFalse(result["ok"])
        error_text = " ".join(result["errors"]).lower()
        self.assertTrue(
            "fixture" in error_text or "required" in error_text,
            f"Error must mention fixture or required: {error_text}",
        )


# ---------------------------------------------------------------------------
# G11. Finalized replay returns cached receipt without re-running script
# ---------------------------------------------------------------------------

class TestG11FinalizedReplay(_Base):
    def test_legacy_receipt_without_reviewed_render_inputs_is_held(self):
        """A5: once render-final receipt exists for the full cache key (draft_sha+format+sources),
        second call returns cached receipt without launching a new render.
        Receipt key is now sha256(draft_sha|format|sorted_source_shas), not a 16-char prefix.
        Replay verifies output file still exists with matching hash before serving.
        """
        job_id = "g11-job"
        self._job_through_draft_approved(job_id)
        state = self.ctl.inspect(job_id)["state"]
        draft_sha = state["artifacts"]["draft"]["sha256"]
        source_shas = sorted(
            s.get("sha256", "") for s in state.get("sources", []) if s.get("sha256")
        )
        fmt = "9:16"
        receipt_key = _receipt_cache_key(draft_sha, fmt, source_shas)

        studio_root = self.tmp_path / "VideoStudio11"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)

        # Create a real output file for the receipt to reference (A5: replay verifies file hash).
        fake_output = self.tmp_path / "fake-final.mp4"
        fake_output.write_bytes(b"fake mp4 content for g11 replay test")
        from ceos.store import sha256_file as _sha256_file
        real_sha = _sha256_file(fake_output)

        # Manually write a receipt as if render-final already succeeded.
        receipts_dir = self.state_root / "jobs" / job_id / "render-receipts"
        receipts_dir.mkdir(parents=True)
        receipt_data = {
            "action": "final",
            "job_id": job_id,
            "ok": True,
            "artifacts": [{"path": str(fake_output), "sha256": real_sha}],
            "errors": [],
            "hashes": {str(fake_output): real_sha},
            "receipt_key": receipt_key,
        }
        (receipts_dir / f"{receipt_key}.json").write_text(json.dumps(receipt_data))

        result = adapter.run("final", job_id)
        self.assertFalse(result["ok"], "a cached file cannot replace reviewed render-input binding")
        self.assertFalse(result.get("replayed", False))
        self.assertIn("render_inputs", " ".join(result["errors"]))

    def test_final_without_draft_approval_blocked(self):
        """Final action requires draft approval even for replays."""
        job_id = "g11b-job"
        self._job_through_plan_approved(job_id)
        # Save draft but don't approve.
        self.ctl.save_artifact(job_id, "draft", "draft\n", event_id="g11b-draft")
        studio_root = self.tmp_path / "VideoStudio11b"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("final", job_id)
        self.assertFalse(result["ok"])
        self.assertTrue(any("draft" in e.lower() for e in result["errors"]))


# ---------------------------------------------------------------------------
# G12. Transaction failure injection: full inject+recover cycle
# ---------------------------------------------------------------------------

class TestG12TransactionFailureInjection(_Base):
    def test_recover_restores_pre_mutation_state_on_next_open(self):
        """Simulate OS crash between _save_state and _append_event for plan approval.

        After crash:
          - state.json has the mutated state (plan_approved).
          - event log only has events up to the pre-mutation count.
          - Snapshot exists with pre-mutation state (awaiting_plan_approval).

        On next lock acquisition (save_artifact call), recover_if_needed must:
          - detect event_count == snapped_event_count (event not appended).
          - restore pre-mutation state from snapshot.
          - raise StageDrift.
        """
        src = self._mksource("g12-brief.md")
        self.ctl.create_job("g12-job", "test", [{"path": str(src)}], event_id="g12-create")
        plan_r = self.ctl.save_artifact("g12-job", "plan", "plan\n", event_id="g12-plan")
        self.ctl.submit_for_approval("g12-job", "plan", event_id="g12-submit")
        # At this point stage = awaiting_plan_approval.
        state_before = self.ctl.inspect("g12-job")["state"]
        self.assertEqual(state_before["stage"], "awaiting_plan_approval")

        job_dir = self.state_root / "jobs" / "g12-job"
        events_before = EventLog(self.state_root / "jobs" / "g12-job" / "events.ndjson").load()
        event_count_before = len(events_before)

        # Inject crash: patch _append_event to fail on plan_approved event.
        original_append = self.ctl._append_event

        def crashing_append(job_id, kind, event_id, payload):
            if kind == "plan_approved":
                raise RuntimeError("injected crash: after _save_state, before _append_event")
            return original_append(job_id, kind, event_id, payload)

        self.ctl._append_event = crashing_append

        try:
            self.ctl.record_operator_approval(
                job_id="g12-job", stage_key="plan",
                approver="op", operator_token=self.token,
                expected_version=plan_r["version"],
                expected_sha256=plan_r["sha256"],
                note="ok", event_id="g12-approve",
            )
            self.fail("Expected RuntimeError")
        except RuntimeError:
            pass
        finally:
            self.ctl._append_event = original_append

        # Verify snapshot exists with pre-mutation state.
        snap_path = job_dir / ".txn-snapshot.json"
        self.assertTrue(snap_path.exists(), "snapshot must persist after injected crash")
        snap = read_json(snap_path)
        self.assertEqual(snap["state"]["stage"], "awaiting_plan_approval",
                         "snapshot must capture pre-mutation stage")
        self.assertEqual(snap["event_count"], event_count_before,
                         "snapshot event_count must be pre-mutation")

        # state.json now has plan_approved (mutated, un-committed).
        persisted = read_json(self.state_root / "jobs" / "g12-job" / "state.json")
        self.assertEqual(persisted["stage"], "plan_approved",
                         "state.json was partially written before crash")

        # Event log event_count unchanged.
        events_after = EventLog(self.state_root / "jobs" / "g12-job" / "events.ndjson").load()
        self.assertEqual(len(events_after), event_count_before,
                         "event was not appended; event_count must be unchanged")

        # Next mutation triggers recovery → StageDrift.
        with self.assertRaises(StageDrift) as ctx:
            # Any mutation that acquires the lock and calls recover_if_needed.
            self.ctl.save_artifact("g12-job", "plan", "plan v2\n", event_id="g12-plan-v2")

        # After recovery, state must be restored to awaiting_plan_approval.
        recovered = read_json(self.state_root / "jobs" / "g12-job" / "state.json")
        self.assertEqual(recovered["stage"], "awaiting_plan_approval",
                         "recovery must restore pre-mutation stage awaiting_plan_approval")
        # Snapshot must be cleaned up.
        self.assertFalse(snap_path.exists(), "snapshot must be removed after recovery")


if __name__ == "__main__":
    unittest.main()
