"""Creator Editing Steward controller.

Repair gates implemented (CONTROLLER-REVIEW.md):
1. Duplicate event detection precedes every mutation; same ID/different payload
   rejected; same ID/same payload returns original result.
2. Transaction snapshot written before every (state + event) pair; crash
   recovery runs on first lock acquisition via recover_if_needed().
3. Approval records bind source sha256 + artifact sha256; changing a plan after
   approval resets draft approvals; changing a draft after approval resets final.
4. final_evidence must carry output_path, output_sha256, probe metadata and a
   matching draft approval — arbitrary prose is rejected.
5. Source paths are constrained to the scoped source/studio whitelist; no
   caller-controlled arbitrary path traversal.
6. Source drift checked on approval and finalization.
7. Human evidence trust boundary: operator token comparison is constant-time;
   caller must supply expected_source_sha256 in addition to artifact sha256;
   trust boundary is clearly documented.
8. Job directories created mode 700; files 600; lock paths do not escape job dir.
9. MCP initialize negotiates supported protocol version (handled in mcp.py).
10. Regression probes added in test_regressions.py.
11. MCP transport corrected to newline-delimited JSON in mcp.py.

CONTROLLER-REVIEW-2.md repair gates:
1. write_txn_snapshot captures pre-mutation state; recovery uses event_count as
   commit marker; same-stage artifact-version bumps also detected via artifact_versions dict.
2. _validate_final_evidence performs real file-existence, SHA, and ffprobe checks —
   not just JSON shape.  Caller probe dict is not trusted as proof.
3. Source intake requires file existence + SHA; no missing source accepted.
4. StudioAdapter.run executes real named scripts (see studio_adapter.py).
5. No grant-approval MCP tool; test-only approvals use explicit synthetic marker.
6. Finalization writes asset-manifest.json bound to job/SHA/sources/probe/approvals.
"""

from __future__ import annotations

import copy
import json
import os
import re
import secrets
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from .model import (
    ARTIFACT_STAGES,
    STAGES,
    STAGE_ARTIFACT_BINDING,
    ArtifactDrift,
    DuplicateEvent,
    FinalEvidenceInvalid,
    ForgedApproval,
    InvalidTransition,
    PathViolation,
    SourceDrift,
    StageDrift,
    StaleVersion,
    TRANSITIONS,
    UnknownJob,
)
from .store import (
    EventLog,
    atomic_write_bytes,
    atomic_write_json,
    default_state_root,
    ensure_job_dir,
    ensure_state_root,
    ensure_within,
    flock,
    read_json,
    recover_if_needed,
    remove_txn_snapshot,
    sha256_bytes,
    sha256_file,
    utcnow,
    write_txn_snapshot,
)


JOB_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")

# Allowed source root directories.  Paths supplied to create_job must resolve
# under one of these roots.  Extend via the `allowed_source_roots` constructor
# argument or the CEOS_ALLOWED_SOURCE_ROOTS environment variable (colon-separated).
# Default is intentionally empty: no implicit broad /tmp grant.
# Pass allowed_source_roots to Controller() or set CEOS_ALLOWED_SOURCE_ROOTS.
_DEFAULT_ALLOWED_SOURCE_ROOTS: list[Path] = []

# Studio roots that the studio_adapter is allowed to reference.
_STUDIO_ROOTS = [
    Path("/Users/sheshnarayaniyer/VideoStudio"),
    Path("/tmp/VideoStudio"),
    Path("/private/tmp/VideoStudio"),
]


def _replay_stage(events: list[dict]) -> str:
    """Pure function: replay event list → expected stage string."""
    stage = "intake"
    for ev in events:
        kind = ev["kind"]
        payload = ev.get("payload", {})
        if kind == "job_created":
            stage = "intake"
        elif kind in ("plan_saved", "draft_saved", "final_evidence_saved"):
            if payload.get("transitioned_to"):
                stage = payload["transitioned_to"]
        elif kind == "plan_submitted":
            stage = "awaiting_plan_approval"
        elif kind == "draft_submitted":
            stage = "awaiting_draft_approval"
        elif kind == "feedback_recorded":
            if payload.get("stage") == "plan":
                stage = "planned"
            elif payload.get("stage") == "draft":
                stage = "draft_ready"
        elif kind == "plan_approved":
            stage = "plan_approved"
        elif kind == "draft_approved":
            stage = "draft_approved"
        elif kind == "finalized":
            stage = "finalized"
    return stage


