"""Creator Editing Steward CLI.

Two entry points:
- `ceos` (author/steward commands): create, inspect, save-artifact, submit, feedback, replay, list.
- `ceos-operator` (human-only approval channel): approve. Approvals require reading the operator
  token from the state root and typing "APPROVE" on the confirmation prompt (or `--yes` for
  scripted operator wrappers with the token in place).
"""

from __future__ import annotations

import argparse
import getpass
import json
import sys
import uuid
from pathlib import Path
from typing import Optional

from .controller import Controller
from .model import (
    ArtifactDrift,
    DuplicateEvent,
    ForgedApproval,
    InvalidTransition,
    PathViolation,
    StaleVersion,
    UnknownJob,
)


def _controller(args) -> Controller:
    root = Path(args.state_root).expanduser() if args.state_root else None
    return Controller(root)


def _print(obj) -> None:
    print(json.dumps(obj, indent=2, sort_keys=True))


def _add_common(p: argparse.ArgumentParser) -> None:
    p.add_argument("--state-root", default=None, help="Override state root (defaults to CEOS_STATE_ROOT or ~/.codex/editorial/creator-editing-os-pilot)")


def _wrap_errors(fn):
    def inner(args):
        try:
            return fn(args)
        except (InvalidTransition, ArtifactDrift, PathViolation, StaleVersion,
                DuplicateEvent, ForgedApproval, UnknownJob, ValueError, FileNotFoundError) as exc:
            print(json.dumps({"error": type(exc).__name__, "message": str(exc)}, indent=2))
            return 2
    return inner


@_wrap_errors
def cmd_create(args):
    ctl = _controller(args)
    sources = []
    for spec in args.source or []:
        # syntax: path[::label][::classification]
        parts = spec.split("::")
        entry = {"path": parts[0]}
        if len(parts) > 1:
            entry["label"] = parts[1]
        if len(parts) > 2:
            entry["classification"] = parts[2]
        sources.append(entry)
    event_id = args.event_id or f"create-{uuid.uuid4()}"
    result = ctl.create_job(args.job_id, args.scope, sources, event_id)
    _print(result)
    return 0


@_wrap_errors
def cmd_inspect(args):
    ctl = _controller(args)
    _print(ctl.inspect(args.job_id))
    return 0


@_wrap_errors
def cmd_list(args):
    ctl = _controller(args)
    _print(ctl.list_jobs())
    return 0


@_wrap_errors
def cmd_save_artifact(args):
    ctl = _controller(args)
    body_path = Path(args.body_file).expanduser()
    body = body_path.read_text(encoding="utf-8")
    event_id = args.event_id or f"save-{args.kind}-{uuid.uuid4()}"
    result = ctl.save_artifact(
        args.job_id, args.kind, body, event_id,
        expected_prev_version=args.expected_prev_version,
    )
    _print(result)
    return 0


@_wrap_errors
def cmd_submit(args):
    ctl = _controller(args)
    event_id = args.event_id or f"submit-{args.stage}-{uuid.uuid4()}"
    _print(ctl.submit_for_approval(args.job_id, args.stage, event_id))
    return 0


@_wrap_errors
def cmd_feedback(args):
    ctl = _controller(args)
    body_path = Path(args.body_file).expanduser()
    body = body_path.read_text(encoding="utf-8")
    event_id = args.event_id or f"feedback-{args.stage}-{uuid.uuid4()}"
    _print(ctl.record_feedback(args.job_id, args.stage, body, event_id))
    return 0


@_wrap_errors
def cmd_replay(args):
    ctl = _controller(args)
    persisted = ctl.inspect(args.job_id)["state"]
    replayed = ctl.replay(args.job_id)
    _print({
        "persisted_stage": persisted["stage"],
        "replayed_stage": replayed["expected_stage"],
        "match": persisted["stage"] == replayed["expected_stage"],
        "replayed": replayed,
    })
    return 0


@_wrap_errors
def cmd_init_operator(args):
    ctl = _controller(args)
    token = ctl.ensure_operator_token()
    _print({
        "operator_token_path": str(ctl.state_root / "operator.token"),
        "message": "Store this path privately. The operator CLI reads the token from this file.",
    })
    return 0


