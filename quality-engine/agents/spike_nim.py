#!/usr/bin/env python3
"""Spike: AgentScope ReAct-style Agent + NVIDIA NIM (OpenAI-compatible) tool use.

Proves that agentscope 2.0.x can run an Agent with a registered tool against
NVIDIA NIM's OpenAI-compatible endpoint (nemotron-3-super-120b-a12b).

Usage:
    NVIDIA_API_KEY=... .venv/bin/python spike_nim.py            # tool-use run
    NVIDIA_API_KEY=... .venv/bin/python spike_nim.py --plain    # plain chat, no tools

No secrets are stored here; the key comes from the environment only.
"""
import asyncio
import json
import os
import sys
import time
from pathlib import Path

from agentscope.agent import Agent, ReActConfig
from agentscope.credential._openai import OpenAICredential
from agentscope.message import UserMsg
from agentscope.model import OpenAIChatModel
from agentscope.permission import PermissionBehavior, PermissionDecision
from agentscope.tool import FunctionTool, Toolkit

REPO_ROOT = Path(__file__).resolve().parents[2]
LEDGER_DIR = REPO_ROOT / "quality-engine" / "audits" / "albedo-v231-blind"

NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
NIM_MODEL = "nvidia/nemotron-3-super-120b-a12b"


TOOL_CALL_TRACE: list[tuple[str, str]] = []


def read_ledger_claim(slug: str, claim_id: str) -> str:
    """Look up a single claim in an albedo audit ledger.

    Args:
        slug: Post slug, e.g. "seventeen-ways-pattern-repeats".
        claim_id: Claim identifier, e.g. "C010".

    Returns:
        JSON string with the claim's status, rationale, and remediation codes,
        or an error message.
    """
    path = LEDGER_DIR / f"{slug}-albedo-ledger.json"
    TOOL_CALL_TRACE.append((slug, claim_id))
    if not path.exists():
        return f"ERROR: ledger not found: {path.name}"
    ledger = json.loads(path.read_text())
    for claim in ledger.get("claims", []):
        if claim.get("id") == claim_id:
            return json.dumps(
                {
                    "id": claim["id"],
                    "claim_status": claim.get("claim_status"),
                    "rationale": claim.get("rationale"),
                    "remediation_codes": claim.get("remediation_codes"),
                    "requires_review": claim.get("requires_review"),
                },
                ensure_ascii=False,
            )
    return f"ERROR: claim {claim_id} not found in {path.name}"


class AutoAllowFunctionTool(FunctionTool):
    """FunctionTool that auto-allows its own read-only invocation.

    Default FunctionTool.check_permissions returns ASK, which would emit a
    RequireUserConfirmEvent and stall a headless run. This tool is read-only
    local file I/O, so we allow it outright.
    """

    async def check_permissions(self, *_args, **_kwargs) -> PermissionDecision:
        return PermissionDecision(
            behavior=PermissionBehavior.ALLOW,
            message="Read-only local ledger lookup; auto-allowed for spike.",
        )


def build_model(stream: bool = True) -> OpenAIChatModel:
    return OpenAIChatModel(
        credential=OpenAICredential(
            api_key=os.environ["NVIDIA_API_KEY"],
            base_url=NIM_BASE_URL,
        ),
        model=NIM_MODEL,
        stream=stream,
    )


def print_reply(reply) -> None:
    """Print every content block of a reply Msg (pydantic block objects)."""
    for block in reply.content:
        btype = type(block).__name__
        text = getattr(block, "text", None)
        thinking = getattr(block, "thinking", None)
        if text:
            print(f"[{btype}] {text}")
        elif thinking:
            print(f"[{btype}] <thinking, {len(thinking)} chars>")
        else:
            print(f"[{btype}] {block!r}")


async def run_tool_spike() -> None:
    model = build_model()
    toolkit = Toolkit(
        tools=[
            AutoAllowFunctionTool(
                read_ledger_claim,
                is_read_only=True,
            ),
        ],
    )
    agent = Agent(
        name="ledger-lookup",
        system_prompt=(
            "You are a precise audit assistant. When asked about a ledger "
            "claim, ALWAYS use the read_ledger_claim tool to look it up, then "
            "report the claim_status and summarize the rationale verbatim-ish. "
            "Do not guess."
        ),
        model=model,
        toolkit=toolkit,
        react_config=ReActConfig(max_iters=6),
    )
    question = (
        "Using the tool, look up claim C010 in the "
        "seventeen-ways-pattern-repeats ledger and tell me its status and "
        "what the resolution was."
    )
    t0 = time.monotonic()
    reply = await agent.reply(UserMsg(name="user", content=question))
    dt = time.monotonic() - t0

    print("=== TOOL CALLS OBSERVED ===")
    print(TOOL_CALL_TRACE)
    print("=== FINAL REPLY ===")
    print_reply(reply)
    print("=== USAGE ===")
    print(reply.usage)
    print(f"=== LATENCY: {dt:.1f}s (whole agent loop) ===")


async def run_plain_chat() -> None:
    """Plain completion without tools, to isolate basic NIM compat."""
    model = build_model(stream=False)
    agent = Agent(
        name="plain-chat",
        system_prompt="You are concise.",
        model=model,
    )
    t0 = time.monotonic()
    reply = await agent.reply(
        UserMsg(name="user", content="Reply with exactly: NIM-OK"),
    )
    dt = time.monotonic() - t0
    print("=== PLAIN CHAT REPLY ===")
    print_reply(reply)
    print("=== USAGE ===")
    print(reply.usage)
    print(f"=== LATENCY: {dt:.1f}s ===")


if __name__ == "__main__":
    if "NVIDIA_API_KEY" not in os.environ:
        sys.exit("NVIDIA_API_KEY env var is required.")
    if "--plain" in sys.argv:
        asyncio.run(run_plain_chat())
    else:
        asyncio.run(run_tool_spike())