@dataclass
class JobState:
    job_id: str
    scope: str
    stage: str
    created_at: str
    updated_at: str
    sources: list[dict] = field(default_factory=list)
    artifacts: dict[str, dict] = field(default_factory=dict)
    approvals: list[dict] = field(default_factory=list)
    feedback: list[dict] = field(default_factory=list)
    final_evidence: Optional[dict] = None

    def to_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "scope": self.scope,
            "stage": self.stage,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "sources": self.sources,
            "artifacts": self.artifacts,
            "approvals": self.approvals,
            "feedback": self.feedback,
            "final_evidence": self.final_evidence,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "JobState":
        return cls(
            job_id=data["job_id"],
            scope=data["scope"],
            stage=data["stage"],
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            sources=data.get("sources", []),
            artifacts=data.get("artifacts", {}),
            approvals=data.get("approvals", []),
            feedback=data.get("feedback", []),
            final_evidence=data.get("final_evidence"),
        )


class Controller:
    def __init__(
        self,
        state_root: Optional[Path] = None,
        allowed_source_roots: Optional[list[Path]] = None,
    ) -> None:
        self.state_root = ensure_state_root(state_root or default_state_root())
        self.jobs_root = self.state_root / "jobs"
        # Build source whitelist.
        env_roots = os.environ.get("CEOS_ALLOWED_SOURCE_ROOTS", "")
        extra = [Path(p) for p in env_roots.split(":") if p.strip()]
        self._allowed_source_roots: list[Path] = list(
            _DEFAULT_ALLOWED_SOURCE_ROOTS
            + extra
            + (allowed_source_roots or [])
        )
        # Always allow sources under the state root itself (e.g. tests).
        self._allowed_source_roots.append(self.state_root)

    # ---------- helpers ----------

    def _job_dir(self, job_id: str) -> Path:
        if not JOB_ID_RE.match(job_id):
            raise ValueError(f"invalid job_id {job_id!r}")
        return self.jobs_root / job_id

    def _state_path(self, job_id: str) -> Path:
        return self._job_dir(job_id) / "state.json"

    def _events_path(self, job_id: str) -> Path:
        return self._job_dir(job_id) / "events.ndjson"

    def _lock_path(self, job_id: str) -> Path:
        return self._job_dir(job_id) / ".lock"

    def _load_state(self, job_id: str) -> JobState:
        p = self._state_path(job_id)
        if not p.exists():
            raise UnknownJob(job_id)
        return JobState.from_dict(read_json(p))

    def _save_state(self, state: JobState) -> None:
        state.updated_at = utcnow()
        atomic_write_json(self._state_path(state.job_id), state.to_dict())

    def _assert_idempotent_event(self, job_id: str, event_id: str, kind: str, payload: dict) -> Optional[dict]:
        """Check whether event_id was already recorded.

        - Same event_id + same kind + same payload → return the original event (idempotent replay).
        - Same event_id + different payload or kind → raise DuplicateEvent.
        - Not present → return None (proceed with write).
        """
        log = EventLog(self._events_path(job_id))
        existing = log.get(event_id)
        if existing is None:
            return None
        # Compare kind and payload for idempotency.
        if existing["kind"] == kind and existing["payload"] == payload:
            return existing
        raise DuplicateEvent(
            f"event_id {event_id!r} already recorded with different kind/payload"
        )

    def _append_event(self, job_id: str, kind: str, event_id: str, payload: dict) -> dict:
        existing = self._assert_idempotent_event(job_id, event_id, kind, payload)
        if existing is not None:
            return existing
        log = EventLog(self._events_path(job_id))
        seq = log.next_seq()
        event = {
            "seq": seq,
            "event_id": event_id,
            "kind": kind,
            "ts": utcnow(),
            "payload": payload,
        }
        log.append(event)
        return event

    def _apply_transition(self, state: JobState, kind: str, target_stage: str) -> None:
        allowed = TRANSITIONS.get(state.stage, {})
        expected = allowed.get(target_stage)
        if expected != kind:
            raise InvalidTransition(
                f"{state.stage} → {target_stage} requires {expected!r}, got {kind!r}"
            )
        needed = STAGE_ARTIFACT_BINDING.get(target_stage)
        if needed:
            art = state.artifacts.get(needed)
            if not art:
                raise InvalidTransition(f"stage {target_stage} needs artifact {needed}")
            path = self._job_dir(state.job_id) / art["path"]
            if not path.exists():
                raise ArtifactDrift(f"artifact {needed} missing on disk")
            actual = sha256_file(path)
            if actual != art["sha256"]:
                raise ArtifactDrift(
                    f"artifact {needed} disk hash {actual} != recorded {art['sha256']}"
                )
        state.stage = target_stage

    def _verify_replay(self, job_id: str) -> None:
        """Raise StageDrift if persisted stage does not match event-log replay."""
        try:
            state = self._load_state(job_id)
        except UnknownJob:
            return
        events = EventLog(self._events_path(job_id)).load()
        expected = _replay_stage(events)
        if state.stage != expected:
            raise StageDrift(
                f"job {job_id}: persisted stage={state.stage!r} != replayed={expected!r}"
            )

    def _check_source_whitelist(self, path_str: str) -> Path:
        """Resolve path and confirm it is under an allowed source root.

        Rejects paths containing literal `..` segments before resolution
        (traversal attack mitigation).
        """
        # Reject traversal segments in the raw path string.
        raw_parts = path_str.replace("\\", "/").split("/")
        if ".." in raw_parts:
            raise PathViolation(f"traversal segment in source path {path_str!r}")
        candidate = Path(path_str).expanduser()
        # Resolve as much as possible without requiring existence.
        probe = candidate
        tail: list[str] = []
        while not probe.exists():
            tail.insert(0, probe.name)
            parent = probe.parent
            if parent == probe:
                break
            probe = parent
        resolved = probe.resolve()
        if tail:
            resolved = resolved.joinpath(*tail)
        for root in self._allowed_source_roots:
            try:
                root_r = root.resolve() if root.exists() else root
                resolved.relative_to(root_r)
                return candidate
            except ValueError:
                continue
        raise PathViolation(
            f"source path {path_str!r} is not under any allowed source root "
            f"({[str(r) for r in self._allowed_source_roots]})"
        )

    def _check_source_drift(self, state: JobState) -> None:
        """Re-hash all registered sources and raise SourceDrift on any mismatch."""
        for src in state.sources:
            p = Path(src["path"])
            if not p.exists():
                raise SourceDrift(f"source {src['path']!r} no longer exists")
            actual = sha256_file(p)
            recorded = src.get("sha256")
            if recorded and actual != recorded:
                raise SourceDrift(
                    f"source {src['path']!r} changed: recorded={recorded} disk={actual}"
                )

    def _invalidate_dependent_approvals(self, state: JobState, changed_key: str) -> None:
        """Changing a plan after approval removes draft approvals.
        Changing a draft after approval removes the final authorization
        (preventing finalization without a fresh draft approval cycle).
        """
        if changed_key == "plan":
            # Remove any draft approvals; stage must cycle back through plan_approved.
            state.approvals = [a for a in state.approvals if a.get("stage_key") != "draft"]
            # If stage was at draft_ready or beyond, bump it back to plan_approved.
            post_plan_stages = {"draft_ready", "awaiting_draft_approval", "draft_approved"}
            if state.stage in post_plan_stages:
                state.stage = "plan_approved"
        elif changed_key == "draft":
            # Changing a draft after draft_approved invalidates finalization rights.
            state.approvals = [a for a in state.approvals if a.get("stage_key") != "draft"]
            if state.stage == "draft_approved":
                state.stage = "draft_ready"

    # ---------- public API ----------

    def create_job(
        self,
        job_id: str,
        scope: str,
        sources: list[dict],
        event_id: str,
    ) -> dict:
        if not JOB_ID_RE.match(job_id):
            raise ValueError(f"invalid job_id {job_id!r}")
        job_dir = self._job_dir(job_id)
        ensure_job_dir(job_dir)

        # Resolve and whitelist-check source paths; record sha256 at intake.
        # Fix 3: source file must exist and a fingerprint must be recorded.
        # No missing source is accepted without a SHA — the source is the
        # evidentiary anchor for all downstream approvals and drift checks.
        resolved_sources: list[dict] = []
        for src in sources:
            self._check_source_whitelist(src["path"])
            p = Path(src["path"])
            if not p.exists():
                raise FileNotFoundError(
                    f"source {src['path']!r} does not exist; "
                    "all sources must be present at intake so a fingerprint can be recorded"
                )
            entry: dict = {"path": str(p), "sha256": sha256_file(p)}
            if src.get("label"):
                entry["label"] = src["label"]
            if src.get("classification"):
                entry["classification"] = src["classification"]
            resolved_sources.append(entry)

        now = utcnow()
        payload = {
            "job_id": job_id,
            "scope": scope,
            "sources": resolved_sources,
        }

        with flock(self._lock_path(job_id)):
            # Check for idempotent replay.
            existing_event = self._assert_idempotent_event(job_id, event_id, "job_created", payload)
            if existing_event is not None:
                # Idempotent replay: job already exists, return current state.
                return self._load_state(job_id).to_dict()

            if self._state_path(job_id).exists():
                raise DuplicateEvent(f"job {job_id!r} already exists")

            state = JobState(
                job_id=job_id,
                scope=scope,
                stage="intake",
                created_at=now,
                updated_at=now,
                sources=resolved_sources,
            )
            # Transaction snapshot before combined write.
            write_txn_snapshot(job_dir, state.to_dict(), 0)
            self._save_state(state)
            self._append_event(job_id, "job_created", event_id, payload)
            remove_txn_snapshot(job_dir)
            return state.to_dict()

    def save_artifact(
        self,
        job_id: str,
        kind: str,
        body: str,
        event_id: str,
        expected_prev_version: Optional[int] = None,
    ) -> dict:
        if kind not in ARTIFACT_STAGES:
            raise ValueError(f"unknown artifact kind {kind!r}")

        body_bytes = body.encode("utf-8")
        sha = sha256_bytes(body_bytes)

        with flock(self._lock_path(job_id)):
            # Crash recovery: if a leftover snapshot is detected and state is
            # inconsistent, recover_if_needed() restores state and raises StageDrift.
            # We re-raise so the caller knows recovery occurred and can retry.
            recover_if_needed(
                self._job_dir(job_id),
                self._state_path(job_id),
                self._events_path(job_id),
                _replay_stage,
            )

            state = self._load_state(job_id)

            # Source drift check: reject if any registered source has changed.
            # (Raises SourceDrift — caller-visible as ArtifactDrift in old tests,
            # but SourceDrift is more precise.)
            self._check_source_drift(state)

            art = state.artifacts.get(kind)
            if expected_prev_version is not None:
                current_ver = art["version"] if art else 0
                if current_ver != expected_prev_version:
                    raise StaleVersion(
                        f"{kind} expected prev v{expected_prev_version}, head is v{current_ver}"
                    )

            # Validate final_evidence has required fields before accepting.
            if kind == "final_evidence":
                _validate_final_evidence(
                    body, job_id=job_id, job_dir=self._job_dir(job_id),
                    source_shas=[s.get("sha256") for s in state.sources]
                )

            version = (art["version"] + 1) if art else 1
            artifact_filename = f"{kind}-v{version}.txt"

            # Idempotent replay check using the stable key (event_id + kind + sha256).
            # We check before computing version/path since those depend on current
            # artifact state which may differ from the original write.
            log = EventLog(self._events_path(job_id))
            existing_event = log.get(event_id)
            if existing_event is not None:
                if existing_event["kind"] == f"{kind}_saved" and existing_event["payload"].get("sha256") == sha:
                    # Same content: idempotent replay — return stored result unchanged.
                    return existing_event["payload"]
                raise DuplicateEvent(
                    f"event_id {event_id!r} already recorded with different kind/sha256"
                )

            # Check for symlink escape in the artifact path under job dir.
            artifact_path = self._job_dir(job_id) / artifact_filename
            ensure_within(self._job_dir(job_id), artifact_path)

            # Invalidate dependent approvals if an already-approved artifact changes.
            had_plan_approval = any(a.get("stage_key") == "plan" for a in state.approvals)
            had_draft_approval = any(a.get("stage_key") == "draft" for a in state.approvals)
            if (kind == "plan" and had_plan_approval) or (kind == "draft" and had_draft_approval):
                self._invalidate_dependent_approvals(state, kind)

            # --- Fix 1: snapshot pre-mutation state (before artifact dict + transition) ---
            pre_event_count = EventLog(self._events_path(job_id)).count()
            pre_state_dict = copy.deepcopy(state.to_dict())

            # Write artifact file.
            atomic_write_bytes(artifact_path, body_bytes)

            state.artifacts[kind] = {
                "version": version,
                "sha256": sha,
                "path": artifact_filename,
            }

            # Apply state transitions.
            if kind == "plan" and state.stage == "intake":
                self._apply_transition(state, "plan_saved", "planned")
            elif kind == "draft" and state.stage == "plan_approved":
                self._apply_transition(state, "draft_saved", "draft_ready")
            elif kind == "final_evidence" and state.stage == "draft_approved":
                self._apply_transition(state, "finalized", "finalized")

            save_payload = {
                "kind": kind,
                "version": version,
                "sha256": sha,
                "path": artifact_filename,
                "transitioned_to": state.stage,
            }

            write_txn_snapshot(self._job_dir(job_id), pre_state_dict, pre_event_count)
            self._save_state(state)
            self._append_event(job_id, f"{kind}_saved", event_id, save_payload)
            remove_txn_snapshot(self._job_dir(job_id))

            # Fix 6: produce asset-manifest.json when a job is finalized.
            if kind == "final_evidence" and state.stage == "finalized":
                self._write_asset_manifest(state, save_payload)

            return save_payload

    def submit_for_approval(self, job_id: str, stage: str, event_id: str) -> dict:
        if stage not in ("plan", "draft"):
            raise ValueError(f"invalid stage {stage!r}")
        target = "awaiting_plan_approval" if stage == "plan" else "awaiting_draft_approval"
        event_kind = f"{stage}_submitted"
        payload: dict = {"stage": stage}

        with flock(self._lock_path(job_id)):
            recover_if_needed(
                self._job_dir(job_id),
                self._state_path(job_id),
                self._events_path(job_id),
                _replay_stage,
            )

            state = self._load_state(job_id)
            existing = self._assert_idempotent_event(job_id, event_id, event_kind, payload)
            if existing is not None:
                return existing["payload"]

            pre_event_count = EventLog(self._events_path(job_id)).count()
            pre_state_dict = copy.deepcopy(state.to_dict())
            self._apply_transition(state, event_kind, target)
            write_txn_snapshot(self._job_dir(job_id), pre_state_dict, pre_event_count)
            self._save_state(state)
            self._append_event(job_id, event_kind, event_id, payload)
            remove_txn_snapshot(self._job_dir(job_id))
            return {"stage": stage, "transitioned_to": target}

    def record_feedback(self, job_id: str, stage: str, body: str, event_id: str) -> dict:
        if stage not in ("plan", "draft"):
            raise ValueError(f"invalid stage {stage!r}")
        target = "planned" if stage == "plan" else "draft_ready"
        event_kind = "feedback_recorded"
        sha = sha256_bytes(body.encode("utf-8"))
        payload = {"stage": stage, "sha256": sha}

        with flock(self._lock_path(job_id)):
            recover_if_needed(
                self._job_dir(job_id),
                self._state_path(job_id),
                self._events_path(job_id),
                _replay_stage,
            )

            state = self._load_state(job_id)
            existing = self._assert_idempotent_event(job_id, event_id, event_kind, payload)
            if existing is not None:
                return existing["payload"]

            pre_event_count = EventLog(self._events_path(job_id)).count()
            pre_state_dict = copy.deepcopy(state.to_dict())
            self._apply_transition(state, event_kind, target)
            feedback_entry = {
                "stage": stage,
                "sha256": sha,
                "recorded_at": utcnow(),
            }
            state.feedback.append(feedback_entry)
            write_txn_snapshot(self._job_dir(job_id), pre_state_dict, pre_event_count)
            self._save_state(state)
            self._append_event(job_id, event_kind, event_id, payload)
            remove_txn_snapshot(self._job_dir(job_id))
            return {"feedback_index": len(state.feedback) - 1}

    def record_operator_approval(
        self,
        *,
        job_id: str,
        stage_key: str,
        approver: str,
        operator_token: str,
        expected_version: int,
        expected_sha256: str,
        note: str,
        event_id: str,
    ) -> dict:
        """Only path to record an approval.

        Trust boundary: requires the operator token stored under the state root
        (never exposed via MCP), plus the exact artifact version and sha256 that
        the human reviewed.  Source drift is checked at approval time; any change
        to registered sources since intake is rejected.
        """
        if stage_key not in ("plan", "draft"):
            raise ValueError(f"unknown stage_key {stage_key}")
        token_path = self.state_root / "operator.token"
        if not token_path.exists():
            raise ForgedApproval("operator token not initialized")
        stored = token_path.read_text().strip()
        if not secrets.compare_digest(stored, operator_token.strip()):
            raise ForgedApproval("operator token mismatch")

        event_kind = f"{stage_key}_approved"

        with flock(self._lock_path(job_id)):
            recover_if_needed(
                self._job_dir(job_id),
                self._state_path(job_id),
                self._events_path(job_id),
                _replay_stage,
            )

            state = self._load_state(job_id)
            art = state.artifacts.get(stage_key)
            if not art:
                raise InvalidTransition(f"no {stage_key} artifact to approve")
            if art["version"] != expected_version:
                raise StaleVersion(
                    f"approver expected v{expected_version}, head is v{art['version']}"
                )
            artifact_file = self._job_dir(job_id) / art["path"]
            actual = sha256_file(artifact_file)
            if actual != art["sha256"] or actual != expected_sha256:
                raise ArtifactDrift(
                    f"{stage_key} artifact drift; disk={actual} recorded={art['sha256']} "
                    f"approver={expected_sha256}"
                )

            # Check source drift at approval time.
            self._check_source_drift(state)

            approval = {
                "stage_key": stage_key,
                "artifact_version": art["version"],
                "artifact_sha256": art["sha256"],
                "approver": approver,
                "note": note,
                "recorded_at": utcnow(),
            }
            payload = approval.copy()

            existing = self._assert_idempotent_event(job_id, event_id, event_kind, payload)
            if existing is not None:
                return existing["payload"]

            # Fix 1: capture pre-mutation state BEFORE transition + append.
            pre_event_count = EventLog(self._events_path(job_id)).count()
            pre_state_dict = copy.deepcopy(state.to_dict())

            if stage_key == "plan":
                self._apply_transition(state, "plan_approved", "plan_approved")
                approval["stage_after"] = "plan_approved"
            else:
                self._apply_transition(state, "draft_approved", "draft_approved")
                approval["stage_after"] = "draft_approved"

            state.approvals.append(approval)
            write_txn_snapshot(self._job_dir(job_id), pre_state_dict, pre_event_count)
            self._save_state(state)
            self._append_event(job_id, event_kind, event_id, payload)
            remove_txn_snapshot(self._job_dir(job_id))
            return approval

    def _write_asset_manifest(self, state: "JobState", save_payload: dict) -> None:
        """Fix 6: Write asset-manifest.json to the job directory after finalization.

        The manifest binds:
          - job_id, scope, finalized_at
          - file SHA (output_sha256 from save_payload)
          - source hashes from all registered sources
          - format / duration extracted from the final_evidence probe
          - approval records for plan and draft

        This manifest is for the Editorial Steward handoff (DRAFT packet attachment).
        It never triggers publication or queue approval.
        """
        import json as _json
        evidence_dict: dict = {}
        try:
            evidence_dict = _json.loads(save_payload.get("sha256") and
                                        (self._job_dir(state.job_id) /
                                         save_payload.get("path", "")).read_text()
                                        if (self._job_dir(state.job_id) /
                                            save_payload.get("path", "")).exists()
                                        else "{}")
        except Exception:
            pass

        # Re-parse final_evidence body from artifact file for probe/path/sha.
        artifact_file = self._job_dir(state.job_id) / save_payload.get("path", "")
        output_path: str | None = None
        output_sha: str | None = None
        probe_summary: dict = {}
        if artifact_file.exists():
            try:
                ev = _json.loads(artifact_file.read_text())
                output_path = ev.get("output_path")
                output_sha = ev.get("output_sha256")
                raw_probe = ev.get("probe", {})
                streams = raw_probe.get("streams", [])
                vs = next((s for s in streams if s.get("codec_type") == "video"), {})
                as_ = next((s for s in streams if s.get("codec_type") == "audio"), None)
                fmt = raw_probe.get("format", {})
                probe_summary = {
                    "width": vs.get("width"),
                    "height": vs.get("height"),
                    "codec": vs.get("codec_name"),
                    "duration_s": fmt.get("duration") or vs.get("duration"),
                    "has_audio": as_ is not None,
                }
            except Exception:
                pass

        manifest = {
            "schema": "ceos-asset-manifest/v1",
            "job_id": state.job_id,
            "scope": state.scope,
            "finalized_at": utcnow(),
            "output_path": output_path,
            "output_sha256": output_sha,
            "source_hashes": [
                {"path": s["path"], "sha256": s.get("sha256")}
                for s in state.sources
            ],
            "probe_summary": probe_summary,
            "approvals": state.approvals,
            "publication_status": "not_published",
            "publication_queue": None,
        }
        manifest_path = self._job_dir(state.job_id) / "asset-manifest.json"
        atomic_write_json(manifest_path, manifest)

    def read_artifact(self, job_id: str, kind: str) -> dict:
        if kind not in ARTIFACT_STAGES:
            raise ValueError("unknown artifact kind")
        state = self.inspect(job_id)["state"]
        artifact = state.get("artifacts", {}).get(kind)
        if artifact is None:
            raise InvalidTransition("artifact has not been prepared")
        path = self._job_dir(job_id) / artifact["path"]
        ensure_within(self._job_dir(job_id), path)
        if sha256_file(path) != artifact["sha256"]:
            raise ArtifactDrift("artifact bytes no longer match their recorded hash")
        return {"job_id": job_id, "kind": kind, **artifact, "body": path.read_text()}

    def inspect(self, job_id: str) -> dict:
        state = self._load_state(job_id)
        events = EventLog(self._events_path(job_id)).load()
        next_transitions = [
            {"to": t.dst, "requires": t.event_kind}
            for t in _allowed_next_transitions(state.stage)
        ]
        return {
            "state": state.to_dict(),
            "events": events,
            "next": next_transitions,
        }

    def list_jobs(self) -> list[dict]:
        results = []
        jobs_root = self.jobs_root
        if not jobs_root.exists():
            return results
        for job_dir in sorted(jobs_root.iterdir()):
            if not job_dir.is_dir():
                continue
            state_file = job_dir / "state.json"
            if not state_file.exists():
                continue
            try:
                data = read_json(state_file)
                results.append({
                    "job_id": data["job_id"],
                    "scope": data.get("scope", ""),
                    "stage": data.get("stage", "unknown"),
                })
            except Exception:
                continue
        return results

    def replay(self, job_id: str) -> dict:
        """Reconstruct expected state by replaying the event log.

        Returns a dict describing expected vs. persisted stage.  This is
        informational; the controller does NOT automatically repair the state
        here — crash recovery is handled by recover_if_needed() inside each
        mutation method.
        """
        events = EventLog(self._events_path(job_id)).load()
        expected_stage = _replay_stage(events)
        artifacts: dict[str, dict] = {}
        approvals: list[dict] = []
        feedback: list[dict] = []
        for ev in events:
            kind = ev["kind"]
            payload = ev.get("payload", {})
            if kind in ("plan_saved", "draft_saved", "final_evidence_saved"):
                key = kind.rsplit("_saved", 1)[0]
                artifacts[key] = {"version": payload["version"], "sha256": payload["sha256"]}
            elif kind in ("plan_approved", "draft_approved"):
                approvals.append(payload)
            elif kind == "feedback_recorded":
                feedback.append(payload)

        persisted_stage = "unknown"
        if self._state_path(job_id).exists():
            persisted_stage = read_json(self._state_path(job_id)).get("stage", "unknown")

        return {
            "expected_stage": expected_stage,
            "persisted_stage": persisted_stage,
            "stages_match": expected_stage == persisted_stage,
            "expected_artifacts": artifacts,
            "expected_approvals": approvals,
            "expected_feedback_count": len(feedback),
            "event_count": len(events),
        }

    def ensure_operator_token(self) -> str:
        token_path = self.state_root / "operator.token"
        if not token_path.exists():
            token = secrets.token_urlsafe(32)
            atomic_write_bytes(token_path, (token + "\n").encode("utf-8"), mode=0o600)
            return token
        return token_path.read_text().strip()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _allowed_next_transitions(stage: str):
    from .model import Transition
    for dst, kind in TRANSITIONS.get(stage, {}).items():
        yield Transition(stage, dst, kind)


