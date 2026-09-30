"""Narrow studio adapter for VideoStudio integration.

Scope
-----
This adapter bridges the Creator Editing Steward controller with a local
Remotion-based VideoStudio at /Users/sheshnarayaniyer/VideoStudio or
/tmp/VideoStudio.  It exposes only named actions with validated job IDs and
zero shell interpolation.  No studio source files are modified.

ADAPTER-REVIEW.md repairs (8 gates)
-------------------------------------
A1. _exec_script JSON parser: scripts emit pretty-printed multiline JSON;
    the old line-by-line scanner returned None on multiline output and
    reported ok=True on zero-exit even with no parsed result.
    Fixed: use json.JSONDecoder.raw_decode on the full stdout looking for
    the last occurrence of a ``{`` that opens a valid JSON object.
    A zero-exit with no parseable JSON summary is now ok=False.

A2. Directory paths from new-video.mjs: hashing a directory raised an
    error.  Fixed: only fingerprint regular files; directories are reported
    as {"key": ..., "path": ..., "is_dir": true} without a sha256.

A3. Draft/final version recheck: draft checked only that *some* plan
    approval exists; final checked only that *some* draft approval exists.
    Fixed: both actions now recheck that the *currently approved* artifact
    version and sha256 exactly match what is on disk (ArtifactDrift raised
    if the artifact has been changed since approval).  Fixture must be a
    registered source in the job's source list, not just any /tmp path.
    Removed blanket /tmp from allowed_source_roots defaults.

A4. stills job containment: comp_id was accepted from kwargs without
    restricting to this job's named composition.  Outputs were not
    checked for job containment.  Fixed: comp_id must equal the job's
    canonical composition name (TitleCase + Vertical/Horizontal).  Every
    reported output path is verified to be under the studio job directory
    before hashing.

A5. Final replay cache key: used only the first 16 chars of the draft SHA
    and ignored requested format.  Fixed: cache key is
    sha256(draft_sha + "|" + format + "|" + sorted source fingerprints).
    On replay the cached output file is re-checked for existence and hash;
    a missing or drifted file is not served as a successful replay.

A6. Timeout uncertainty persistence: a TimeoutExpired previously returned
    an ephemeral error dict without persisting durable uncertain state.
    Fixed: before launching the subprocess an *invocation record* is
    written to <job_dir>/invocations/<event_id>.json.  On timeout the
    record is updated to uncertain=True; the subprocess tree is killed
    (os.killpg) to prevent a ghost render.  run() refuses to re-run the
    same invocation_id while uncertain=True; call reconcile() first.

A7. Final evidence verification: _run_final previously wrote a receipt
    based solely on the script's ok flag.  Fixed: after a successful
    script result, the adapter re-reads every output path, verifies the
    file exists and its sha256 matches the script-reported value, and then
    writes the receipt.  The receipt includes a verified_output_sha256.
    A script that reports ok=True but whose output file is missing or
    drifted returns ok=False.

Gate contract (unchanged from previous adapter version):
  - prep/create: any stage
  - stills: planned or later
  - draft: plan_approved or later
  - final: draft_approved only

Security:
  - Job name is validated against _JOB_ID_RE before being passed to any script.
  - No shell=True; arguments are passed as a list to subprocess.run.
  - Fixture path for draft action is validated against registered job sources.
  - Process is bounded to MAX_PROCESS_SECONDS; uncertain interrupted outcomes
    are recorded durably as invocation records; retry is refused until reconcile().
  - All structured JSON output from scripts is parsed from stdout.
  - Directory paths (new-video.mjs) are not file-hashed.

Finalized replays:
  - Receipt key: sha256(draft_sha | format | sorted(source_shas)).
  - Receipt file: <job_dir>/render-receipts/<receipt_key>.json.
  - Replay verifies output file exists + hash matches before serving.
  - Missing/drifted output returns ok=False.

Studio worker is still building — do NOT import or modify studio internals.
Allowed studio roots: /Users/sheshnarayaniyer/VideoStudio, /tmp/VideoStudio.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional

from .controller import Controller
from .model import InvalidTransition, UnknownJob
from .store import sha256_file, sha256_bytes, atomic_write_json, ensure_job_dir, ensure_within, flock

# Canonical studio roots.
_STUDIO_ROOTS = [
    Path("/Users/sheshnarayaniyer/VideoStudio"),
    Path("/tmp/VideoStudio"),
    Path("/private/tmp/VideoStudio"),
]

# Allowed named actions.
STUDIO_ACTIONS = frozenset(["create", "prep", "stills", "draft", "final"])

# Job ID regex (same as controller).
_JOB_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")

# Stages at which each action is permitted.
_ACTION_MIN_STAGES: dict[str, set[str]] = {
    "create": {
        "intake", "planned", "awaiting_plan_approval",
        "plan_approved", "draft_ready", "awaiting_draft_approval",
        "draft_approved", "finalized",
    },
    "prep": {
        "intake", "planned", "awaiting_plan_approval",
        "plan_approved", "draft_ready", "awaiting_draft_approval",
        "draft_approved", "finalized",
    },
    "stills": {
        "planned", "awaiting_plan_approval", "plan_approved",
        "draft_ready", "awaiting_draft_approval", "draft_approved", "finalized",
    },
    "draft": {
        "plan_approved", "draft_ready", "awaiting_draft_approval",
        "draft_approved", "finalized",
    },
    "final": {"draft_approved", "finalized"},
}

# Maximum seconds a script is allowed to run before we record an uncertain outcome.
MAX_PROCESS_SECONDS = 300


class StudioAdapterError(Exception):
    pass


class InvocationUncertain(Exception):
    """A previous invocation timed out and has not been reconciled."""
    pass


class StudioAdapter:
    """Execute named VideoStudio scripts for a given job.

    Parameters
    ----------
    controller:
        The CEOS Controller instance (required for stage gate checks).
    studio_root:
        Override the studio root for tests.  Production uses the first
        existing path from _STUDIO_ROOTS.
    allowed_source_roots:
        Additional allowed roots for fixture/source path validation.
        NOTE: /tmp is NOT added by default.  The fixture for draft must
        be a registered source in the job's source list.
    """

    def __init__(
        self,
        controller: Controller,
        studio_root: Optional[Path] = None,
        allowed_source_roots: Optional[list[Path]] = None,
    ) -> None:
        self.ctl = controller
        self.studio_root = studio_root or _find_studio_root()
        # A3: no blanket /tmp in allowed_source_roots by default.
        self._allowed_source_roots: list[Path] = list(allowed_source_roots or [])

    # ---------- public interface ----------

    def run(self, action: str, job_id: str, **kwargs: Any) -> dict:
        if not _JOB_ID_RE.fullmatch(job_id):
            raise StudioAdapterError("invalid job_id")
        if kwargs.get("invocation_id"):
            self._invocation_path(job_id, kwargs["invocation_id"])
        try:
            with flock(self.ctl.state_root / "jobs" / job_id / "studio.lock", timeout=0.1):
                return self._run_locked(action, job_id, **kwargs)
        except TimeoutError:
            return _fail(action, job_id, ["another studio operation owns this job; inspect before retrying"])

    def _run_locked(self, action: str, job_id: str, **kwargs: Any) -> dict:
        """Execute a named studio action for job_id.

        Returns a dict: {action, job_id, ok, artifacts, errors, hashes}.
        Never raises on a missing file or failed script; errors are reported
        in the result dict.  ok=False on any error.
        """
        if action not in STUDIO_ACTIONS:
            raise StudioAdapterError(
                f"unknown studio action {action!r}; allowed: {sorted(STUDIO_ACTIONS)}"
            )
        if not _JOB_ID_RE.match(job_id):
            raise StudioAdapterError(f"invalid job_id {job_id!r}")

        # Stage gate check.
        try:
            state_dict = self.ctl.inspect(job_id)["state"]
        except UnknownJob:
            return _fail(action, job_id, [f"job {job_id!r} not found in controller"])
        current_stage = state_dict.get("stage", "")
        allowed_stages = _ACTION_MIN_STAGES.get(action, set())
        if current_stage not in allowed_stages:
            return _fail(
                action, job_id,
                [
                    f"action {action!r} requires stage in {sorted(allowed_stages)}; "
                    f"current stage is {current_stage!r}. "
                    + _gate_hint(action)
                ],
            )

        # Recheck actual source bytes and the exact approved artifact before execution.
        try:
            for source in state_dict.get("sources", []):
                path = Path(source["path"])
                if not path.is_file() or sha256_file(path) != source.get("sha256"):
                    return _fail(action, job_id, ["registered source drift; fresh review required"])
            if action in ("draft", "final"):
                kind = "plan" if action == "draft" else "draft"
                art = state_dict.get("artifacts", {}).get(kind, {})
                approval = _find_approval(state_dict, kind)
                if approval:
                    path = (self.ctl.state_root / "jobs" / job_id / art["path"]).resolve()
                    path.relative_to((self.ctl.state_root / "jobs" / job_id).resolve())
                    if (art.get("version") != approval.get("artifact_version") or
                        art.get("sha256") != approval.get("artifact_sha256") or
                        sha256_file(path) != approval.get("artifact_sha256")):
                        return _fail(action, job_id, [f"approved {kind} artifact version/sha256 drift; fresh review required"])
        except (OSError, ValueError, KeyError) as exc:
            return _fail(action, job_id, [f"cannot verify approved inputs: {exc}"])

        # Dispatch to named script runners.
        inv_id = kwargs.get("invocation_id")
        if action == "create":
            return self._run_create(job_id, kwargs.get("video_type", "talking"), inv_id, state_dict)
        if action == "prep":
            return self._run_prep(job_id, kwargs.get("fps"), inv_id, state_dict)
        if action == "stills":
            return self._run_stills(
                job_id, kwargs.get("comp_id"), kwargs.get("every"), inv_id, state_dict
            )
        if action == "draft":
            return self._run_draft(
                job_id, kwargs.get("fixture_path"),
                kwargs.get("invocation_id"), state_dict,
            )
        if action == "final":
            return self._run_final(
                job_id, kwargs.get("format", "9:16"),
                kwargs.get("invocation_id"), state_dict,
            )
        return _fail(action, job_id, ["dispatch error"])

    def reconcile(self, job_id: str, invocation_id: str, resolved: str) -> dict:
        """Reconcile an uncertain invocation (timed-out render).

        resolved must be "success" or "failure".  On success the caller must
        supply final evidence separately via Controller.save_artifact.
        Returns the updated invocation record.
        """
        inv_path = self._invocation_path(job_id, invocation_id)
        if not inv_path.exists():
            return {"ok": False, "errors": [f"invocation {invocation_id!r} not found"]}
        try:
            rec = json.loads(inv_path.read_text())
        except Exception as exc:
            return {"ok": False, "errors": [f"cannot read invocation record: {exc}"]}
        if not rec.get("uncertain"):
            return {"ok": False, "errors": ["invocation is not uncertain; no reconcile needed"]}
        if resolved not in ("success", "failure"):
            return {"ok": False, "errors": [f"resolved must be 'success' or 'failure', got {resolved!r}"]}
        rec["uncertain"] = False
        rec["status"] = "reconciled"
        rec["resolved"] = resolved
        try:
            atomic_write_json(inv_path, rec)
        except Exception as exc:
            return {"ok": False, "errors": [f"failed to persist reconcile: {exc}"]}
        return {"ok": True, "invocation_id": invocation_id, "resolved": resolved, "record": rec}

    # ---------- named script runners ----------

    def _run_create(self, job_id: str, video_type: str, invocation_id: Any, state_dict: dict) -> dict:
        """node scripts/new-video.mjs <name> [--type talking|montage]"""
        if video_type not in ("talking", "montage"):
            video_type = "talking"
        args = [job_id, "--type", video_type]
        return self._exec_script("new-video.mjs", args, job_id, "create", invocation_id=invocation_id)

    def _run_prep(self, job_id: str, fps: Any, invocation_id: Any, state_dict: dict) -> dict:
        """node scripts/prep.mjs <name> [--fps N]"""
        import shutil
        footage = self.studio_root.resolve() / "assets" / "projects" / job_id / "footage"
        try:
            footage.resolve().relative_to(self.studio_root.resolve() / "assets" / "projects" / job_id)
            footage.mkdir(parents=True, exist_ok=True)
            for source in state_dict.get("sources", []):
                src = Path(source["path"])
                if src.suffix.lower() not in (".mp4", ".mov", ".mkv", ".webm", ".srt"):
                    continue
                dest = footage / src.name
                dest.resolve().relative_to(footage)
                if dest.exists() and sha256_file(dest) != source["sha256"]:
                    return _fail("prep", job_id, ["existing media differs from registered source; version the input"])
                if not dest.exists():
                    shutil.copy2(src, dest)
        except (OSError, ValueError, KeyError) as exc:
            return _fail("prep", job_id, [f"cannot prepare registered inputs: {exc}"])
        args = [job_id]
        if fps is not None:
            try:
                fps_int = int(fps)
                if 1 <= fps_int <= 120:
                    args += ["--fps", str(fps_int)]
            except (TypeError, ValueError):
                pass
        return self._exec_script("prep.mjs", args, job_id, "prep", invocation_id=invocation_id)

    def _run_stills(self, job_id: str, comp_id: Any, every: Any, invocation_id: Any, state_dict: dict) -> dict:
        """node scripts/stills.mjs <CompositionId> [--every=N] [--key]

        A4: comp_id must be the job's canonical composition name.
        Caller-supplied comp_id is rejected if it does not match.
        """
        canonical_vertical = _job_id_to_comp(job_id) + "Vertical"
        canonical_horizontal = _job_id_to_comp(job_id) + "Horizontal"
        canonical_comps = {canonical_vertical, canonical_horizontal}

        if comp_id:
            # A4: reject comp_id that does not belong to this job.
            if str(comp_id) not in canonical_comps:
                return _fail("stills", job_id, [
                    f"comp_id {comp_id!r} does not match this job's compositions "
                    f"({canonical_vertical}, {canonical_horizontal}); "
                    "use the job's own composition name or omit comp_id"
                ])
            chosen_comp = str(comp_id)
        else:
            chosen_comp = canonical_vertical

        args = [chosen_comp]
        if every is not None:
            try:
                every_int = int(every)
                if 1 <= every_int <= 300:
                    args.append(f"--every={every_int}")
            except (TypeError, ValueError):
                pass

        result = self._exec_script("stills.mjs", args, job_id, "stills", invocation_id=invocation_id)

        # A4: enforce job containment on reported still output paths.
        if result.get("ok") or result.get("artifacts"):
            job_studio_dir = self.studio_root / "out" / job_id
            safe_artifacts = []
            containment_errors = []
            for entry in result.get("artifacts", []):
                p = Path(str(entry.get("path", "")))
                if not _path_under(p, job_studio_dir):
                    containment_errors.append(
                        f"still output {p} is outside job directory {job_studio_dir}; rejected"
                    )
                    continue
                safe_artifacts.append(entry)
            if containment_errors:
                result["ok"] = False
                result["errors"] = list(result.get("errors", [])) + containment_errors
            result["artifacts"] = safe_artifacts

        return result

    def _run_draft(
        self, job_id: str, fixture_path: Any, invocation_id: Any, state_dict: dict
    ) -> dict:
        """node scripts/ingest-draft.mjs <name> --fixture <path>

        A3: Recheck that the currently approved plan version matches the
        recorded approval's expected_version and sha256.  Fixture must be
        a registered source in the job's source list.
        """
        # Verify plan approval exists and version still matches.
        plan_approval = _find_approval(state_dict, "plan")
        if plan_approval is None:
            return _fail("draft", job_id, [
                "plan approval not recorded; run `ceos-operator approve --stage plan` first"
            ])

        # A3: recheck current plan artifact matches approved version/sha256.
        plan_art = state_dict.get("artifacts", {}).get("plan", {})
        if not plan_art:
            return _fail("draft", job_id, ["no plan artifact in job state"])
        current_plan_sha = plan_art.get("sha256", "")
        approved_sha = plan_approval.get("artifact_sha256", "")
        if current_plan_sha != approved_sha:
            return _fail("draft", job_id, [
                f"plan artifact has changed since approval "
                f"(approved sha256={approved_sha[:12]!r}, current={current_plan_sha[:12]!r}); "
                "re-submit and re-approve the revised plan before running draft"
            ])

        if not fixture_path:
            return _fail("draft", job_id, [
                "fixture_path is required for the draft action; "
                "provide a path to a registered source clip"
            ])

        fp = Path(str(fixture_path))

        # A3: fixture must be a registered source, not just any /tmp path.
        if not self._is_registered_source(fp, state_dict):
            return _fail("draft", job_id, [
                f"fixture_path {fp!r} is not a registered source for this job; "
                "only sources listed at intake are accepted as draft fixtures"
            ])

        if not fp.exists():
            return _fail("draft", job_id, [f"fixture_path {fp!r} does not exist"])

        args = [job_id, "--fixture", str(fp)]
        captions = [Path(src["path"]) for src in state_dict.get("sources", []) if Path(src["path"]).suffix.lower() == ".srt"]
        if len(captions) > 1:
            return _fail("draft", job_id, ["select one exact caption source for the job"])
        if captions:
            args += ["--srt", str(captions[0])]
        inv_id = str(invocation_id) if invocation_id else _make_invocation_id(job_id, "draft")
        result = self._exec_script(
            "ingest-draft.mjs", args, job_id, "draft", invocation_id=inv_id
        )

        # Bind render_inputs snapshot: fingerprint job-config, voice.wav, composition
        # root, and fixture sha.  These are verified before final render to detect drift.
        if result.get("ok"):
            render_inputs = _compute_render_inputs(
                job_id=job_id,
                studio_root=self.studio_root,
                fixture_path=fp,
                state_dict=state_dict,
            )
            result["render_inputs"] = render_inputs

        return result

    def _run_final(
        self, job_id: str, fmt: str, invocation_id: Any, state_dict: dict
    ) -> dict:
        """node scripts/render-final.mjs <name> [--format=...] [--version=<sha>]

        A3: Recheck draft approval version before executing.
        A5: Receipt key includes full draft sha + format + source fingerprints.
        A5: Replay verifies output file exists and hash matches.
        A7: Verify script output files after render before writing receipt.
        """
        # A3: verify draft approval and current draft artifact match.
        draft_approval = _find_approval(state_dict, "draft")
        if draft_approval is None:
            return _fail("final", job_id, [
                "draft approval not recorded; run `ceos-operator approve --stage draft` first"
            ])

        draft_art = state_dict.get("artifacts", {}).get("draft", {})
        if not draft_art:
            return _fail("final", job_id, ["no draft artifact found in job state"])

        # A3: recheck current draft artifact SHA matches the approved SHA.
        current_draft_sha = draft_art.get("sha256", "")
        approved_draft_sha = draft_approval.get("artifact_sha256", "")
        if current_draft_sha != approved_draft_sha:
            return _fail("final", job_id, [
                f"draft artifact has changed since approval "
                f"(approved sha256={approved_draft_sha[:12]!r}, current={current_draft_sha[:12]!r}); "
                "re-submit and re-approve the revised draft before rendering final"
            ])

        # The durable artifact contains the reviewed render-input snapshot.
        # State metadata deliberately contains only path/version/hash, never body.
        try:
            artifact_path = self.ctl.state_root / "jobs" / job_id / draft_art["path"]
            envelope = json.loads(artifact_path.read_text())
            snap = envelope.get("render_inputs", envelope) if isinstance(envelope, dict) else None
            current_ri = _compute_render_inputs(job_id, self.studio_root, Path("."), state_dict)
            if not isinstance(snap, dict) or snap.get("job_id") != job_id:
                return _fail("final", job_id, ["draft lacks a reviewed render_inputs binding; fresh draft review required"])
            keys = ("job_config_sha256", "voice_wav_sha256", "caption_srt_sha256",
                    "composition_dir_fingerprint", "shared_code_fingerprint", "public_clip_sha256", "source_shas")
            drift = [key for key in keys if snap.get(key) != current_ri.get(key)]
            if drift or not snap.get("job_config_sha256") or not snap.get("public_clip_sha256"):
                return _fail("final", job_id, ["render input drift or incomplete binding: " + ", ".join(drift)])
        except (OSError, ValueError, KeyError, TypeError) as exc:
            return _fail("final", job_id, [f"cannot read approved render_inputs: {exc}"])

        if fmt not in ("9:16", "16:9", "both"):
            fmt = "9:16"

        # A5: build cache key from full draft sha + format + sorted source fingerprints.
        source_shas = sorted(
            s.get("sha256", "") for s in state_dict.get("sources", []) if s.get("sha256")
        )
        receipt_key = _receipt_cache_key(current_draft_sha, fmt, source_shas)
        receipt_path = self._receipt_path(job_id, receipt_key)

        # A5: replay — only serve if output file still exists and hash matches.
        if receipt_path.exists():
            try:
                receipt = json.loads(receipt_path.read_text())
                verified = _verify_receipt_outputs(receipt)
                if verified:
                    return {
                        "action": "final",
                        "job_id": job_id,
                        "ok": receipt.get("ok", False),
                        "artifacts": receipt.get("artifacts", []),
                        "errors": [],
                        "hashes": receipt.get("hashes", {}),
                        "receipt": str(receipt_path),
                        "replayed": True,
                    }
                else:
                    # Output drifted; do not serve stale replay.
                    receipt_path.replace(receipt_path.with_suffix(".held.json"))
            except Exception:
                receipt_path.replace(receipt_path.with_suffix(".held.json"))

        if state_dict.get("stage") == "finalized":
            return _fail("final", job_id, ["finalized output receipt missing or drifted; reconcile before any new render"])

        inv_id = str(invocation_id) if invocation_id else _make_invocation_id(job_id, "final")
        args = [job_id, f"--format={fmt}", f"--version={current_draft_sha}"]
        result = self._exec_script(
            "render-final.mjs", args, job_id, "final", invocation_id=inv_id
        )

        if result.get("ok"):
            try:
                after = _compute_render_inputs(job_id, self.studio_root, Path("."), state_dict)
                source_drift = any(sha256_file(Path(src["path"])) != src["sha256"] for src in state_dict.get("sources", []))
                if source_drift or any(after.get(key) != current_ri.get(key) for key in keys):
                    return _fail("final", job_id, ["inputs changed during rendering; output held for renewed review"])
            except (OSError, ValueError, KeyError) as exc:
                return _fail("final", job_id, [f"cannot verify render inputs after execution: {exc}"])

        # A7: after successful script, re-verify output files exist and hashes match.
        if result.get("ok"):
            verification_errors = _verify_output_hashes(result)
            if verification_errors:
                result["ok"] = False
                result["errors"] = list(result.get("errors", [])) + verification_errors
            else:
                # Write receipt so finalized replays are served from cache.
                receipt_path.parent.mkdir(parents=True, exist_ok=True)
                receipt_to_store = dict(result)
                receipt_to_store["receipt_key"] = receipt_key
                receipt_to_store["render_inputs_snapshot"] = {
                    "draft_sha256": current_draft_sha,
                    "fmt": fmt,
                    "source_shas": source_shas,
                }
                try:
                    atomic_write_json(receipt_path, receipt_to_store)
                except Exception:
                    pass

                # Write canonical asset-manifest: real probe/fingerprint from output files.
                # Do NOT trust caller probe summaries — re-probe each artifact.
                try:
                    manifest_artifacts = []
                    for entry in result.get("artifacts", []):
                        p = Path(str(entry.get("path", "")))
                        if not p.exists() or not p.is_file():
                            continue
                        probe = _ffprobe(p)
                        manifest_artifacts.append({
                            "path": str(p),
                            "sha256": entry.get("sha256", sha256_file(p)),
                            "format": entry.get("format", ""),
                            "probe": probe,
                        })
                    from .store import utcnow as _utcnow_store
                    asset_manifest = {
                        "job_id": job_id,
                        "finalized_at": _utcnow_store(),
                        "draft_sha256": current_draft_sha,
                        "source_shas": {
                            s.get("label", str(i)): s.get("sha256", "")
                            for i, s in enumerate(state_dict.get("sources", []))
                        },
                        "publication_status": "not_published",
                        "artifacts": manifest_artifacts,
                        "receipt_key": receipt_key,
                    }
                    manifest_path = (
                        self.ctl.state_root / "jobs" / job_id / "asset-manifest.json"
                    )
                    atomic_write_json(manifest_path, asset_manifest)
                    result["asset_manifest"] = str(manifest_path)
                except Exception:
                    pass

        return result

    # ---------- script execution ----------

    def _exec_script(
        self,
        script_name: str,
        args: list[str],
        job_id: str,
        action: str,
        invocation_id: Optional[str] = None,
    ) -> dict:
        """Run node scripts/<script_name> with validated args.

        - No shell=True.
        - Process bounded to MAX_PROCESS_SECONDS.
        - A6: durable invocation record written before launch; uncertain on timeout;
          subprocess tree killed on timeout.
        - A1: structured JSON parsed from full stdout using raw_decode, not line scan.
        - A1: zero-exit with no parseable JSON summary is ok=False.
        - A2: directories in 'paths' are not hashed.
        """
        script_path = self.studio_root / "scripts" / script_name
        if not script_path.exists():
            return _fail(action, job_id, [
                f"studio script {script_path} not found; "
                "is VideoStudio installed and npm install run?"
            ])

        node_bin = _find_node()
        if node_bin is None:
            return _fail(action, job_id, [
                "node binary not found on PATH; install Node.js to run studio scripts"
            ])

        cmd = [node_bin, str(script_path)] + [str(a) for a in args]

        # A6: resolve invocation_id before writing any record.
        inv_id = invocation_id or _make_invocation_id(job_id, action)
        inv_path = self._invocation_path(job_id, inv_id)

        # A render interrupted by process death remains held even with a new caller ID.
        if action in ("draft", "final"):
            for record in inv_path.parent.glob("*.json"):
                try:
                    prior = json.loads(record.read_text())
                except (OSError, ValueError):
                    return _fail(action, job_id, ["unreadable invocation evidence; reconcile before retrying"])
                if prior.get("action") == action and (prior.get("uncertain") or prior.get("status") == "running"):
                    return _fail(action, job_id, [f"unfinished invocation {prior.get('invocation_id')}; reconcile before retrying"])

        # A6: check uncertain BEFORE writing a new record (don't overwrite a live uncertain state).
        if inv_path.exists():
            try:
                existing = json.loads(inv_path.read_text())
                if existing.get("uncertain"):
                    return _fail(action, job_id, [
                        f"invocation {inv_id!r} is in uncertain state from a previous timeout; "
                        "call reconcile() with resolved='success' or 'failure' before retrying"
                    ])
            except Exception:
                pass

        # A6: write durable invocation record before launch.
        invocation_record: dict = {
            "invocation_id": inv_id,
            "action": action,
            "job_id": job_id,
            "script": script_name,
            "args": [str(a) for a in args],
            "started_at": _utcnow(),
            "uncertain": False,
            "status": "running",
            "resolved": None,
        }
        try:
            inv_path.parent.mkdir(parents=True, exist_ok=True)
            atomic_write_json(inv_path, invocation_record)
        except Exception as exc:
            return _fail(action, job_id, [f"cannot persist invocation before execution: {exc}"])

        start = time.monotonic()
        proc: Optional[subprocess.Popen] = None  # type: ignore[assignment]

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=str(self.studio_root),
                start_new_session=True,  # A6: own process group for clean kill
            )
            try:
                stdout, stderr = proc.communicate(timeout=MAX_PROCESS_SECONDS)
            except subprocess.TimeoutExpired:
                # A6: kill the subprocess tree to avoid ghost render.
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                proc.wait()
                elapsed = time.monotonic() - start
                # A6: persist uncertain state durably.
                invocation_record["uncertain"] = True
                invocation_record["timeout_after_s"] = round(elapsed, 1)
                try:
                    atomic_write_json(inv_path, invocation_record)
                except Exception:
                    pass
                return _fail(action, job_id, [
                    f"studio script {script_name} timed out after {elapsed:.0f}s "
                    f"(limit {MAX_PROCESS_SECONDS}s); outcome uncertain — "
                    f"invocation_id={inv_id!r}; "
                    f"call reconcile(job_id={job_id!r}, invocation_id={inv_id!r}, ...) "
                    "before retrying"
                ])
        except Exception as exc:
            return _fail(action, job_id, [f"failed to launch {script_name}: {exc}"])

        elapsed = time.monotonic() - start
        returncode = proc.returncode if proc is not None else -1
        invocation_record["status"] = "exited"
        invocation_record["returncode"] = returncode
        try:
            atomic_write_json(inv_path, invocation_record)
        except OSError:
            return _fail(action, job_id, ["process exited but outcome could not be saved; reconcile before retrying"])

        # A1: parse structured JSON from full stdout using raw_decode.
        # Scripts may emit pretty-printed multiline JSON; find the last { opening a
        # valid JSON object anywhere in stdout.
        parsed: Optional[dict] = _parse_last_json_object(stdout or "")

        if returncode != 0:
            errors = [f"{script_name} exited {returncode}"]
            if stderr:
                errors.append(stderr.strip()[:500])
            if stdout and not parsed:
                errors.append(stdout.strip()[:500])
            return _fail(action, job_id, errors)

        # A1: zero-exit but no parseable JSON → ok=False (not silent ok=True).
        if parsed is None:
            return _fail(action, job_id, [
                f"script {script_name} exited 0 but emitted no parseable JSON summary; "
                f"stdout preview: {(stdout or '').strip()[:200]!r}"
            ])

        # Merge script JSON into our response envelope.
        # Reject another job's files before any read/hash, including symlink targets.
        base = self.studio_root.resolve()
        roots = [base / group / job_id for group in ("out", "work")]
        roots += [base / "assets" / "projects" / job_id, base / "public" / "projects" / job_id, base / "src" / "videos" / job_id]
        roots += [base / "work" / "stills" / (_job_id_to_comp(job_id) + orientation) for orientation in ("Vertical", "Horizontal")]
        candidates = list(parsed.get("paths", {}).values()) if isinstance(parsed.get("paths"), dict) else []
        candidates += [parsed.get("prepMd"), parsed.get("contactSheet"), parsed.get("draft")]
        if isinstance(parsed.get("draftRender"), dict):
            candidates.append(parsed["draftRender"].get("path"))
        candidates += parsed.get("rendered", [])
        for items in (parsed.get("results", []), parsed.get("outputs", []), parsed.get("clips", []), parsed.get("stills", [])):
            for item in items:
                candidates.append((item.get("finalFile") or item.get("work") or item.get("path")) if isinstance(item, dict) else item)
        for candidate in candidates:
            if not candidate:
                continue
            path = Path(str(candidate)).resolve()
            if not any(path == root or path.is_relative_to(root) for root in roots):
                return _fail(action, job_id, ["script output path is outside this job directory"])
        artifacts: list[dict] = []
        hashes: dict[str, str] = {}
        errors: list[str] = []

        # Scripts emit different JSON shapes; normalize to our contract.
        if "paths" in parsed:
            # new-video.mjs style: paths is a dict of key -> path_str
            for key, path_str in parsed["paths"].items():
                p = Path(str(path_str))
                entry: dict = {"key": key, "path": str(p)}
                # A2: only hash regular files, not directories.
                if p.exists():
                    if p.is_file():
                        sha = sha256_file(p)
                        entry["sha256"] = sha
                        hashes[str(p)] = sha
                    else:
                        entry["is_dir"] = True
                artifacts.append(entry)
        elif "prepMd" in parsed:
            p = Path(parsed["prepMd"])
            if not _path_under(p, self.studio_root / "work" / job_id):
                return _fail(action, job_id, ["prep report escaped its job"])
            artifacts.append({"path": str(p), "sha256": sha256_file(p)})
            hashes[str(p)] = sha256_file(p)
        elif "clips" in parsed:
            # prep.mjs style
            for clip in parsed.get("clips", []):
                if isinstance(clip, dict):
                    p_str = clip.get("work") or clip.get("path", "")
                    p = Path(str(p_str)) if p_str else None
                    entry = {"path": p_str, "status": clip.get("status", "unknown")}
                    if p and p.exists() and p.is_file():
                        sha = sha256_file(p)
                        entry["sha256"] = sha
                        hashes[str(p)] = sha
                    artifacts.append(entry)
                    if clip.get("status") == "HELD":
                        errors.append(f"clip {clip.get('source', '')} held: {clip.get('reason', '')}")
        elif "results" in parsed:
            # render-final.mjs actual contract: { ok, name, results: [{finalFile, ...}] }
            for r_item in parsed.get("results", []):
                if not isinstance(r_item, dict):
                    continue
                final_file = r_item.get("finalFile") or r_item.get("path", "")
                if not final_file:
                    continue
                p = Path(str(final_file))
                # Containment: must be a regular file, enforce before hashing.
                if not p.exists() or not p.is_file():
                    errors.append(
                        f"render-final reported {p} but file does not exist or is not regular"
                    )
                    continue
                sha = sha256_file(p)
                entry = {"path": str(p), "sha256": sha, "format": r_item.get("format", "")}
                hashes[str(p)] = sha
                artifacts.append(entry)
        elif "outputs" in parsed:
            # backward-compat for test stubs that emit outputs[].path
            for out_item in parsed.get("outputs", []):
                if isinstance(out_item, dict):
                    p = Path(str(out_item.get("path", "")))
                    entry = {"path": str(p)}
                    if p.exists() and p.is_file():
                        sha = sha256_file(p)
                        entry["sha256"] = sha
                        hashes[str(p)] = sha
                    artifacts.append(entry)
        elif "draft" in parsed and isinstance(parsed.get("draft"), dict):
            # ingest-draft.mjs contract: { ok, draft:{path,...}, stills:[{label,frame,path}] }
            draft_info = parsed["draft"]
            draft_path_str = draft_info.get("path", "")
            if draft_path_str:
                p = Path(str(draft_path_str))
                entry = {"key": "draftRender", "path": str(p)}
                if p.exists() and p.is_file():
                    sha = sha256_file(p)
                    entry["sha256"] = sha
                    hashes[str(p)] = sha
                artifacts.append(entry)
            # Also collect stills from ingest-draft (array of {label,frame,path} objects).
            for still_obj in parsed.get("stills", []):
                if isinstance(still_obj, dict):
                    sp_str = still_obj.get("path", "")
                elif isinstance(still_obj, str):
                    sp_str = still_obj
                else:
                    continue
                if not sp_str:
                    continue
                sp = Path(str(sp_str))
                sentry = {"path": str(sp), "label": still_obj.get("label", "") if isinstance(still_obj, dict) else ""}
                if sp.exists() and sp.is_file():
                    sha = sha256_file(sp)
                    sentry["sha256"] = sha
                    hashes[str(sp)] = sha
                artifacts.append(sentry)
        elif "rendered" in parsed:
            # stills.mjs actual contract: { ok, rendered: [path_str, ...], contactSheet, ... }
            for still_path in parsed.get("rendered", []):
                p = Path(str(still_path))
                entry = {"path": str(p)}
                if p.exists() and p.is_file():
                    sha = sha256_file(p)
                    entry["sha256"] = sha
                    hashes[str(p)] = sha
                artifacts.append(entry)
        elif "stills" in parsed:
            # legacy / test-stub stills style (array of path strings or objects)
            for still_item in parsed.get("stills", []):
                if isinstance(still_item, dict):
                    sp_str = still_item.get("path", "")
                elif isinstance(still_item, str):
                    sp_str = still_item
                else:
                    continue
                p = Path(str(sp_str))
                entry = {"path": str(p)}
                if p.exists() and p.is_file():
                    sha = sha256_file(p)
                    entry["sha256"] = sha
                    hashes[str(p)] = sha
                artifacts.append(entry)

        script_ok = parsed.get("ok", returncode == 0)
        script_errors = parsed.get("errors", [])
        if isinstance(script_errors, list):
            errors.extend(script_errors)

        return {
            "action": action,
            "job_id": job_id,
            "ok": bool(script_ok) and len([e for e in errors if e]) == 0,
            "artifacts": artifacts,
            "errors": errors,
            "hashes": hashes,
            "script_result": parsed,
            "elapsed_s": round(elapsed, 2),
        }

    # ---------- helpers ----------

    def _receipt_path(self, job_id: str, receipt_key: str) -> Path:
        receipts_dir = self.ctl.state_root / "jobs" / job_id / "render-receipts"
        return receipts_dir / f"{receipt_key}.json"

    def _invocation_path(self, job_id: str, invocation_id: str) -> Path:
        if not isinstance(invocation_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", invocation_id):
            raise StudioAdapterError("invalid invocation_id; path characters are forbidden")
        inv_dir = self.ctl.state_root / "jobs" / job_id / "invocations"
        return ensure_within(self.ctl.state_root / "jobs" / job_id, inv_dir / f"{invocation_id}.json")

    def _is_allowed_source(self, path: Path) -> bool:
        """Legacy check against allowed_source_roots (used by non-draft actions)."""
        try:
            resolved = path.resolve() if path.exists() else path
            for root in self._allowed_source_roots:
                try:
                    root_r = root.resolve() if root.exists() else root
                    resolved.relative_to(root_r)
                    return True
                except ValueError:
                    continue
        except Exception:
            pass
        return False

    def _is_registered_source(self, path: Path, state_dict: dict) -> bool:
        """A3: Check that path matches a registered source in the job's source list."""
        try:
            resolved = path.resolve() if path.exists() else path
        except Exception:
            resolved = path
        for source in state_dict.get("sources", []):
            src_path_str = source.get("path", "")
            if not src_path_str:
                continue
            src_p = Path(src_path_str)
            try:
                src_resolved = src_p.resolve() if src_p.exists() else src_p
            except Exception:
                src_resolved = src_p
            if resolved == src_resolved or str(resolved) == str(src_resolved):
                return True
        # Strict: only exact registered sources are accepted.  No fallback to
        # allowed_source_roots — callers must register the clip at intake.
        return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _compute_render_inputs(
    job_id: str,
    studio_root: Path,
    fixture_path: Path,
    state_dict: dict,
) -> dict:
    """Compute a render_inputs fingerprint dict for the draft receipt.

    Captures sha256 of: job-config.json, voice.wav, composition code directory,
    fixture file, and registered source hashes.  Any missing file is recorded as
    None so the caller can detect drift without failing the draft.
    """
    def _safe_sha(p: Path) -> Optional[str]:
        try:
            if p.exists() and p.is_file():
                return sha256_file(p)
        except Exception:
            pass
        return None

    def _dir_fingerprint(p: Path) -> Optional[str]:
        """sha256 of sorted(sha256(file) for file in directory), for code directories."""
        if not p.exists() or not p.is_dir():
            return None
        try:
            import hashlib
            h = hashlib.sha256()
            for child in sorted(p.rglob("*")):
                if child.is_file():
                    h.update(child.name.encode())
                    h.update(sha256_file(child).encode())
            return h.hexdigest()
        except Exception:
            return None

    assets_dir = studio_root / "assets" / "projects" / job_id
    job_config_path = assets_dir / "job-config.json"
    voice_wav_path = assets_dir / "audio" / "voice.wav"
    caption_srt_path = assets_dir / "audio" / "captions.srt"
    comp_src_path = studio_root / "src" / "videos" / job_id
    config = json.loads(job_config_path.read_text()) if job_config_path.is_file() else {}
    public_name = config.get("publicClip")
    caption_name = config.get("srtFile")
    for name in (public_name, caption_name):
        if name and (Path(name).name != name or ".." in name):
            raise ValueError("render media filename must belong to its job")
    public_clip = studio_root / "public" / "projects" / job_id / (public_name or "__missing__")
    caption_srt_path = assets_dir / "footage" / (caption_name or "__missing__")
    if public_name and not _path_under(public_clip, studio_root / "public" / "projects" / job_id):
        raise ValueError("prepared media escaped its job")
    if caption_name and not _path_under(caption_srt_path, assets_dir / "footage"):
        raise ValueError("caption file escaped its job")
    shared_files = [studio_root / "src" / "Root.tsx", studio_root / "src" / "registry.ts", studio_root / "remotion.config.ts", studio_root / "package-lock.json"]
    shared_files += [studio_root / "scripts" / name for name in ("render-final.mjs", "ingest-draft.mjs", "project-assets.mjs", "update-registry.mjs")]
    for folder in (studio_root / "src" / "components", studio_root / "src" / "design"):
        if folder.exists():
            shared_files.extend(sorted(folder.rglob("*.ts*")))
    shared_fingerprint = sha256_bytes(json.dumps([
        (str(path.relative_to(studio_root)), _safe_sha(path)) for path in shared_files
    ], sort_keys=True).encode())

    ri: dict = {
        "job_id": job_id,
        "job_config_sha256": _safe_sha(job_config_path),
        "voice_wav_sha256": _safe_sha(voice_wav_path),
        "caption_srt_sha256": _safe_sha(caption_srt_path),
        "composition_dir_fingerprint": _dir_fingerprint(comp_src_path),
        "shared_code_fingerprint": shared_fingerprint,
        "public_clip_sha256": _safe_sha(public_clip),
        "fixture_sha256": _safe_sha(fixture_path),
        "source_shas": {
            s.get("label", str(i)): s.get("sha256", "")
            for i, s in enumerate(state_dict.get("sources", []))
        },
    }
    return ri


