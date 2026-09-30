"""Durable, locked JSON store for the Creator Editing Steward pilot.

Uses only the standard library. All writes are atomic (temp file + fsync +
rename). All state transitions run under an fcntl advisory lock scoped to the
job. Event log is append-only NDJSON with per-job monotonic sequence numbers
and client-supplied `event_id`s for idempotent replay.

Transaction snapshots
---------------------
The combined update of (state.json + events.ndjson) cannot be made atomic
with a single rename.  We approximate it with a write-ahead snapshot:

  1. Before any mutation, write   <job_dir>/.txn-snapshot.json
     containing the current state dict + the event count.
  2. Persist state.json (atomic rename).
  3. Append to events.ndjson (O_APPEND + fsync).
  4. Remove .txn-snapshot.json on success.

On the next open, _recover_if_needed() detects a leftover snapshot and
replays the event log to determine whether state.json is ahead of,
behind, or equal to the event log.  The recovery rule is conservative:
  - If the persisted stage matches the replayed stage → the rename
    succeeded but the snapshot was not cleaned up; remove snapshot and
    continue normally.
  - If the persisted stage does NOT match → the state was partially
    written; restore state from the snapshot and raise StageDrift so the
    caller knows recovery occurred.
"""

from __future__ import annotations

import errno
import fcntl
import hashlib
import json
import os
import stat
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .model import PathViolation, StageDrift


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def atomic_write_bytes(path: Path, data: bytes, *, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".tmp-", dir=str(path.parent))
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        try:
            tmp.unlink(missing_ok=True)
        finally:
            raise


def atomic_write_json(path: Path, obj: Any, *, mode: int = 0o600) -> None:
    data = json.dumps(obj, indent=2, sort_keys=True).encode("utf-8")
    atomic_write_bytes(path, data, mode=mode)


def read_json(path: Path) -> Any:
    with path.open("rb") as fh:
        return json.loads(fh.read().decode("utf-8"))


@contextmanager
def flock(path: Path, *, timeout: float = 10.0) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(path), os.O_RDWR | os.O_CREAT, 0o600)
    deadline = time.monotonic() + timeout
    try:
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError as exc:
                if exc.errno not in (errno.EAGAIN, errno.EACCES):
                    raise
                if time.monotonic() > deadline:
                    raise TimeoutError(f"timed out acquiring lock {path}") from exc
                time.sleep(0.05)
        yield
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def ensure_within(root: Path, candidate: Path) -> Path:
    """Resolve `candidate` and guarantee it stays under `root`.

    Rules:
    - Reject non-normalised traversal (`..` segments) in the candidate.
    - Reject any symlink *inside* the job root whose resolved target escapes the root.
    - Reject candidates whose final resolved path escapes the root.
    Does not require the leaf to exist. System-level symlinks in the ancestry
    of `root` itself (e.g. macOS `/var → /private/var`) are irrelevant because
    they are resolved into `root` before the containment check.
    """
    if any(p == ".." for p in candidate.parts):
        raise PathViolation(f"traversal segment in {candidate}")
    root_resolved = root.resolve(strict=True)
    joined = candidate if candidate.is_absolute() else (root / candidate)

    # Walk components that live *under* root_resolved and reject in-root symlinks
    # whose targets escape the root.
    try:
        rel = joined.resolve().relative_to(root_resolved)
        _ = rel  # containment succeeded so far
    except ValueError:
        pass

    # Component-wise symlink audit for path parts under root.
    accumulator = root_resolved
    try:
        rel_parts = (
            joined.relative_to(root).parts
            if not joined.is_absolute()
            else joined.resolve().relative_to(root_resolved).parts
        )
    except ValueError:
        rel_parts = ()
    for part in rel_parts:
        accumulator = accumulator / part
        if accumulator.is_symlink():
            target = os.readlink(accumulator)
            resolved_target = (accumulator.parent / target).resolve()
            try:
                resolved_target.relative_to(root_resolved)
            except ValueError as exc:
                raise PathViolation(
                    f"symlink {accumulator} escapes job root"
                ) from exc

    # Final containment: resolve the deepest existing ancestor, then append the tail.
    probe = joined
    tail_parts: list[str] = []
    while not probe.exists():
        tail_parts.insert(0, probe.name)
        parent = probe.parent
        if parent == probe:
            break
        probe = parent
    probe_resolved = probe.resolve()
    final_resolved = probe_resolved.joinpath(*tail_parts) if tail_parts else probe_resolved
    try:
        final_resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise PathViolation(f"{candidate} resolves outside job root") from exc
    return joined


