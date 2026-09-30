"""Regression tests for ADAPTER-REVIEW.md gate fixes.

Eight concrete integration defects identified by independent source inspection.

Gates covered:
  A1. _exec_script multiline JSON parser: pretty-printed JSON across multiple lines
      is now parsed correctly; zero-exit with no JSON summary returns ok=False.
  A2. Directory paths from new-video.mjs: directories are not hashed; regular files
      are hashed; no raise on is_dir().
  A3. Draft version recheck: _run_draft verifies current plan artifact SHA matches
      approved SHA before executing. Final version recheck: _run_final verifies
      current draft artifact SHA matches approved SHA. Fixture must be a registered
      source; blanket /tmp access is not granted by default.
  A4. stills job containment: comp_id must match the job's canonical composition;
      arbitrary comp_id from another job is rejected.
  A5. Final replay cache key: key is sha256(draft_sha|format|source_shas), not a
      16-char prefix. Cached output file must exist with matching hash; missing or
      drifted output does not replay as success.
  A6. Timeout uncertainty persistence: timeout writes uncertain=True to durable
      invocation record; retry with same invocation_id is refused until reconcile().
  A7. Final evidence verification: script ok=True with a missing output file returns
      ok=False; script ok=True with a drifted output hash returns ok=False.
  A8. Cross-job isolation (regression): operations on job A do not affect job B;
      stills containment blocks cross-job still paths.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ceos.controller import Controller
from ceos.model import UnknownJob
from ceos.store import atomic_write_json, sha256_file, sha256_bytes
from ceos.studio_adapter import (
    StudioAdapter,
    _parse_last_json_object,
    _receipt_cache_key,
    _verify_receipt_outputs,
    _verify_output_hashes,
    InvocationUncertain,
)


# ---------------------------------------------------------------------------
# Shared base
# ---------------------------------------------------------------------------

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

    def _job_through_plan_approved(self, job_id: str = "aaa-test") -> dict:
        src = self._mksource(f"{job_id}-brief.md")
        self.ctl.create_job(
            job_id=job_id, scope="test",
            sources=[{"path": str(src)}], event_id=f"{job_id}-create",
        )
        plan_r = self.ctl.save_artifact(job_id, "plan", "plan body\n", event_id=f"{job_id}-plan")
        self.ctl.submit_for_approval(job_id, "plan", event_id=f"{job_id}-submit")
        self.ctl.record_operator_approval(
            job_id=job_id, stage_key="plan",
            approver="op", operator_token=self.token,
            expected_version=plan_r["version"],
            expected_sha256=plan_r["sha256"],
            note="ok", event_id=f"{job_id}-approve-plan",
        )
        return plan_r

    def _job_through_draft_approved(self, job_id: str = "bbb-draft") -> dict:
        self._job_through_plan_approved(job_id)
        draft_r = self.ctl.save_artifact(job_id, "draft", "draft body\n", event_id=f"{job_id}-draft")
        self.ctl.submit_for_approval(job_id, "draft", event_id=f"{job_id}-draft-submit")
        self.ctl.record_operator_approval(
            job_id=job_id, stage_key="draft",
            approver="op", operator_token=self.token,
            expected_version=draft_r["version"],
            expected_sha256=draft_r["sha256"],
            note="ok", event_id=f"{job_id}-approve-draft",
        )
        return draft_r

    def _make_studio(self, suffix: str = "") -> tuple[StudioAdapter, Path]:
        studio_root = self.tmp_path / f"VideoStudio{suffix}"
        studio_root.mkdir(exist_ok=True)
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        return adapter, studio_root

    def _write_script(self, studio_root: Path, script_name: str, output: str) -> Path:
        """Write a minimal node.js stub script that prints output and exits 0."""
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir(exist_ok=True)
        script = scripts_dir / script_name
        # Node script: print the output, exit 0.
        script.write_text(f"process.stdout.write({json.dumps(output)});")
        return script


# ===========================================================================
# A1. Multiline JSON parser
# ===========================================================================

class TestA1MultilineJsonParser(unittest.TestCase):
    """_parse_last_json_object correctly handles multi-line pretty-printed JSON."""

    def test_single_line_json_object(self):
        result = _parse_last_json_object('{"ok": true, "paths": {}}')
        self.assertIsNotNone(result)
        self.assertTrue(result["ok"])

    def test_multiline_pretty_json(self):
        text = '''Script starting...
Checking assets...
{
  "ok": true,
  "paths": {
    "src": "/tmp/video/src",
    "out": "/tmp/video/out"
  }
}
Done.'''
        result = _parse_last_json_object(text)
        self.assertIsNotNone(result, "multiline JSON must be parsed")
        self.assertTrue(result["ok"])
        self.assertIn("src", result["paths"])

    def test_json_buried_in_log_output(self):
        text = (
            "[info] npm start\n"
            "[info] rendering...\n"
            '{"ok": true, "stills": ["/out/a.png", "/out/b.png"]}\n'
        )
        result = _parse_last_json_object(text)
        self.assertIsNotNone(result)
        self.assertEqual(result["stills"], ["/out/a.png", "/out/b.png"])

    def test_only_log_output_no_json_returns_none(self):
        text = "Starting...\nDone. No JSON here.\nFinished successfully."
        result = _parse_last_json_object(text)
        self.assertIsNone(result, "no JSON object → must return None")

    def test_empty_string_returns_none(self):
        self.assertIsNone(_parse_last_json_object(""))

    def test_partial_json_not_an_object_returns_none(self):
        # A JSON array at top level should NOT be returned (we want objects only).
        text = '[1, 2, 3]'
        result = _parse_last_json_object(text)
        self.assertIsNone(result, "top-level array is not an object; must return None")

    def test_exec_script_zero_exit_no_json_returns_ok_false(self):
        """A1: a script that exits 0 but emits no JSON summary must return ok=False."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            state_root = tmp_path / "state"
            state_root.mkdir()
            sources_dir = tmp_path / "sources"
            sources_dir.mkdir()
            ctl = Controller(state_root, allowed_source_roots=[sources_dir])
            ctl.ensure_operator_token()
            src = sources_dir / "brief.md"
            src.write_text("hello")
            ctl.create_job("zzz-exec", "test", [{"path": str(src)}], event_id="c1")

            studio_root = tmp_path / "VideoStudio"
            studio_root.mkdir()
            scripts_dir = studio_root / "scripts"
            scripts_dir.mkdir()
            # Script exits 0 but prints only log text, no JSON.
            (scripts_dir / "new-video.mjs").write_text(
                "process.stdout.write('Starting... Done.');"
            )
            adapter = StudioAdapter(ctl, studio_root=studio_root)
            result = adapter.run("create", "zzz-exec")
            self.assertFalse(result["ok"], f"expected ok=False, got: {result}")
            self.assertTrue(len(result["errors"]) > 0)
            error_text = " ".join(result["errors"]).lower()
            self.assertIn("json", error_text)