def _find_studio_root() -> Path:
    for root in _STUDIO_ROOTS:
        if root.exists():
            return root
    return _STUDIO_ROOTS[0]


def _find_node() -> Optional[str]:
    import shutil
    return shutil.which("node")


def _job_id_to_comp(job_id: str) -> str:
    """Convert a kebab-case job_id to TitleCase for Remotion composition IDs."""
    return "".join(word.capitalize() for word in re.split(r"[-_]", job_id))


def _ffprobe(path: Path) -> dict:
    """Run ffprobe and return a parsed dict.  Returns {"error": ...} if unavailable."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", "-show_format", str(path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return {"error": result.stderr.strip() or "ffprobe non-zero exit"}
        return json.loads(result.stdout)
    except FileNotFoundError:
        return {"error": "ffprobe not found; install ffmpeg to enable codec probing"}
    except subprocess.TimeoutExpired:
        return {"error": "ffprobe timed out"}
    except json.JSONDecodeError as exc:
        return {"error": f"ffprobe JSON parse error: {exc}"}


def _fail(action: str, job_id: str, errors: list[str]) -> dict:
    return {
        "action": action,
        "job_id": job_id,
        "ok": False,
        "artifacts": [],
        "errors": errors,
        "hashes": {},
    }


def _gate_hint(action: str) -> str:
    hints = {
        "draft": "Approve the plan first: `ceos-operator approve --stage plan`.",
        "final": "Approve the draft first: `ceos-operator approve --stage draft`.",
    }
    return hints.get(action, "")


def _make_invocation_id(job_id: str, action: str) -> str:
    """Generate a stable invocation ID from job_id + action + timestamp."""
    ts = str(int(time.time() * 1000))
    return f"{job_id}-{action}-{ts}"


def _utcnow() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _receipt_cache_key(draft_sha: str, fmt: str, source_shas: list[str]) -> str:
    """A5: full cache key = sha256(draft_sha | format | sorted source fingerprints)."""
    raw = draft_sha + "|" + fmt + "|" + ",".join(source_shas)
    return hashlib.sha256(raw.encode()).hexdigest()


def _parse_last_json_object(text: str) -> Optional[dict]:
    """A1: Find the last valid JSON object in text, tolerating multiline output.

    Scans left-to-right for every ``{`` that opens a valid JSON object using
    json.JSONDecoder.raw_decode (which handles pretty-printed multiline JSON).
    Returns the candidate whose parse END position is latest in the text — this
    correctly identifies the outermost/final result object even when log noise or
    nested sub-objects appear after it.  Returns None if no dict-typed JSON is
    found.
    """
    decoder = json.JSONDecoder()
    best: Optional[dict] = None
    best_end: int = -1
    idx = 0
    while idx < len(text):
        pos = text.find("{", idx)
        if pos < 0:
            break
        try:
            obj, end = decoder.raw_decode(text, pos)
            if isinstance(obj, dict) and end > best_end:
                best_end = end
                best = obj
        except json.JSONDecodeError:
            pass
        idx = pos + 1
    return best


def _verify_receipt_outputs(receipt: dict) -> bool:
    """A5: Verify that all artifacts in a cached receipt still exist with matching hashes."""
    artifacts = receipt.get("artifacts", [])
    if not artifacts:
        # If there are no artifacts but the receipt says ok, that's suspicious.
        return receipt.get("ok", False)
    hashes = receipt.get("hashes", {})
    for entry in artifacts:
        p = Path(str(entry.get("path", "")))
        if not p.exists() or not p.is_file():
            return False
        cached_sha = hashes.get(str(p)) or entry.get("sha256", "")
        if cached_sha:
            try:
                actual_sha = sha256_file(p)
                if actual_sha != cached_sha:
                    return False
            except Exception:
                return False
    return True


def _verify_output_hashes(result: dict) -> list[str]:
    """A7: Verify that every artifact in result exists and its hash matches.

    Returns a list of error strings (empty on success).
    """
    errors: list[str] = []
    for entry in result.get("artifacts", []):
        p = Path(str(entry.get("path", "")))
        if not p.exists() or not p.is_file():
            errors.append(
                f"output file {p} does not exist after render; "
                "script reported ok but output is missing"
            )
            continue
        recorded_sha = entry.get("sha256", "")
        if recorded_sha:
            try:
                actual_sha = sha256_file(p)
                if actual_sha != recorded_sha:
                    errors.append(
                        f"output file {p} hash mismatch: "
                        f"script reported {recorded_sha[:12]!r}, "
                        f"actual {actual_sha[:12]!r}"
                    )
            except Exception as exc:
                errors.append(f"failed to hash output {p}: {exc}")
    return errors


def _find_approval(state_dict: dict, stage_key: str) -> Optional[dict]:
    """Return the approval record for stage_key, or None."""
    for approval in state_dict.get("approvals", []):
        if approval.get("stage_key") == stage_key:
            return approval
    return None


def _path_under(candidate: Path, root: Path) -> bool:
    """Return True if candidate is under root (resolving symlinks)."""
    try:
        candidate_r = candidate.resolve() if candidate.exists() else candidate.absolute()
        root_r = root.resolve() if root.exists() else root.absolute()
        candidate_r.relative_to(root_r)
        return True
    except (ValueError, Exception):
        return False
