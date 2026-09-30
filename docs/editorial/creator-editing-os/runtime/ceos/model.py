"""State machine and structural invariants for Creator Editing Steward pilot."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

# Stage sequence exactly per spec.
STAGES = (
    "intake",
    "planned",
    "awaiting_plan_approval",
    "plan_approved",
    "draft_ready",
    "awaiting_draft_approval",
    "draft_approved",
    "finalized",
)

# Legal transitions: {from_stage: {to_stage: required_event_kind}}.
# Each transition is atomic and gated; nothing else is legal.
TRANSITIONS: dict[str, dict[str, str]] = {
    "intake": {"planned": "plan_saved"},
    "planned": {"awaiting_plan_approval": "plan_submitted"},
    "awaiting_plan_approval": {
        "plan_approved": "plan_approved",
        "planned": "feedback_recorded",  # feedback bounces to planned for revision
    },
    "plan_approved": {"draft_ready": "draft_saved"},
    "draft_ready": {"awaiting_draft_approval": "draft_submitted"},
    "awaiting_draft_approval": {
        "draft_approved": "draft_approved",
        "draft_ready": "feedback_recorded",
    },
    "draft_approved": {"finalized": "finalized"},
    "finalized": {},
}

ARTIFACT_STAGES = ("brief", "plan", "draft", "final_evidence")

# Which artifact each stage transition depends on.
STAGE_ARTIFACT_BINDING = {
    "planned": "plan",
    "awaiting_plan_approval": "plan",
    "plan_approved": "plan",
    "draft_ready": "draft",
    "awaiting_draft_approval": "draft",
    "draft_approved": "draft",
    "finalized": "final_evidence",
}


@dataclass(frozen=True)
class Transition:
    src: str
    dst: str
    event_kind: str


def allowed_next(current: str) -> Iterable[Transition]:
    for dst, kind in TRANSITIONS.get(current, {}).items():
        yield Transition(current, dst, kind)


def is_terminal(stage: str) -> bool:
    return not TRANSITIONS.get(stage)


class InvalidTransition(Exception):
    pass


class StageDrift(Exception):
    """Persisted stage does not match event-log replay. State is corrupt."""
    pass


class ArtifactDrift(Exception):
    pass


class PathViolation(Exception):
    pass


class DuplicateEvent(Exception):
    pass


class ForgedApproval(Exception):
    pass


class StaleVersion(Exception):
    pass


class UnknownJob(Exception):
    pass


class SourceDrift(Exception):
    """A registered source file has changed since it was fingerprinted."""
    pass


class FinalEvidenceInvalid(Exception):
    """final_evidence must contain real output_path, sha256, and probe metadata."""
    pass