# ===========================================================================
# A2. Directory paths from new-video.mjs are not hashed
# ===========================================================================

class TestA2DirectoryNotHashed(_Base):
    def test_directory_path_in_paths_not_hashed(self):
        """new-video.mjs can return directory paths in 'paths'; these must not be
        file-hashed (sha256_file raises on a directory).
        """
        job_id = "aaa-dir"
        src = self._mksource(f"{job_id}.md")
        self.ctl.create_job(job_id, "test", [{"path": str(src)}], event_id=f"{job_id}-c")

        # Create a dir path that the fake script will return.
        studio_root = self.tmp_path / "VideoStudiA2"
        studio_root.mkdir()
        fake_dir = studio_root / "src" / "videos" / job_id
        fake_dir.mkdir(parents=True)
        config_copy = fake_dir / "config.json"
        config_copy.write_bytes(src.read_bytes())
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir()
        # Script returns a path dict containing an existing directory.
        # Write a node script that emits the JSON using process.stdout.write with
        # a regular string (single-quoted) to avoid backtick/escape complexity.
        script_data = {
            "ok": True,
            "paths": {
                "src": str(fake_dir),
                "config": str(config_copy),
            },
        }
        # json.dumps produces a valid JS object literal (keys are always strings).
        # Wrap in JSON.parse(JSON.stringify(x)) would be redundant; use JSON.stringify
        # on a JS object literal built from path strings escaped for JS single-quoted context.
        # Simplest: write the raw JSON bytes to stdout in node using a buffer.
        raw_json = json.dumps(script_data)
        # Escape for Python f-string and JS single-quoted string: backslash and single-quote.
        js_escaped = raw_json.replace("\\", "\\\\").replace("'", "\\'")
        (scripts_dir / "new-video.mjs").write_text(
            f"process.stdout.write('{js_escaped}');"
        )

        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("create", job_id)

        # Must not crash.
        self.assertIn("ok", result)
        # The directory entry must have is_dir=True, no sha256.
        dir_entries = [a for a in result["artifacts"] if a["path"] == str(fake_dir)]
        self.assertTrue(len(dir_entries) > 0, "directory path not in artifacts")
        dir_entry = dir_entries[0]
        self.assertTrue(dir_entry.get("is_dir"), "directory entry must have is_dir=True")
        self.assertNotIn("sha256", dir_entry, "directory must not have sha256")

        # The regular file entry must have sha256.
        file_entries = [a for a in result["artifacts"] if a["path"] == str(config_copy)]
        self.assertTrue(len(file_entries) > 0, "file path not in artifacts")
        self.assertIn("sha256", file_entries[0], "regular file must be hashed")


