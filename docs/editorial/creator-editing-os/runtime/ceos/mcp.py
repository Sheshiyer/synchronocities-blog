"""JSON-RPC 2.0 MCP stdio server for the Creator Editing Steward pilot.

Transport: newline-delimited JSON over stdin/stdout, per the official
MCP specification (https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
Each message is a single UTF-8 JSON object on one line, terminated by \n.
There are NO Content-Length headers; that framing belongs to the LSP HTTP
transport, not the MCP stdio transport.

Protocol version negotiation:
  - Server advertises PROTOCOL_VERSION = "2025-06-18".
  - On `initialize`, client sends its `protocolVersion`.
  - If the client version is not in SUPPORTED_PROTOCOL_VERSIONS the server
    offers its latest supported version; the client decides compatibility.
  - The server echoes the negotiated version in the initialize result.

Capabilities:
  - No `record_approval` / `operator.approve` tool. Callers that ask receive
    a -32601 MethodNotAllowed error.
  - Named local studio scripts only; no arbitrary shell, network, model API or cloud activation.
  - No public or cloud writes.

MCP tool naming: uses dot-separated names (job.create, artifact.save, …) which
are valid identifiers to conformant MCP clients.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Callable

from .controller import Controller
from .studio_adapter import StudioAdapter, StudioAdapterError
from .model import (
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


PROTOCOL_VERSION = "2025-06-18"
SUPPORTED_PROTOCOL_VERSIONS = frozenset(["2025-06-18", "2024-11-05"])
SERVER_NAME = "creator-editing-steward-pilot"
SERVER_VERSION = "0.2.0"


def _err(code: int, message: str, data: Any = None) -> dict:
    e: dict = {"code": code, "message": message}
    if data is not None:
        e["data"] = data
    return e


class MCPServer:
    def __init__(self, controller: Controller, *, inp=None, outp=None, log=None, studio_root=None) -> None:
        self.ctl = controller
        self.inp = inp or sys.stdin.buffer
        self.outp = outp or sys.stdout.buffer
        self.log = log or sys.stderr
        self.initialized = False
        self.negotiated_version: str | None = None
        self.studio = StudioAdapter(controller, studio_root=studio_root)
        self.tools: dict[str, dict] = self._build_tools()

    # ---------- transport (newline-delimited JSON, MCP spec §3.1) ----------

    def _read_message(self) -> dict | None:
        """Read one newline-terminated JSON object from stdin."""
        while True:
            line = self.inp.readline()
            if not line:
                return None
            line = line.strip()
            if not line:
                continue
            try:
                return json.loads(line.decode("utf-8"))
            except json.JSONDecodeError as exc:
                self.log.write(f"ceos-mcp: JSON decode error: {exc}\n")
                continue

    def _write_message(self, obj: dict) -> None:
        """Write one newline-terminated JSON object to stdout."""
        data = (json.dumps(obj, separators=(",", ":")) + "\n").encode("utf-8")
        self.outp.write(data)
        self.outp.flush()

    def _respond(self, msg_id: Any, result: Any = None, error: Any = None) -> None:
        resp: dict = {"jsonrpc": "2.0", "id": msg_id}
        if error is not None:
            resp["error"] = error
        else:
            resp["result"] = result
        self._write_message(resp)

    def _notify(self, method: str, params: Any = None) -> None:
        """Send a JSON-RPC notification (no id)."""
        msg: dict = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        self._write_message(msg)

    # ---------- tool registry ----------

    def _build_tools(self) -> dict[str, dict]:
        return {
            "job.create": {
                "description": (
                    "Create a scoped job with recorded source paths + sha256. "
                    "Source paths must be under an allowed source root. Does not fetch anything."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "job_id": {"type": "string"},
                        "scope": {"type": "string"},
                        "sources": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "path": {"type": "string"},
                                    "label": {"type": "string"},
                                    "classification": {"type": "string"},
                                },
                                "required": ["path"],
                            },
                        },
                        "event_id": {"type": "string"},
                    },
                    "required": ["job_id", "scope", "event_id"],
                },
                "handler": self._tool_create,
            },
            "job.inspect": {
                "description": "Return persisted state, ordered event log, and legal next transitions.",
                "inputSchema": {
                    "type": "object",
                    "properties": {"job_id": {"type": "string"}},
                    "required": ["job_id"],
                },
                "handler": self._tool_inspect,
            },
            "job.list": {
                "description": "List all jobs under this state root (job_id, stage, scope).",
                "inputSchema": {"type": "object", "properties": {}},
                "handler": self._tool_list,
            },
            "artifact.read": {
                "description": "Read the current versioned job artifact with its verified hash, so a resumed session can recover the actual brief/plan/draft.",
                "inputSchema": {"type": "object", "properties": {
                    "job_id": {"type": "string"},
                    "kind": {"type": "string", "enum": ["brief", "plan", "draft", "final_evidence"]}
                }, "required": ["job_id", "kind"]},
                "handler": lambda args: self.ctl.read_artifact(args["job_id"], args["kind"]),
            },
            "artifact.save": {
                "description": (
                    "Save a versioned brief/plan/draft/final_evidence artifact. "
                    "Records sha256 and stage transition. "
                    "final_evidence must be JSON with output_path, output_sha256, and probe."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "job_id": {"type": "string"},
                        "kind": {
                            "type": "string",
                            "enum": ["brief", "plan", "draft", "final_evidence"],
                        },
                        "body": {"type": "string"},
                        "event_id": {"type": "string"},
                        "expected_prev_version": {"type": "integer"},
                    },
                    "required": ["job_id", "kind", "body", "event_id"],
                },
                "handler": self._tool_save_artifact,
            },
            "artifact.submit": {
                "description": "Submit plan or draft for human approval. Transitions to awaiting_*_approval.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "job_id": {"type": "string"},
                        "stage": {"type": "string", "enum": ["plan", "draft"]},
                        "event_id": {"type": "string"},
                    },
                    "required": ["job_id", "stage", "event_id"],
                },
                "handler": self._tool_submit,
            },
            "job.feedback": {
                "description": "Record feedback for plan or draft. Bounces stage back to planned/draft_ready.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "job_id": {"type": "string"},
                        "stage": {"type": "string", "enum": ["plan", "draft"]},
                        "body": {"type": "string"},
                        "event_id": {"type": "string"},
                    },
                    "required": ["job_id", "stage", "body", "event_id"],
                },
                "handler": self._tool_feedback,
            },
            "job.replay": {
                "description": "Replay event log and compare against persisted state. Surfaces StageDrift.",
                "inputSchema": {
                    "type": "object",
                    "properties": {"job_id": {"type": "string"}},
                    "required": ["job_id"],
                },
                "handler": self._tool_replay,
            },
            "capabilities.describe": {
                "description": "Return honest capability report for this server.",
                "inputSchema": {"type": "object", "properties": {}},
                "handler": self._tool_capabilities,
            },
            "studio.run": {
                "description": (
                    "Execute a named VideoStudio script for a job: "
                    "create/prep/stills/draft/final. "
                    "create and prep require no plan; stills requires plan; "
                    "draft requires plan approval; final requires draft approval. "
                    "Returns {action, job_id, ok, artifacts, errors, hashes}."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["create", "prep", "stills", "draft", "final"],
                        },
                        "job_id": {"type": "string"},
                        "fixture_path": {"type": "string"},
                        "video_type": {"type": "string", "enum": ["talking", "montage"]},
                        "fps": {"type": "integer"},
                        "comp_id": {"type": "string"},
                        "format": {"type": "string", "enum": ["9:16", "16:9", "both"]},
                    },
                    "required": ["action", "job_id"],
                },
                "handler": self._tool_studio_run,
            },
        }

    # ---------- tool handlers ----------

    def _tool_create(self, args: dict) -> dict:
        return self.ctl.create_job(
            args["job_id"], args["scope"], args.get("sources") or [], args["event_id"]
        )

    def _tool_inspect(self, args: dict) -> dict:
        return self.ctl.inspect(args["job_id"])

    def _tool_list(self, args: dict) -> dict:
        return {"jobs": self.ctl.list_jobs()}

    def _tool_save_artifact(self, args: dict) -> dict:
        return self.ctl.save_artifact(
            args["job_id"],
            args["kind"],
            args["body"],
            args["event_id"],
            expected_prev_version=args.get("expected_prev_version"),
        )

    def _tool_submit(self, args: dict) -> dict:
        return self.ctl.submit_for_approval(args["job_id"], args["stage"], args["event_id"])

    def _tool_feedback(self, args: dict) -> dict:
        return self.ctl.record_feedback(args["job_id"], args["stage"], args["body"], args["event_id"])

    def _tool_replay(self, args: dict) -> dict:
        return self.ctl.replay(args["job_id"])

    def _tool_studio_run(self, args: dict) -> dict:
        action = args.get("action", "")
        job_id = args.get("job_id", "")
        kwargs = {k: v for k, v in args.items() if k not in ("action", "job_id")}
        try:
            return self.studio.run(action, job_id, **kwargs)
        except StudioAdapterError as exc:
            raise ValueError(str(exc)) from exc

    def _tool_capabilities(self, args: dict) -> dict:
        return {
            "server": {"name": SERVER_NAME, "version": SERVER_VERSION},
            "protocol": PROTOCOL_VERSION,
            "supported_protocol_versions": sorted(SUPPORTED_PROTOCOL_VERSIONS),
            "transport": "stdio newline-delimited JSON (MCP spec §3.1)",
            "state_root": str(self.ctl.state_root),
            "can": [
                "create scoped jobs with whitelisted source paths + sha256",
                "read current artifact bodies with verified hashes",
                "save versioned brief/plan/draft/final_evidence artifacts",
                "submit plan/draft for human approval",
                "record feedback that bounces to planned/draft_ready",
                "return honest inspect and replay diffs",
                "validate final_evidence has real output_path/sha256/probe",
                "execute named VideoStudio scripts via studio.run (create/prep/stills/draft/final)",
            ],
            "cannot": [
                "record human approvals (operator CLI only, requires operator token)",
                "execute arbitrary shell commands",
                "make network calls, model API calls, or install packages",
                "publish to any external surface",
                "activate cloud agents",
                "access paths outside allowed source roots",
            ],
            "provider_model": None,
        }

    # ---------- dispatch ----------

    def _handle_tools_call(self, params: dict, msg_id: Any) -> None:
        name = params.get("name")
        args = params.get("arguments") or {}
        # Reject any approval attempt.
        if name in (
            "approval.record", "record_approval", "operator.approve",
            "approve", "approval.submit",
            "grant-approval", "grant_approval",
        ):
            self._respond(msg_id, error=_err(
                -32601,
                "approvals are operator-only; use `ceos-operator approve` on the host — no grant-approval tool",
                {"reason": "MethodNotAllowedOverMCP"},
            ))
            return
        tool = self.tools.get(name)
        if not tool:
            self._respond(msg_id, error=_err(-32601, f"unknown tool {name!r}"))
            return
        handler: Callable[[dict], Any] = tool["handler"]
        try:
            result = handler(args)
            self._respond(msg_id, result={
                "content": [
                    {"type": "text", "text": json.dumps(result, indent=2, sort_keys=True)}
                ],
                "structuredContent": result,
                "isError": False,
            })
        except (
            InvalidTransition, ArtifactDrift, PathViolation, StaleVersion,
            DuplicateEvent, ForgedApproval, UnknownJob, SourceDrift,
            StageDrift, FinalEvidenceInvalid,
        ) as exc:
            self._respond(msg_id, result={
                "content": [{"type": "text", "text": f"{type(exc).__name__}: {exc}"}],
                "isError": True,
            })
        except (ValueError, FileNotFoundError, KeyError) as exc:
            self._respond(msg_id, error=_err(-32602, f"{type(exc).__name__}: {exc}"))

    def _handle_initialize(self, params: dict, msg_id: Any) -> None:
        """Negotiate protocol version. Offer the latest supported version when the client requests another."""
        client_version = params.get("protocolVersion", "")
        self.negotiated_version = client_version if client_version in SUPPORTED_PROTOCOL_VERSIONS else PROTOCOL_VERSION
        self._respond(msg_id, result={
            "protocolVersion": self.negotiated_version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        })

    def _handle_message(self, msg: dict) -> None:
        method = msg.get("method")
        msg_id = msg.get("id")
        params = msg.get("params") or {}

        if method == "initialize":
            self._handle_initialize(params, msg_id)
            return
        if method == "notifications/initialized":
            self.initialized = True
            return
        if method == "tools/list":
            self._respond(msg_id, result={
                "tools": [
                    {"name": name, "description": t["description"], "inputSchema": t["inputSchema"]}
                    for name, t in self.tools.items()
                ],
            })
            return
        if method == "tools/call":
            self._handle_tools_call(params, msg_id)
            return
        if method and method.startswith("notifications/"):
            return  # ignore other notifications (no id → no response needed)
        if msg_id is not None:
            self._respond(msg_id, error=_err(-32601, f"unknown method {method!r}"))

    def serve(self) -> None:
        while True:
            msg = self._read_message()
            if msg is None:
                return
            try:
                self._handle_message(msg)
            except Exception as exc:
                self.log.write(f"ceos-mcp: internal error: {exc}\n")
                if "id" in msg:
                    try:
                        self._respond(msg["id"], error=_err(-32603, f"internal error: {exc}"))
                    except Exception:
                        pass


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(
        prog="ceos-mcp",
        description=(
            "Creator Editing Steward MCP stdio server. "
            "Transport: newline-delimited JSON (MCP spec §3.1). "
            "No Content-Length headers."
        ),
    )
    ap.add_argument("--state-root", default=None)
    args = ap.parse_args(argv)
    root = Path(args.state_root).expanduser() if args.state_root else None
    server = MCPServer(Controller(root))
    server.serve()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