class EventLog:
    """Append-only per-job NDJSON event log with dedup by `event_id`."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> list[dict]:
        if not self.path.exists():
            return []
        events: list[dict] = []
        with self.path.open("rb") as fh:
            for raw in fh:
                raw = raw.strip()
                if not raw:
                    continue
                events.append(json.loads(raw.decode("utf-8")))
        return events

    def contains(self, event_id: str) -> bool:
        for ev in self.load():
            if ev.get("event_id") == event_id:
                return True
        return False

    def get(self, event_id: str) -> dict | None:
        """Return the full event record for a given event_id, or None."""
        for ev in self.load():
            if ev.get("event_id") == event_id:
                return ev
        return None

    def append(self, event: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        line = (json.dumps(event, sort_keys=True) + "\n").encode("utf-8")
        # O_APPEND writes on POSIX are atomic for small records.
        fd = os.open(str(self.path), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(fd, line)
            os.fsync(fd)
        finally:
            os.close(fd)

    def next_seq(self) -> int:
        events = self.load()
        return (events[-1]["seq"] + 1) if events else 1

    def count(self) -> int:
        return len(self.load())


# ---------------------------------------------------------------------------
# Transaction snapshot helpers
# ---------------------------------------------------------------------------

def _snapshot_path(job_dir: Path) -> Path:
    return job_dir / ".txn-snapshot.json"


def write_txn_snapshot(job_dir: Path, state_dict: dict, event_count: int) -> None:
    """Write a pre-mutation snapshot of the CURRENT (pre-mutation) state.

    Must be called while holding the job lock and BEFORE any mutation.
    Stores both stage and artifact versions so that same-stage artifact bumps
    (e.g. plan revised while stage stays planned) are also detected on recovery.
    """
    artifact_versions = {
        k: v["version"]
        for k, v in state_dict.get("artifacts", {}).items()
        if isinstance(v, dict) and "version" in v
    }
    snap = {
        "state": state_dict,
        "event_count": event_count,
        "artifact_versions": artifact_versions,
        "written_at": utcnow(),
    }
    atomic_write_json(_snapshot_path(job_dir), snap)


def remove_txn_snapshot(job_dir: Path) -> None:
    """Remove the snapshot after a successful combined write."""
    sp = _snapshot_path(job_dir)
    sp.unlink(missing_ok=True)


def recover_if_needed(
    job_dir: Path,
    state_path: Path,
    events_path: Path,
    replay_fn: "Callable[[list[dict]], str]",
) -> bool:
    """Check for a leftover transaction snapshot and recover if necessary.

    Returns True if recovery was performed (caller should reload state).
    Raises StageDrift if the state could not be reconciled.

    Commit is determined by event_count: if the live event count equals the
    snapped count the event was NOT appended (crash between _save_state and
    _append_event); we restore the pre-mutation snapshot.  If the live count
    is greater the event was appended successfully (crash after _append_event);
    we keep the current state and just clean the snapshot.

    Same-stage artifact-version changes (e.g. plan revised while stage stays
    planned) are detected via the artifact_versions dict in the snapshot.
    """
    sp = _snapshot_path(job_dir)
    if not sp.exists():
        return False

    snap = read_json(sp)
    snapped_state = snap["state"]
    snapped_event_count = snap["event_count"]
    snapped_artifact_versions: dict = snap.get("artifact_versions", {})

    # Load current event log.
    log = EventLog(events_path)
    current_events = log.load()
    current_event_count = len(current_events)
    replayed_stage = replay_fn(current_events)

    # Load current persisted state.
    current_stage = snapped_state["stage"]  # fallback if state.json absent
    current_artifact_versions: dict = {}
    if state_path.exists():
        persisted = read_json(state_path)
        current_stage = persisted.get("stage", snapped_state["stage"])
        current_artifact_versions = {
            k: v["version"]
            for k, v in persisted.get("artifacts", {}).items()
            if isinstance(v, dict) and "version" in v
        }

    # --- Commit determination via event_count ---
    # The snapshot was written BEFORE the mutation.  The sequence is:
    #   1. write_txn_snapshot  (event_count = N)
    #   2. _save_state          ← crash here leaves state mutated, event_count = N
    #   3. _append_event        ← after this event_count = N+1
    #   4. remove_txn_snapshot
    #
    # If live event_count == snapped_event_count: step 3 did not complete.
    #   Restore pre-mutation state from snapshot.
    # If live event_count > snapped_event_count: step 3 completed.
    #   Keep current state; just clean up orphaned snapshot.

    if current_event_count > snapped_event_count:
        # Event was appended; state is ahead of snapshot — consistent.
        sp.unlink(missing_ok=True)
        return False

    # event_count has not advanced: the mutation did not commit.
    # Verify consistency: stage and artifact versions must match snapshot (pre-mutation).
    stage_ok = (current_stage == snapped_state["stage"])
    versions_ok = (current_artifact_versions == snapped_artifact_versions)

    if stage_ok and versions_ok:
        # State.json was NOT overwritten yet (crash before step 2), or was
        # restored to a consistent pre-mutation state.  Just clean snapshot.
        sp.unlink(missing_ok=True)
        return False

    # State was partially written (stage or artifact version differs from
    # snapshot but event was not appended).  Restore pre-mutation snapshot.
    atomic_write_json(state_path, snapped_state)
    sp.unlink(missing_ok=True)
    raise StageDrift(
        f"crash recovery: event_count did not advance (snapped={snapped_event_count} "
        f"live={current_event_count}); persisted stage={current_stage!r} "
        f"!= pre-mutation={snapped_state['stage']!r} or artifact versions diverged; "
        f"state restored from snapshot"
    )


def default_state_root() -> Path:
    override = os.environ.get("CEOS_STATE_ROOT")
    if override:
        return Path(override).expanduser().resolve()
    home = Path(os.environ.get("HOME", "~")).expanduser()
    return home / ".codex" / "editorial" / "creator-editing-os-pilot"


def ensure_state_root(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(root, 0o700)
    except OSError:
        pass
    st = root.stat()
    if stat.S_IMODE(st.st_mode) & 0o077:
        try:
            os.chmod(root, 0o700)
        except OSError:
            pass
    (root / "jobs").mkdir(exist_ok=True)
    (root / "registry").mkdir(exist_ok=True)
    return root


def ensure_job_dir(job_dir: Path) -> None:
    """Create a job directory with mode 700."""
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(job_dir, 0o700)
    except OSError:
        pass