# ===========================================================================
# A3. Draft and final version recheck; fixture must be registered source;
#     no blanket /tmp access
# ===========================================================================

class TestA3DraftVersionRecheck(_Base):
    def test_draft_blocked_when_plan_changed_after_approval(self):
        """A3: if plan artifact changes after approval, draft action must be blocked.
        The approved sha256 no longer matches current plan sha256.
        """
        job_id = "aaa-recheck"
        self._job_through_plan_approved(job_id)

        # Mutate the plan artifact on disk to simulate silent drift.
        state = self.ctl.inspect(job_id)["state"]
        plan_path_rel = state["artifacts"]["plan"]["path"]
        job_dir = self.state_root / "jobs" / job_id
        plan_file = job_dir / plan_path_rel
        # Overwrite plan file directly (bypassing the controller lock for test injection).
        plan_file.write_text("silently changed plan content\n")

        # Now try to run draft — the controller state still shows the old SHA but the
        # current artifact on disk has changed.  However the adapter checks the controller's
        # recorded plan SHA vs the approval record.  To test the recheck we need to
        # simulate what happens when save_artifact is called AFTER approval to update the
        # plan: that invalidates the approval but the stage stays at plan_approved...
        # Actually the cleanest test: save a new plan version after approval and verify
        # the adapter catches the drift.
        #
        # Note: after plan_approved stage, calling save_artifact('plan', ...) goes
        # through _invalidate_dependent_approvals which removes draft approvals but
        # keeps plan approval. The plan sha in state is updated. The adapter must catch this.
        #
        # We test by directly modifying state artifacts to simulate the stale approval case.
        state_path = self.state_root / "jobs" / job_id / "state.json"
        raw = json.loads(state_path.read_text())
        # Change the plan SHA in state to simulate a plan update while keeping approval record.
        raw["artifacts"]["plan"]["sha256"] = "0" * 64
        state_path.write_text(json.dumps(raw))

        studio_root = self.tmp_path / "VideoStudioA3"
        studio_root.mkdir()
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir()
        src = self.sources_dir / f"{job_id}-brief.md"
        (scripts_dir / "ingest-draft.mjs").write_text(
            'process.stdout.write(JSON.stringify({ok:true}));'
        )
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("draft", job_id, fixture_path=str(src))
        self.assertFalse(result["ok"])
        error_text = " ".join(result["errors"]).lower()
        self.assertTrue(
            "plan" in error_text and ("changed" in error_text or "approval" in error_text or "sha256" in error_text),
            f"error must mention plan artifact drift: {error_text}",
        )

    def test_draft_fixture_must_be_registered_source(self):
        """A3: fixture must be a registered source; arbitrary /tmp path is rejected."""
        job_id = "aaa-src-gate"
        self._job_through_plan_approved(job_id)

        # This file exists but is NOT in the job's registered sources.
        unregistered = self.tmp_path / "unregistered-clip.mp4"
        unregistered.write_bytes(b"not a registered source")

        studio_root = self.tmp_path / "VideoStudioA3b"
        studio_root.mkdir()
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "ingest-draft.mjs").write_text(
            'process.stdout.write(JSON.stringify({ok:true}));'
        )
        # No allowed_source_roots override — default adapter has no blanket /tmp.
        ctl2 = Controller(
            self.state_root,
            allowed_source_roots=[self.sources_dir],
        )
        adapter = StudioAdapter(ctl2, studio_root=studio_root)
        result = adapter.run("draft", job_id, fixture_path=str(unregistered))
        self.assertFalse(result["ok"])
        error_text = " ".join(result["errors"]).lower()
        self.assertTrue(
            "registered" in error_text or "source" in error_text or "allowed" in error_text,
            f"error must mention source restriction: {error_text}",
        )

    def test_no_blanket_tmp_access_by_default(self):
        """A3: StudioAdapter __init__ no longer adds /tmp to allowed_source_roots."""
        with tempfile.TemporaryDirectory() as tmp:
            state_root = Path(tmp) / "state"
            state_root.mkdir()
            ctl = Controller(state_root)
            adapter = StudioAdapter(ctl)
            # /tmp must NOT be in the adapter's allowed source roots by default.
            tmp_root = Path("/tmp")
            is_tmp_allowed = any(
                str(r).startswith("/tmp") or str(r).startswith("/private/tmp")
                for r in adapter._allowed_source_roots
            )
            self.assertFalse(is_tmp_allowed,
                "blanket /tmp must not be in allowed_source_roots by default (A3)")

    def test_final_blocked_when_draft_changed_after_approval(self):
        """A3: if draft artifact changes after approval, final action must be blocked."""
        job_id = "aaa-final-recheck"
        self._job_through_draft_approved(job_id)

        # Simulate draft artifact SHA mismatch in state (approved sha differs from current).
        state_path = self.state_root / "jobs" / job_id / "state.json"
        raw = json.loads(state_path.read_text())
        # Update the draft sha in state while keeping the approval record with the old sha.
        raw["artifacts"]["draft"]["sha256"] = "f" * 64
        state_path.write_text(json.dumps(raw))

        studio_root = self.tmp_path / "VideoStudioA3c"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("final", job_id)
        self.assertFalse(result["ok"])
        error_text = " ".join(result["errors"]).lower()
        self.assertTrue(
            "draft" in error_text and ("changed" in error_text or "approval" in error_text or "sha256" in error_text),
            f"error must mention draft artifact drift: {error_text}",
        )


