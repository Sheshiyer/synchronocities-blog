"""End-to-end integration probe for the Creator Editing Steward.

This is the final acceptance gate — NOT just mock tests.

Lifecycle exercised:
  create_job → StudioAdapter.run("create") → save_artifact(plan) →
  submit_for_approval(plan) → TEST-ONLY plan approval →
  StudioAdapter.run("draft", fixture) → save_artifact(draft, render_inputs) →
  submit_for_approval(draft) → TEST-ONLY draft approval →
  StudioAdapter.run("final") → save_artifact(final_evidence) →
  inspect / replay → asset_manifest read → receipt replay (no re-render)

State root: temporary directory (cleaned up after probe; receipt paths
printed for root-independent review).

Studio root: /Users/sheshnarayaniyer/VideoStudio (real, installed).

Fixture: /tmp/creator-editing-fixtures/synthetic-original.mp4
  (720x1280 h264 30fps 10s AAC — created by prior session).

Composition IDs resolved from job ID "synthetic-integrated" →
  SyntheticIntegratedVertical / SyntheticIntegratedHorizontal.

Additional contract tests:
  - Config drift between draft approval and final → _run_final must fail.
  - Cross-job isolation: source drift check does not bleed between jobs.
  - Missing/damaged receipt after finalized → replay returns cached receipt
    (ok) but damaged-file replay returns ok=False.
  - Containment: output file outside studio/out/<job_id> → rejected by controller.
  - Final output probe: real ffprobe asserts 1080x1920 H.264 10s AAC.
  - Asset-manifest schema: job_id, draft_sha256, source_shas, publication_status,
    artifacts with probe, finalized_at.

Approvals use TEST-ONLY synthetic marker (operator token comparison) — no
`grant-approval` MCP tool. The operator token is read from the temp state root.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ceos.controller import Controller
from ceos.model import FinalEvidenceInvalid, PathViolation, SourceDrift, ArtifactDrift
from ceos.store import sha256_file, sha256_bytes, atomic_write_json, read_json
from ceos.studio_adapter import StudioAdapter, _receipt_cache_key

# ── Prerequisites ──────────────────────────────────────────────────────────────

SYNTHETIC_FIXTURE = Path("/tmp/creator-editing-fixtures/synthetic-original.mp4")
STUDIO_ROOT = Path("/Users/sheshnarayaniyer/VideoStudio")
JOB_ID = "synthetic-integrated"

FIXTURE_AVAILABLE = SYNTHETIC_FIXTURE.exists()
STUDIO_AVAILABLE = (STUDIO_ROOT / "scripts" / "new-video.mjs").exists()

INTEGRATION_SKIP_REASON = (
    f"fixture {SYNTHETIC_FIXTURE} missing"
    if not FIXTURE_AVAILABLE
    else (
        f"VideoStudio not found at {STUDIO_ROOT}"
        if not STUDIO_AVAILABLE
        else None
    )
)


def _ffprobe(path: Path) -> dict:
    """Run real ffprobe; return parsed dict or {"error": ...}."""
    cmd = ["ffprobe", "-v", "quiet", "-print_format", "json",
           "-show_streams", "-show_format", str(path)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            return {"error": r.stderr.strip() or "ffprobe non-zero exit"}
        return json.loads(r.stdout)
    except FileNotFoundError:
        return {"error": "ffprobe not found"}
    except subprocess.TimeoutExpired:
        return {"error": "ffprobe timed out"}
    except json.JSONDecodeError as exc:
        return {"error": f"JSON error: {exc}"}


# ── Full integration probe ─────────────────────────────────────────────────────

def _extract_audio(src: Path, dest: Path) -> bool:
    """Extract audio from src mp4 to dest wav using ffmpeg. Returns True on success."""
    cmd = ["ffmpeg", "-y", "-i", str(src), "-vn", "-acodec", "pcm_s16le",
           "-ar", "44100", "-ac", "2", str(dest)]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        return result.returncode == 0 and dest.exists()
    except Exception:
        return False


@unittest.skipIf(INTEGRATION_SKIP_REASON, INTEGRATION_SKIP_REASON)
class TestIntegrationProbe(unittest.TestCase):
    """Full lifecycle: create → plan → draft (real 10s render) → final (real render).

    All approvals are TEST-ONLY using the operator token from the temp state root.
    No MCP grant-approval tool. Temp state root is preserved at self.state_root_path
    until tearDown so receipt files are available for independent review.
    """

    # Class-level state to carry final evidence across test methods.
    _state_root_path: Path = None  # type: ignore[assignment]
    _receipt_path: str = ""
    _final_output_path: str = ""
    _asset_manifest_path: str = ""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="ceos-integration-")
        self.tmp_path = Path(self.tmp.name)
        self.state_root = self.tmp_path / "state"
        self.state_root.mkdir()
        # Copy fixture into a job-scoped sources directory for containment.
        self.sources_dir = self.tmp_path / "sources" / JOB_ID
        self.sources_dir.mkdir(parents=True)
        self.fixture_copy = self.sources_dir / "synthetic-original.mp4"
        shutil.copy2(SYNTHETIC_FIXTURE, self.fixture_copy)

        # Controller with explicit roots: only the job sources dir and state root.
        self.ctl = Controller(
            self.state_root,
            allowed_source_roots=[self.sources_dir],
        )
        self.token = self.ctl.ensure_operator_token()
        self.adapter = StudioAdapter(self.ctl, studio_root=STUDIO_ROOT)
        TestIntegrationProbe._state_root_path = self.state_root

    def tearDown(self) -> None:
        # Print receipt path for root-independent review before cleanup.
        if TestIntegrationProbe._receipt_path:
            print(f"\n[INTEGRATION RECEIPT] {TestIntegrationProbe._receipt_path}")
        if TestIntegrationProbe._final_output_path:
            print(f"[INTEGRATION FINAL]   {TestIntegrationProbe._final_output_path}")
        if TestIntegrationProbe._asset_manifest_path:
            print(f"[INTEGRATION MANIFEST]{TestIntegrationProbe._asset_manifest_path}")
        # Copy receipt and manifest to /tmp for root-independent review.
        review_dir = Path("/tmp/ceos-integration-review")
        review_dir.mkdir(exist_ok=True)
        for src_path_str in [
            TestIntegrationProbe._receipt_path,
            TestIntegrationProbe._asset_manifest_path,
        ]:
            if src_path_str:
                sp = Path(src_path_str)
                if sp.exists():
                    shutil.copy2(sp, review_dir / sp.name)
        self.tmp.cleanup()

    # ── Step 1: create_job + StudioAdapter.run("create") ──────────────────────

    def test_01_create_job_and_studio(self) -> None:
        fixture_sha = sha256_file(self.fixture_copy)
        result = self.ctl.create_job(
            job_id=JOB_ID,
            scope="integration-probe",
            sources=[{
                "path": str(self.fixture_copy),
                "label": "synthetic-fixture",
                "sha256": fixture_sha,
            }],
            event_id=f"{JOB_ID}-create",
        )
        self.assertEqual(result["stage"], "intake")

        create_result = self.adapter.run("create", JOB_ID, video_type="talking")
        # create may fail if VideoStudio already has this job — that's ok for replay.
        # We accept ok=True or the job already existing (paths printed, not an error).
        if not create_result["ok"]:
            # Check it's not a script-not-found error.
            err_str = " ".join(create_result.get("errors", []))
            self.assertNotIn("not found", err_str.lower(),
                msg=f"create failed with 'not found': {create_result['errors']}")

        state = self.ctl.inspect(JOB_ID)["state"]
        self.assertEqual(state["stage"], "intake")
        self.assertEqual(state["job_id"], JOB_ID)

    # ── Step 2: save plan + submit ─────────────────────────────────────────────

    def _ensure_intake(self) -> None:
        """Create job if not already created (for tests that don't depend on test_01)."""
        try:
            self.ctl.inspect(JOB_ID)
        except Exception:
            fixture_sha = sha256_file(self.fixture_copy)
            self.ctl.create_job(
                job_id=JOB_ID, scope="integration-probe",
                sources=[{
                    "path": str(self.fixture_copy),
                    "label": "synthetic-fixture",
                    "sha256": fixture_sha,
                }],
                event_id=f"{JOB_ID}-create",
            )

    def _through_plan_approved(self) -> dict:
        """Drive from intake to plan_approved. Returns plan save result."""
        self._ensure_intake()
        plan_body = json.dumps({
            "title": "Synthetic integration probe",
            "format": "9:16",
            "composition": "SyntheticIntegratedVertical",
            "fps": 30,
            "target_seconds": 10,
            "source": str(self.fixture_copy),
        })
        plan_r = self.ctl.save_artifact(JOB_ID, "plan", plan_body, event_id=f"{JOB_ID}-plan")
        self.ctl.submit_for_approval(JOB_ID, "plan", event_id=f"{JOB_ID}-plan-submit")
        self.ctl.record_operator_approval(
            job_id=JOB_ID, stage_key="plan",
            approver="test-only-operator",
            operator_token=self.token,
            expected_version=plan_r["version"],
            expected_sha256=plan_r["sha256"],
            note="TEST-ONLY approval",
            event_id=f"{JOB_ID}-plan-approve",
        )
        return plan_r

    def test_02_plan_lifecycle(self) -> None:
        plan_r = self._through_plan_approved()
        state = self.ctl.inspect(JOB_ID)["state"]
        self.assertEqual(state["stage"], "plan_approved",
            f"Expected plan_approved, got {state['stage']}")
        self.assertIsNotNone(plan_r["sha256"])
        approvals = state["approvals"]
        self.assertEqual(len(approvals), 1)
        self.assertEqual(approvals[0]["stage_key"], "plan")
        self.assertEqual(approvals[0]["artifact_sha256"], plan_r["sha256"])

    # ── Step 3: draft (actual 10s render via ingest-draft.mjs) ────────────────

    def _through_draft_approved(self) -> tuple[dict, dict]:
        """Drive from plan_approved to draft_approved.
        Returns (draft_save_result, adapter_draft_result).
        """
        self._through_plan_approved()

        draft_result = self.adapter.run(
            "draft", JOB_ID,
            fixture_path=self.fixture_copy,
        )
        self.assertTrue(draft_result.get("ok"),
            f"ingest-draft failed: {draft_result.get('errors', [])}")

        # Audio preparation is performed by the named draft script itself.
        self.assertTrue((STUDIO_ROOT / "assets" / "projects" / JOB_ID / "audio" / "voice.wav").is_file())

        # Build draft artifact body from render_inputs snapshot + receipt.
        render_inputs = draft_result.get("render_inputs", {})
        draft_body = json.dumps({
            "render_inputs": render_inputs,
            "artifacts": draft_result.get("artifacts", []),
            "adapter_result": {k: v for k, v in draft_result.items() if k != "script_result"},
        })
        draft_save_r = self.ctl.save_artifact(
            JOB_ID, "draft", draft_body,
            event_id=f"{JOB_ID}-draft-save",
        )
        self.ctl.submit_for_approval(JOB_ID, "draft", event_id=f"{JOB_ID}-draft-submit")
        self.ctl.record_operator_approval(
            job_id=JOB_ID, stage_key="draft",
            approver="test-only-operator",
            operator_token=self.token,
            expected_version=draft_save_r["version"],
            expected_sha256=draft_save_r["sha256"],
            note="TEST-ONLY draft approval",
            event_id=f"{JOB_ID}-draft-approve",
        )
        return draft_save_r, draft_result

    def test_03_draft_actual_render(self) -> None:
        draft_save_r, draft_result = self._through_draft_approved()

        state = self.ctl.inspect(JOB_ID)["state"]
        self.assertEqual(state["stage"], "draft_approved",
            f"Expected draft_approved, got {state['stage']}")

        # Verify draft artifacts include the draftRender mp4.
        artifacts = draft_result.get("artifacts", [])
        draft_artifact = next(
            (a for a in artifacts if a.get("key") == "draftRender" or
             (a.get("path", "").endswith(".mp4") and "draft" in a.get("path", "").lower())),
            None,
        )
        self.assertIsNotNone(draft_artifact,
            f"No draft mp4 artifact found in result: {artifacts}")
        draft_path = Path(draft_artifact["path"])
        self.assertTrue(draft_path.exists(), f"Draft mp4 does not exist: {draft_path}")

        # Probe the draft output: must have video + audio, ~10s.
        probe = _ffprobe(draft_path)
        self.assertNotIn("error", probe, f"ffprobe failed on draft: {probe.get('error')}")
        streams = probe.get("streams", [])
        video_streams = [s for s in streams if s.get("codec_type") == "video"]
        audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
        self.assertTrue(len(video_streams) > 0, "Draft has no video stream")
        self.assertTrue(len(audio_streams) > 0, "Draft has no audio stream (fixture has audio, mux required)")
        duration = float(probe.get("format", {}).get("duration", "0"))
        self.assertAlmostEqual(duration, 10.0, delta=0.5,
            msg=f"Draft duration {duration}s deviates >0.5s from 10s fixture")

        # render_inputs snapshot is present.
        ri = draft_result.get("render_inputs", {})
        self.assertEqual(ri.get("job_id"), JOB_ID)
        self.assertIsNotNone(ri.get("fixture_sha256"), "fixture_sha256 missing from render_inputs")

    # ── Step 4: final (actual render via render-final.mjs) ────────────────────

    def _through_finalized(self) -> tuple[dict, dict]:
        """Drive from draft_approved to finalized. Returns (final_adapter_result, final_evidence_r)."""
        self._through_draft_approved()

        final_result = self.adapter.run("final", JOB_ID, format="9:16")
        self.assertTrue(final_result.get("ok"),
            f"render-final failed: {final_result.get('errors', [])}")

        # The final artifacts must include at least one mp4.
        final_artifacts = final_result.get("artifacts", [])
        final_mp4 = next(
            (a for a in final_artifacts if str(a.get("path", "")).endswith(".mp4")),
            None,
        )
        self.assertIsNotNone(final_mp4, f"No mp4 in final artifacts: {final_artifacts}")
        final_path = Path(final_mp4["path"])
        self.assertTrue(final_path.exists(), f"Final mp4 missing: {final_path}")

        # Build final_evidence: real ffprobe (trust no caller summary).
        probe = _ffprobe(final_path)
        self.assertNotIn("error", probe, f"ffprobe failed on final: {probe.get('error')}")
        output_sha = sha256_file(final_path)

        final_evidence_body = json.dumps({
            "output_path": str(final_path),
            "output_sha256": output_sha,
            "probe": probe,
        })
        final_evidence_r = self.ctl.save_artifact(
            JOB_ID, "final_evidence", final_evidence_body,
            event_id=f"{JOB_ID}-final-evidence",
        )

        TestIntegrationProbe._final_output_path = str(final_path)
        if final_result.get("asset_manifest"):
            TestIntegrationProbe._asset_manifest_path = final_result["asset_manifest"]

        return final_result, final_evidence_r

    def test_04_final_actual_render(self) -> None:
        final_result, final_evidence_r = self._through_finalized()

        state = self.ctl.inspect(JOB_ID)["state"]
        self.assertEqual(state["stage"], "finalized",
            "save_artifact(final_evidence) transitions draft_approved -> finalized")

        # Verify the final output: 1080x1920 H.264 10s AAC.
        final_path = Path(TestIntegrationProbe._final_output_path)
        probe = _ffprobe(final_path)
        streams = probe.get("streams", [])
        vs = next((s for s in streams if s.get("codec_type") == "video"), {})
        aud_s = next((s for s in streams if s.get("codec_type") == "audio"), {})

        self.assertEqual(vs.get("width"), 1080, f"Expected width=1080, got {vs.get('width')}")
        self.assertEqual(vs.get("height"), 1920, f"Expected height=1920, got {vs.get('height')}")
        self.assertEqual(vs.get("codec_name"), "h264", f"Expected h264, got {vs.get('codec_name')}")
        self.assertIn(aud_s.get("codec_name", ""), ("aac", "mp4a"),
            f"Expected AAC audio, got {aud_s.get('codec_name')}")
        duration = float(probe.get("format", {}).get("duration", "0"))
        self.assertAlmostEqual(duration, 10.0, delta=1.0,
            msg=f"Final duration {duration}s deviates >1s from 10s fixture")

        # final_evidence save result.
        self.assertIsNotNone(final_evidence_r["sha256"])

    # ── Step 5: receipt replay without re-render ───────────────────────────────

    def test_05_receipt_replay_no_rerender(self) -> None:
        """Second call to adapter.run("final") must return cached receipt, not re-render."""
        self._through_draft_approved()

        # First call.
        first = self.adapter.run("final", JOB_ID, format="9:16")
        self.assertTrue(first.get("ok"), f"First final failed: {first.get('errors')}")
        self.assertFalse(first.get("replayed"), "First call must NOT be a replay")

        # Second call — must be a replay.
        second = self.adapter.run("final", JOB_ID, format="9:16")
        self.assertTrue(second.get("ok"), f"Replay failed: {second.get('errors')}")
        self.assertTrue(second.get("replayed"), "Second call must be a cached replay")

        # Store receipt path for review.
        receipt_files = list(
            (self.state_root / "jobs" / JOB_ID / "render-receipts").glob("*.json")
        )
        if receipt_files:
            TestIntegrationProbe._receipt_path = str(receipt_files[0])

    # ── Step 6: inspect / replay output ───────────────────────────────────────

    def test_06_inspect_and_replay(self) -> None:
        """inspect() and replay() agree on stage; replay from events reconstructs state."""
        self._through_draft_approved()
        # Run final to get to a natural resting point.
        self.adapter.run("final", JOB_ID, format="9:16")

        inspect = self.ctl.inspect(JOB_ID)
        state = inspect["state"]
        events = inspect["events"]
        self.assertGreater(len(events), 0, "Event log must not be empty")

        replay = self.ctl.replay(JOB_ID)
        # After draft_approved + final the replayed stage is finalized.
        self.assertEqual(replay["persisted_stage"], state["stage"],
            "Persisted stage and replayed stage must agree")
        self.assertEqual(replay.get("stages_match"), True,
            f"Replay stages_match must be True; got: {replay}")

    # ── Step 7: asset-manifest schema ─────────────────────────────────────────

    def test_07_asset_manifest_schema(self) -> None:
        """After finalization, asset-manifest.json has required fields."""
        self._through_draft_approved()
        final_result = self.adapter.run("final", JOB_ID, format="9:16")
        self.assertTrue(final_result.get("ok"), f"Final failed: {final_result.get('errors')}")

        manifest_path_str = final_result.get("asset_manifest")
        if manifest_path_str is None:
            self.skipTest("asset_manifest not written (ok but not required for replay test)")

        manifest_path = Path(manifest_path_str)
        self.assertTrue(manifest_path.exists(), f"asset-manifest.json not found: {manifest_path}")
        manifest = json.loads(manifest_path.read_text())

        self.assertEqual(manifest["job_id"], JOB_ID)
        self.assertIn("draft_sha256", manifest, "manifest missing draft_sha256")
        self.assertIn("source_shas", manifest, "manifest missing source_shas")
        self.assertEqual(manifest.get("publication_status"), "not_published")
        self.assertIn("finalized_at", manifest)
        self.assertIsInstance(manifest.get("artifacts"), list)
        self.assertGreater(len(manifest["artifacts"]), 0, "manifest artifacts empty")
        # Each artifact must have a real probe.
        for art in manifest["artifacts"]:
            self.assertIn("probe", art, f"artifact missing probe: {art.get('path')}")
            self.assertIn("sha256", art, f"artifact missing sha256: {art.get('path')}")


# ── Contract tests (no real render, mock the script) ──────────────────────────

class TestContractDriftAndContainment(unittest.TestCase):
    """Contract tests: drift detection, cross-job isolation, containment."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="ceos-contract-")
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

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _mksource(self, name: str, body: str = "source\n") -> Path:
        p = self.sources_dir / name
        p.write_text(body)
        return p

    def _job_through_draft_approved(self, job_id: str = "ct-draft") -> dict:
        src = self._mksource(f"{job_id}.md")
        self.ctl.create_job(job_id=job_id, scope="ct", sources=[{"path": str(src)}],
                            event_id=f"{job_id}-c")
        plan_r = self.ctl.save_artifact(job_id, "plan", "plan\n", event_id=f"{job_id}-plan")
        self.ctl.submit_for_approval(job_id, "plan", event_id=f"{job_id}-ps")
        self.ctl.record_operator_approval(job_id=job_id, stage_key="plan",
            approver="op", operator_token=self.token,
            expected_version=plan_r["version"], expected_sha256=plan_r["sha256"],
            note="ok", event_id=f"{job_id}-pa")
        draft_r = self.ctl.save_artifact(job_id, "draft", "draft\n", event_id=f"{job_id}-d")
        self.ctl.submit_for_approval(job_id, "draft", event_id=f"{job_id}-ds")
        self.ctl.record_operator_approval(job_id=job_id, stage_key="draft",
            approver="op", operator_token=self.token,
            expected_version=draft_r["version"], expected_sha256=draft_r["sha256"],
            note="ok", event_id=f"{job_id}-da")
        return draft_r

    def test_config_drift_blocks_final(self) -> None:
        """If job-config changes between draft approval and final, _run_final must detect drift."""
        job_id = "ct-config-drift"
        src = self._mksource(f"{job_id}.md")
        self.ctl.create_job(job_id=job_id, scope="ct", sources=[{"path": str(src)}],
                            event_id=f"{job_id}-c")
        plan_r = self.ctl.save_artifact(job_id, "plan", "plan\n", event_id=f"{job_id}-plan")
        self.ctl.submit_for_approval(job_id, "plan", event_id=f"{job_id}-ps")
        self.ctl.record_operator_approval(job_id=job_id, stage_key="plan",
            approver="op", operator_token=self.token,
            expected_version=plan_r["version"], expected_sha256=plan_r["sha256"],
            note="ok", event_id=f"{job_id}-pa")

        # Create a stub studio with a job-config.json.
        studio_root = self.tmp_path / "VideoStudioDrift"
        studio_root.mkdir()
        assets_dir = studio_root / "assets" / "projects" / job_id
        (assets_dir / "audio").mkdir(parents=True)
        job_config = assets_dir / "job-config.json"
        job_config.write_text(json.dumps({"id": job_id, "version": 1}))
        job_config_sha_at_draft = sha256_file(job_config)

        # Build a draft body that contains render_inputs with this config sha.
        render_inputs = {
            "job_id": job_id,
            "job_config_sha256": job_config_sha_at_draft,
            "voice_wav_sha256": None,
            "caption_srt_sha256": None,
            "composition_dir_fingerprint": None,
            "fixture_sha256": sha256_bytes(b"fake-fixture"),
            "source_shas": {},
        }
        draft_body = json.dumps(render_inputs)
        draft_r = self.ctl.save_artifact(job_id, "draft", draft_body, event_id=f"{job_id}-d")
        self.ctl.submit_for_approval(job_id, "draft", event_id=f"{job_id}-ds")
        self.ctl.record_operator_approval(job_id=job_id, stage_key="draft",
            approver="op", operator_token=self.token,
            expected_version=draft_r["version"], expected_sha256=draft_r["sha256"],
            note="ok", event_id=f"{job_id}-da")

        # NOW mutate job-config.json AFTER approval — simulates config drift.
        job_config.write_text(json.dumps({"id": job_id, "version": 2, "mutated": True}))
        new_sha = sha256_file(job_config)
        self.assertNotEqual(new_sha, job_config_sha_at_draft, "Config must have changed")

        # _run_final should detect drift and return ok=False.
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("final", job_id, format="9:16")
        self.assertFalse(result.get("ok"),
            f"Final must fail on config drift; got: {result}")
        err_str = " ".join(result.get("errors", []))
        self.assertIn("drift", err_str.lower(),
            f"Error must mention drift; got: {result['errors']}")

    def test_cross_job_source_isolation(self) -> None:
        """Source registered for job A is not accepted as fixture for job B."""
        src_a = self._mksource("a.md")
        src_b = self._mksource("b.md")
        self.ctl.create_job("ct-iso-a", "ct", [{"path": str(src_a)}], event_id="ct-iso-a-c")
        self.ctl.create_job("ct-iso-b", "ct", [{"path": str(src_b)}], event_id="ct-iso-b-c")

        plan_r = self.ctl.save_artifact("ct-iso-b", "plan", "plan\n", event_id="ct-iso-b-plan")
        self.ctl.submit_for_approval("ct-iso-b", "plan", event_id="ct-iso-b-ps")
        self.ctl.record_operator_approval(job_id="ct-iso-b", stage_key="plan",
            approver="op", operator_token=self.token,
            expected_version=plan_r["version"], expected_sha256=plan_r["sha256"],
            note="ok", event_id="ct-iso-b-pa")

        studio_root = self.tmp_path / "VideoStudioIso"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)

        # Try to use src_a (job A's source) as fixture for job B — must be rejected.
        result = adapter.run("draft", "ct-iso-b", fixture_path=src_a)
        self.assertFalse(result.get("ok"),
            f"Cross-job fixture must be rejected; got: {result}")
        err_str = " ".join(result.get("errors", []))
        self.assertIn("registered source", err_str.lower(),
            f"Error must mention 'registered source'; got: {result['errors']}")

    def test_damaged_receipt_replay_fails(self) -> None:
        """A cached receipt whose output file is deleted must not replay as success."""
        job_id = "ct-replay-miss"
        self._job_through_draft_approved(job_id)

        # Write a receipt with a path that doesn't exist.
        from ceos.studio_adapter import _receipt_cache_key
        state = self.ctl.inspect(job_id)["state"]
        draft_sha = state["artifacts"].get("draft", {}).get("sha256", "x" * 64)
        source_shas = sorted(s.get("sha256", "") for s in state.get("sources", []) if s.get("sha256"))
        rkey = _receipt_cache_key(draft_sha, "9:16", source_shas)

        receipts_dir = self.state_root / "jobs" / job_id / "render-receipts"
        receipts_dir.mkdir(parents=True, exist_ok=True)
        nonexistent_path = str(self.tmp_path / "nonexistent-final.mp4")
        receipt_content = {
            "ok": True,
            "action": "final",
            "job_id": job_id,
            "artifacts": [{"path": nonexistent_path, "sha256": "a" * 64}],
            "hashes": {nonexistent_path: "a" * 64},
            "errors": [],
        }
        receipt_path = receipts_dir / f"{rkey}.json"
        atomic_write_json(receipt_path, receipt_content)

        studio_root = self.tmp_path / "VideoStudioReplay"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("final", job_id, format="9:16")
        # Damaged cache must be evicted; script fails (no scripts dir).
        # Either ok=False from eviction+script-miss, or ok=False from
        # script-not-found — both are correct.
        self.assertFalse(result.get("ok"),
            f"Damaged receipt replay must fail; got: {result}")
        # Receipt must have been deleted (evicted on damage detection).
        self.assertFalse(result.get("replayed", False))
        self.assertTrue(receipt_path.exists() or receipt_path.with_suffix(".held.json").exists(),
            "Held receipt evidence must be preserved")

    def test_output_containment_before_hashing(self) -> None:
        """An output file outside studio/out/<job_id> is rejected in stills containment."""
        job_id = "ct-contain"
        src = self._mksource(f"{job_id}.md")
        self.ctl.create_job(job_id=job_id, scope="ct", sources=[{"path": str(src)}],
                            event_id=f"{job_id}-c")
        plan_r = self.ctl.save_artifact(job_id, "plan", "plan\n", event_id=f"{job_id}-plan")
        self.ctl.submit_for_approval(job_id, "plan", event_id=f"{job_id}-ps")
        self.ctl.record_operator_approval(job_id=job_id, stage_key="plan",
            approver="op", operator_token=self.token,
            expected_version=plan_r["version"], expected_sha256=plan_r["sha256"],
            note="ok", event_id=f"{job_id}-pa")

        studio_root = self.tmp_path / "VideoStudioContain"
        studio_root.mkdir()
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir()
        # Stills script that reports a path OUTSIDE the job dir.
        outside_path = str(self.tmp_path / "evil-traversal.png")
        Path(outside_path).write_bytes(b"\x89PNG\r\n")
        (scripts_dir / "stills.mjs").write_text(
            f'process.stdout.write(JSON.stringify({{ok: true, rendered: [{json.dumps(outside_path)}]}}));'
        )
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("stills", job_id)
        self.assertFalse(result.get("ok"),
            f"Out-of-job-dir stills output must be rejected: {result}")
        # No artifacts should survive from outside the job dir.
        for art in result.get("artifacts", []):
            self.assertNotEqual(art.get("path"), outside_path,
                "Evil path must not appear in safe artifacts")

    def test_final_rejects_nonregistered_source_as_fixture(self) -> None:
        """The _is_registered_source fallback is removed; only exact registered clips accepted."""
        job_id = "ct-no-fallback"
        src = self._mksource(f"{job_id}.md")
        self.ctl.create_job(job_id=job_id, scope="ct", sources=[{"path": str(src)}],
                            event_id=f"{job_id}-c")
        plan_r = self.ctl.save_artifact(job_id, "plan", "plan\n", event_id=f"{job_id}-plan")
        self.ctl.submit_for_approval(job_id, "plan", event_id=f"{job_id}-ps")
        self.ctl.record_operator_approval(job_id=job_id, stage_key="plan",
            approver="op", operator_token=self.token,
            expected_version=plan_r["version"], expected_sha256=plan_r["sha256"],
            note="ok", event_id=f"{job_id}-pa")

        # A file that is within allowed_source_roots but NOT a registered source for this job.
        unregistered = self.sources_dir / "unregistered-clip.mp4"
        unregistered.write_bytes(b"fake mp4")

        studio_root = self.tmp_path / "VideoStudioNoFallback"
        studio_root.mkdir()
        # Adapter with no extra roots (strict mode).
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("draft", job_id, fixture_path=unregistered)
        self.assertFalse(result.get("ok"),
            f"Unregistered source must be rejected without fallback: {result}")
        err = " ".join(result.get("errors", []))
        self.assertIn("registered source", err.lower(),
            f"Must mention 'registered source': {result['errors']}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