@_wrap_errors
def cmd_operator_approve(args):
    ctl = _controller(args)
    token_path = ctl.state_root / "operator.token"
    if not token_path.exists():
        print(json.dumps({"error": "OperatorNotInitialized", "message": f"run: ceos init-operator"}))
        return 2
    token = token_path.read_text().strip()
    # Confirm gesture — a human must type APPROVE. Not skippable in an interactive shell.
    if not args.yes:
        sys.stderr.write(
            f"About to record an approval for job={args.job_id} stage={args.stage} "
            f"v{args.expected_version} sha={args.expected_sha256[:12]}…\n"
            f"Type APPROVE to confirm: "
        )
        sys.stderr.flush()
        answer = sys.stdin.readline().strip()
        if answer != "APPROVE":
            print(json.dumps({"error": "NotConfirmed", "message": "confirmation gesture missing"}))
            return 2
    approver = args.approver or getpass.getuser()
    event_id = args.event_id or f"approve-{args.stage}-{uuid.uuid4()}"
    result = ctl.record_operator_approval(
        job_id=args.job_id,
        stage_key=args.stage,
        approver=approver,
        operator_token=token,
        expected_version=args.expected_version,
        expected_sha256=args.expected_sha256,
        note=args.note or "",
        event_id=event_id,
    )
    _print(result)
    return 0


def build_parser_author() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ceos", description="Creator Editing Steward controller (author/steward channel)")
    _add_common(p)
    sub = p.add_subparsers(dest="cmd", required=True)

    q = sub.add_parser("create", help="Create a scoped job")
    _add_common(q)
    q.add_argument("--job-id", required=True)
    q.add_argument("--scope", required=True)
    q.add_argument("--source", action="append", help="path[::label[::classification]] (repeatable)")
    q.add_argument("--event-id", default=None)
    q.set_defaults(func=cmd_create)

    q = sub.add_parser("inspect")
    _add_common(q)
    q.add_argument("--job-id", required=True)
    q.set_defaults(func=cmd_inspect)

    q = sub.add_parser("list")
    _add_common(q)
    q.set_defaults(func=cmd_list)

    q = sub.add_parser("save-artifact")
    _add_common(q)
    q.add_argument("--job-id", required=True)
    q.add_argument("--kind", required=True, choices=("brief", "plan", "draft", "final_evidence"))
    q.add_argument("--body-file", required=True)
    q.add_argument("--expected-prev-version", type=int, default=None)
    q.add_argument("--event-id", default=None)
    q.set_defaults(func=cmd_save_artifact)

    q = sub.add_parser("submit")
    _add_common(q)
    q.add_argument("--job-id", required=True)
    q.add_argument("--stage", required=True, choices=("plan", "draft"))
    q.add_argument("--event-id", default=None)
    q.set_defaults(func=cmd_submit)

    q = sub.add_parser("feedback")
    _add_common(q)
    q.add_argument("--job-id", required=True)
    q.add_argument("--stage", required=True, choices=("plan", "draft"))
    q.add_argument("--body-file", required=True)
    q.add_argument("--event-id", default=None)
    q.set_defaults(func=cmd_feedback)

    q = sub.add_parser("replay")
    _add_common(q)
    q.add_argument("--job-id", required=True)
    q.set_defaults(func=cmd_replay)

    q = sub.add_parser("init-operator", help="Create the operator approval token")
    _add_common(q)
    q.set_defaults(func=cmd_init_operator)

    return p


def build_parser_operator() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ceos-operator", description="Human-only operator approval channel")
    _add_common(p)
    sub = p.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("approve", help="Record an approval bound to artifact hash")
    _add_common(q)
    q.add_argument("--job-id", required=True)
    q.add_argument("--stage", required=True, choices=("plan", "draft"))
    q.add_argument("--expected-version", type=int, required=True)
    q.add_argument("--expected-sha256", required=True)
    q.add_argument("--approver", default=None, help="Defaults to $USER")
    q.add_argument("--note", default="")
    q.add_argument("--yes", action="store_true", help="Skip interactive prompt (still requires token file)")
    q.add_argument("--event-id", default=None)
    q.set_defaults(func=cmd_operator_approve)
    return p


def main_author(argv=None) -> int:
    args = build_parser_author().parse_args(argv)
    return args.func(args)


def main_operator(argv=None) -> int:
    args = build_parser_operator().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main_author())