# ===========================================================================
# A4. stills job containment
# ===========================================================================

class TestA4StillsJobContainment(_Base):
    def test_cross_job_comp_id_rejected(self):
        """A4: comp_id from another job's composition must be rejected."""
        job_id = "aaa-stills"
        self._job_through_plan_approved(job_id)

        # Another job's composition name.
        other_comp = "OtherJobVertical"

        studio_root = self.tmp_path / "VideoStudioA4"
        studio_root.mkdir()
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "stills.mjs").write_text(
            'process.stdout.write(JSON.stringify({ok:true, stills:[]}));'
        )
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("stills", job_id, comp_id=other_comp)
        self.assertFalse(result["ok"])
        error_text = " ".join(result["errors"]).lower()
        self.assertTrue(
            "comp_id" in error_text or "composition" in error_text or "job" in error_text,
            f"error must mention comp_id mismatch: {error_text}",
        )

    def test_canonical_comp_id_accepted(self):
        """A4: canonical comp_id for this job is accepted."""
        job_id = "aaa-stills2"
        self._job_through_plan_approved(job_id)

        canonical_comp = "AaaStills2Vertical"  # TitleCase(aaa-stills2) + Vertical

        studio_root = self.tmp_path / "VideoStudioA4b"
        studio_root.mkdir()
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "stills.mjs").write_text(
            'process.stdout.write(JSON.stringify({ok:true, stills:[]}));'
        )
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("stills", job_id, comp_id=canonical_comp)
        # Must not fail on comp_id check (may fail on other grounds like node version).
        if not result["ok"]:
            # Only accepted reason: stills script errors, NOT comp_id mismatch.
            error_text = " ".join(result["errors"]).lower()
            self.assertNotIn("comp_id", error_text,
                f"canonical comp_id must not be rejected: errors={result['errors']}")

    def test_stills_output_outside_job_dir_rejected(self):
        """A4: still output paths outside the job's studio directory are rejected."""
        job_id = "aaa-containment"
        self._job_through_plan_approved(job_id)

        # Create a still outside the job directory.
        outside_still = self.tmp_path / "outside-still.png"
        outside_still.write_bytes(b"fake png")

        studio_root = self.tmp_path / "VideoStudioA4c"
        studio_root.mkdir()
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "stills.mjs").write_text(
            f'process.stdout.write(JSON.stringify({{ok:true, stills:[{json.dumps(str(outside_still))}]}}));'
        )
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("stills", job_id)
        # The outside still must be rejected by containment check.
        self.assertFalse(result["ok"], "containment violation must set ok=False")
        self.assertEqual(result["artifacts"], [],
            "outside-job still must be removed from artifacts")
        error_text = " ".join(result["errors"]).lower()
        self.assertTrue(
            "containment" in error_text or "outside" in error_text or "job directory" in error_text,
            f"error must mention containment: {error_text}",
        )