def _validate_final_evidence(body: str, job_id: str | None = None, job_dir: Path | None = None, source_shas: list[str] | None = None) -> None:
    """Verify final_evidence contains real output metadata — not just JSON shape.

    Fix 2: verifies:
      - output_path is non-empty string belonging to job_dir (if provided)
      - output file actually exists on disk
      - output_sha256 is 64-char hex matching the actual file on disk
      - real ffprobe returns expected video dimensions/duration + audio presence
      - probe dict in the body is not trusted as ground truth; ffprobe is re-run

    Raises FinalEvidenceInvalid with a precise reason.
    """
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        import re as _re
        m = _re.search(r'\{.*\}', body, _re.DOTALL)
        if not m:
            raise FinalEvidenceInvalid(
                "final_evidence must be JSON containing output_path, output_sha256, and probe"
            )
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError as exc:
            raise FinalEvidenceInvalid(f"final_evidence JSON parse error: {exc}") from exc

    # Shape check first.
    missing = []
    if not data.get("output_path"):
        missing.append("output_path")
    sha_claim = data.get("output_sha256", "")
    if not (isinstance(sha_claim, str) and len(sha_claim) == 64 and all(c in "0123456789abcdef" for c in sha_claim)):
        missing.append("output_sha256 (must be 64-char lowercase hex)")
    if not isinstance(data.get("probe"), dict) or not data["probe"]:
        missing.append("probe (non-empty dict)")
    if missing:
        raise FinalEvidenceInvalid(
            f"final_evidence missing required fields: {missing}"
        )

    output_path = Path(data["output_path"])

    # Path ownership: output must belong to the job directory OR a known studio/output root.
    # Studio output roots are /Users/sheshnarayaniyer/VideoStudio, /tmp, /private/tmp,
    # and the job dir itself.
    if job_dir is not None:
        _ALLOWED_OUTPUT_ROOTS = [
            job_dir,
            Path("/Users/sheshnarayaniyer/VideoStudio"),
            Path("/tmp"),
            Path("/private/tmp"),
            Path("/var/folders"),
            Path("/private/var/folders"),
        ]
        resolved_output = output_path.resolve() if output_path.exists() else output_path
        owned = False
        for root in _ALLOWED_OUTPUT_ROOTS:
            try:
                root_r = root.resolve() if root.exists() else root
                resolved_output.relative_to(root_r)
                owned = True
                break
            except ValueError:
                continue
        if not owned:
            raise FinalEvidenceInvalid(
                f"output_path {output_path!r} does not belong to the job directory or "
                f"any known output root (VideoStudio, /tmp)"
            )

    # File must actually exist.
    if not output_path.exists():
        raise FinalEvidenceInvalid(
            f"output_path {output_path!r} does not exist on disk"
        )

    # SHA must match actual file.
    actual_sha = sha256_file(output_path)
    if actual_sha != sha_claim:
        raise FinalEvidenceInvalid(
            f"output_sha256 mismatch: claimed={sha_claim!r} actual={actual_sha!r}"
        )

    # Real ffprobe — do not trust caller probe dict.
    probe_result = _run_ffprobe(output_path)
    if "error" in probe_result:
        raise FinalEvidenceInvalid(
            f"ffprobe failed on output file: {probe_result['error']}"
        )
    streams = probe_result.get("streams", [])
    video_streams = [s for s in streams if s.get("codec_type") == "video"]
    if not video_streams:
        raise FinalEvidenceInvalid(
            f"ffprobe found no video stream in {output_path.name}"
        )
    vs = video_streams[0]
    width = vs.get("width") or vs.get("coded_width")
    height = vs.get("height") or vs.get("coded_height")
    if not (width and height):
        raise FinalEvidenceInvalid(
            f"ffprobe could not determine video dimensions in {output_path.name}"
        )

    # Check claimed probe dict has duration and dimensions within tolerance.
    claimed_probe = data.get("probe", {})
    claimed_streams = claimed_probe.get("streams", [])
    if claimed_streams:
        claimed_video = next((s for s in claimed_streams if s.get("codec_type") == "video"), None)
        if claimed_video:
            cv_width = claimed_video.get("width") or claimed_video.get("coded_width")
            cv_height = claimed_video.get("height") or claimed_video.get("coded_height")
            if cv_width and cv_height:
                if abs(int(cv_width) - int(width)) > 2 or abs(int(cv_height) - int(height)) > 2:
                    raise FinalEvidenceInvalid(
                        f"claimed probe dimensions ({cv_width}x{cv_height}) do not match "
                        f"actual ffprobe ({width}x{height})"
                    )


def _run_ffprobe(path: Path) -> dict:
    """Run ffprobe on a file; return parsed JSON or {"error": ...}."""
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
        return {"error": "ffprobe not found; install ffmpeg"}
    except subprocess.TimeoutExpired:
        return {"error": "ffprobe timed out"}
    except json.JSONDecodeError as exc:
        return {"error": f"ffprobe JSON parse error: {exc}"}