# ===========================================================================
# A5. Final replay cache key and output verification
# ===========================================================================

class TestA5FinalReplayCacheKey(_Base):
    def test_receipt_key_includes_format(self):
        """A5: different formats produce different receipt keys."""
        draft_sha = "a" * 64
        key_916 = _receipt_cache_key(draft_sha, "9:16", [])
        key_169 = _receipt_cache_key(draft_sha, "16:9", [])
        self.assertNotEqual(key_916, key_169, "different formats must produce different keys")

    def test_receipt_key_includes_source_fingerprints(self):
        """A5: different source hashes produce different receipt keys."""
        draft_sha = "b" * 64
        key_no_src = _receipt_cache_key(draft_sha, "9:16", [])
        key_with_src = _receipt_cache_key(draft_sha, "9:16", ["c" * 64])
        self.assertNotEqual(key_no_src, key_with_src)

    def test_receipt_key_is_full_hash_not_prefix(self):
        """A5: receipt key must be a 64-char hex sha256, not a short prefix."""
        key = _receipt_cache_key("d" * 64, "9:16", [])
        self.assertEqual(len(key), 64, f"key must be 64 hex chars, got {len(key)}: {key!r}")
        self.assertRegex(key, r"^[0-9a-f]{64}$", "key must be hex sha256")

    def test_replay_drifted_output_not_served(self):
        """A5: if cached output file is deleted after writing receipt, replay returns ok=False."""
        job_id = "bbb-replay-drift"
        self._job_through_draft_approved(job_id)
        state = self.ctl.inspect(job_id)["state"]
        draft_sha = state["artifacts"]["draft"]["sha256"]
        source_shas = sorted(
            s.get("sha256", "") for s in state.get("sources", []) if s.get("sha256")
        )
        receipt_key = _receipt_cache_key(draft_sha, "9:16", source_shas)

        studio_root = self.tmp_path / "VideoStudioA5"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)

        # Write a receipt pointing to a file that we then delete (drift).
        fake_output = self.tmp_path / "will-be-deleted.mp4"
        fake_output.write_bytes(b"content")
        real_sha = sha256_file(fake_output)
        fake_output.unlink()  # delete after computing sha

        receipts_dir = self.state_root / "jobs" / job_id / "render-receipts"
        receipts_dir.mkdir(parents=True)
        receipt_data = {
            "ok": True,
            "artifacts": [{"path": str(fake_output), "sha256": real_sha}],
            "hashes": {str(fake_output): real_sha},
        }
        (receipts_dir / f"{receipt_key}.json").write_text(json.dumps(receipt_data))

        result = adapter.run("final", job_id)
        # Drifted output must not be served — falls through to a real render attempt.
        # The render will fail because there's no scripts/ dir; that's fine: ok=False.
        self.assertFalse(result.get("replayed", False),
            "drifted output must not be served as replay")

    def test_verify_receipt_outputs_missing_file_returns_false(self):
        """A5: _verify_receipt_outputs returns False when output file is missing."""
        receipt = {
            "ok": True,
            "artifacts": [{"path": "/nonexistent/file.mp4", "sha256": "a" * 64}],
            "hashes": {"/nonexistent/file.mp4": "a" * 64},
        }
        self.assertFalse(_verify_receipt_outputs(receipt))

    def test_verify_receipt_outputs_hash_mismatch_returns_false(self):
        """A5: _verify_receipt_outputs returns False when file exists but hash differs."""
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"real content")
            real_path = f.name
        try:
            receipt = {
                "ok": True,
                "artifacts": [{"path": real_path, "sha256": "0" * 64}],  # wrong sha
                "hashes": {real_path: "0" * 64},
            }
            self.assertFalse(_verify_receipt_outputs(receipt))
        finally:
            os.unlink(real_path)

    def test_verify_receipt_outputs_correct_hash_returns_true(self):
        """A5: _verify_receipt_outputs returns True when file exists with correct hash."""
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"real content")
            real_path = f.name
        try:
            real_sha = sha256_file(Path(real_path))
            receipt = {
                "ok": True,
                "artifacts": [{"path": real_path, "sha256": real_sha}],
                "hashes": {real_path: real_sha},
            }
            self.assertTrue(_verify_receipt_outputs(receipt))
        finally:
            os.unlink(real_path)


# ===========================================================================
# A6. Timeout uncertainty persistence
# ===========================================================================

class TestA6TimeoutUncertainty(_Base):
    def test_timeout_persists_uncertain_invocation_record(self):
        """A6: TimeoutExpired must write uncertain=True to invocation record durably."""
        job_id = "aaa-timeout"
        src = self._mksource(f"{job_id}.md")
        self.ctl.create_job(job_id, "test", [{"path": str(src)}], event_id=f"{job_id}-c")

        studio_root = self.tmp_path / "VideoStudioA6"
        studio_root.mkdir()
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir()
        # This script will exist but we'll patch subprocess.Popen to timeout.
        (scripts_dir / "new-video.mjs").write_text("// stub")

        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        inv_id = "a6-inv-001"

        # Patch Popen to raise TimeoutExpired (simulate slow render).
        mock_proc = MagicMock()
        mock_proc.pid = 99999
        mock_proc.communicate.side_effect = subprocess.TimeoutExpired(cmd=[], timeout=300)
        mock_proc.wait.return_value = None

        with patch("ceos.studio_adapter.subprocess.Popen", return_value=mock_proc):
            with patch("ceos.studio_adapter.os.killpg", return_value=None):
                result = adapter.run("create", job_id, invocation_id=inv_id)

        self.assertFalse(result["ok"])
        error_text = " ".join(result["errors"]).lower()
        self.assertIn("uncertain", error_text, "error must mention uncertain state")
        self.assertIn(inv_id, " ".join(result["errors"]), "error must include invocation_id")

        # Invocation record must be persisted with uncertain=True.
        inv_path = adapter._invocation_path(job_id, inv_id)
        self.assertTrue(inv_path.exists(), "invocation record must be written")
        rec = json.loads(inv_path.read_text())
        self.assertTrue(rec["uncertain"], "invocation record must have uncertain=True")
        self.assertIn("timeout_after_s", rec, "timeout duration must be recorded")

    def test_retry_with_uncertain_invocation_id_refused(self):
        """A6: retry with same invocation_id while uncertain=True must return ok=False."""
        job_id = "aaa-retry"
        src = self._mksource(f"{job_id}.md")
        self.ctl.create_job(job_id, "test", [{"path": str(src)}], event_id=f"{job_id}-c")

        studio_root = self.tmp_path / "VideoStudioA6b"
        studio_root.mkdir()
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "new-video.mjs").write_text("// stub")

        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        inv_id = "a6-inv-retry"

        # Directly write an uncertain invocation record.
        inv_path = adapter._invocation_path(job_id, inv_id)
        inv_path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_json(inv_path, {
            "invocation_id": inv_id, "action": "create", "job_id": job_id,
            "uncertain": True, "resolved": None,
        })

        result = adapter.run("create", job_id, invocation_id=inv_id)
        self.assertFalse(result["ok"])
        error_text = " ".join(result["errors"]).lower()
        self.assertIn("uncertain", error_text, "retry must be refused with uncertain message")
        self.assertTrue(
            "reconcile" in error_text,
            f"error must mention reconcile: {error_text}",
        )

    def test_reconcile_clears_uncertain_state(self):
        """A6: reconcile() with resolved='failure' clears uncertain flag."""
        job_id = "aaa-reconcile"
        src = self._mksource(f"{job_id}.md")
        self.ctl.create_job(job_id, "test", [{"path": str(src)}], event_id=f"{job_id}-c")

        studio_root = self.tmp_path / "VideoStudioA6c"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        inv_id = "a6-inv-reconcile"

        inv_path = adapter._invocation_path(job_id, inv_id)
        inv_path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_json(inv_path, {
            "invocation_id": inv_id, "action": "create", "job_id": job_id,
            "uncertain": True, "resolved": None,
        })

        result = adapter.reconcile(job_id, inv_id, resolved="failure")
        self.assertTrue(result["ok"])
        self.assertEqual(result["resolved"], "failure")

        # After reconcile, record must have uncertain=False.
        rec = json.loads(inv_path.read_text())
        self.assertFalse(rec["uncertain"])
        self.assertEqual(rec["resolved"], "failure")

    def test_reconcile_invalid_resolved_value_rejected(self):
        """A6: reconcile() with resolved != 'success'/'failure' must return ok=False."""
        job_id = "aaa-reconcile2"
        src = self._mksource(f"{job_id}.md")
        self.ctl.create_job(job_id, "test", [{"path": str(src)}], event_id=f"{job_id}-c")

        studio_root = self.tmp_path / "VideoStudioA6d"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        inv_id = "a6-inv-bad"
        inv_path = adapter._invocation_path(job_id, inv_id)
        inv_path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_json(inv_path, {
            "invocation_id": inv_id, "action": "create", "job_id": job_id,
            "uncertain": True, "resolved": None,
        })

        result = adapter.reconcile(job_id, inv_id, resolved="maybe")
        self.assertFalse(result["ok"])


# ===========================================================================
# A7. Final evidence verification after render
# ===========================================================================

class TestA7FinalEvidenceVerification(_Base):
    def test_script_ok_but_output_missing_returns_ok_false(self):
        """A7: if script reports ok=True but output file does not exist, ok=False."""
        fake_output = "/nonexistent/output-a7.mp4"
        result = {
            "ok": True,
            "artifacts": [{"path": fake_output, "sha256": "a" * 64}],
            "hashes": {fake_output: "a" * 64},
            "errors": [],
        }
        errors = _verify_output_hashes(result)
        self.assertTrue(len(errors) > 0, "missing output file must produce errors")
        self.assertTrue(
            any("does not exist" in e or "missing" in e.lower() for e in errors),
            f"error must mention missing file: {errors}",
        )

    def test_script_ok_but_hash_mismatch_returns_ok_false(self):
        """A7: if script reports ok=True but output file hash differs, ok=False."""
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"rendered output bytes")
            real_path = f.name
        try:
            result = {
                "ok": True,
                "artifacts": [{"path": real_path, "sha256": "0" * 64}],  # wrong sha
                "hashes": {real_path: "0" * 64},
                "errors": [],
            }
            errors = _verify_output_hashes(result)
            self.assertTrue(len(errors) > 0, "hash mismatch must produce errors")
            self.assertTrue(
                any("mismatch" in e.lower() or "hash" in e.lower() for e in errors),
                f"error must mention hash mismatch: {errors}",
            )
        finally:
            os.unlink(real_path)

    def test_script_ok_with_correct_hash_passes(self):
        """A7: _verify_output_hashes returns empty list when file and hash are correct."""
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"good rendered output")
            real_path = f.name
        try:
            real_sha = sha256_file(Path(real_path))
            result = {
                "ok": True,
                "artifacts": [{"path": real_path, "sha256": real_sha}],
                "hashes": {real_path: real_sha},
                "errors": [],
            }
            errors = _verify_output_hashes(result)
            self.assertEqual(errors, [], f"correct hash must produce no errors: {errors}")
        finally:
            os.unlink(real_path)

    def test_final_script_ok_missing_output_does_not_write_receipt(self):
        """A7: if render-final script returns ok=True but output file is absent,
        _run_final must return ok=False and must not write a receipt.
        """
        job_id = "bbb-final-ev"
        self._job_through_draft_approved(job_id)

        studio_root = self.tmp_path / "VideoStudioA7"
        studio_root.mkdir()
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir()
        # Script claims ok=True and reports a non-existent output.
        (scripts_dir / "render-final.mjs").write_text(
            'process.stdout.write(JSON.stringify({'
            '"ok": true, '
            '"outputs": [{"path": "/nonexistent/final.mp4", "sha256": "' + "a" * 64 + '"}]'
            '}));'
        )
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("final", job_id)
        self.assertFalse(result["ok"],
            f"missing output after render must set ok=False; got: {result}")
        # No receipt must be written.
        receipts_dir = self.state_root / "jobs" / job_id / "render-receipts"
        if receipts_dir.exists():
            receipt_files = list(receipts_dir.glob("*.json"))
            self.assertEqual(receipt_files, [], "no receipt must be written on output miss")


# ===========================================================================
# A8. Cross-job isolation
# ===========================================================================

class TestA8CrossJobIsolation(_Base):
    def test_studio_operations_on_job_a_do_not_affect_job_b(self):
        """A8: operating on job A does not change state of job B."""
        job_a = "aaa-jobiso"
        job_b = "bbb-jobiso"
        self._job_through_plan_approved(job_a)
        self._job_through_plan_approved(job_b)

        state_b_before = self.ctl.inspect(job_b)["state"]

        studio_root = self.tmp_path / "VideoStudioA8"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)

        # Attempt stills on job A (will fail — no scripts dir, but that's fine).
        adapter.run("stills", job_a)

        state_b_after = self.ctl.inspect(job_b)["state"]
        self.assertEqual(state_b_before, state_b_after,
            "job B state must be unchanged by operations on job A")

    def test_stills_cross_job_comp_rejected_by_name(self):
        """A4/A8: comp_id from job B is rejected when running stills for job A."""
        job_a = "aaa-crosscomp"
        job_b = "bbb-crosscomp"
        self._job_through_plan_approved(job_a)
        self._job_through_plan_approved(job_b)

        # job B's canonical composition name.
        comp_b = "BbbCrosscompVertical"

        studio_root = self.tmp_path / "VideoStudioA8b"
        studio_root.mkdir()
        scripts_dir = studio_root / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "stills.mjs").write_text(
            'process.stdout.write(JSON.stringify({ok:true, stills:[]}));'
        )
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)
        result = adapter.run("stills", job_a, comp_id=comp_b)
        self.assertFalse(result["ok"],
            f"cross-job comp_id must be rejected: {result}")

    def test_timeout_invocation_record_is_job_scoped(self):
        """A6/A8: invocation records for job A do not appear under job B."""
        job_a = "aaa-invscope"
        job_b = "bbb-invscope"
        src_a = self._mksource(f"{job_a}.md")
        src_b = self._mksource(f"{job_b}.md")
        self.ctl.create_job(job_a, "test", [{"path": str(src_a)}], event_id=f"{job_a}-c")
        self.ctl.create_job(job_b, "test", [{"path": str(src_b)}], event_id=f"{job_b}-c")

        studio_root = self.tmp_path / "VideoStudioA8c"
        studio_root.mkdir()
        adapter = StudioAdapter(self.ctl, studio_root=studio_root)

        inv_id = "a8-inv-scoped"
        inv_path_a = adapter._invocation_path(job_a, inv_id)
        inv_path_b = adapter._invocation_path(job_b, inv_id)

        # Write invocation record for job A.
        inv_path_a.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_json(inv_path_a, {"invocation_id": inv_id, "job_id": job_a, "uncertain": True})

        # Job B's invocation path must not exist.
        self.assertFalse(inv_path_b.exists(),
            "invocation record for job A must not appear under job B's path")

        # Confirm job A's path is separate from job B's path.
        self.assertNotEqual(str(inv_path_a), str(inv_path_b))


if __name__ == "__main__":
    unittest.main()
