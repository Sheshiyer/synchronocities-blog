"""NIM model factory and API-key loading (never prints secrets)."""
import os
import subprocess
from pathlib import Path

from agentscope.credential._openai import OpenAICredential
from agentscope.model import OpenAIChatModel

NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
NIM_MODEL = "nvidia/nemotron-3-super-120b-a12b"

CLAUDE_ENV = Path.home() / ".claude" / ".env"


def load_nvidia_api_key() -> str:
    """Return NVIDIA_API_KEY from the environment, or extract it from
    ~/.claude/.env via grep|cut (the file is not safely source-able).
    The key is never printed or logged."""
    key = os.environ.get("NVIDIA_API_KEY")
    if key:
        return key
    if CLAUDE_ENV.exists():
        out = subprocess.run(
            f"grep '^NVIDIA_API_KEY=' {CLAUDE_ENV} | cut -d= -f2-",
            shell=True, capture_output=True, text=True, check=False,
        )
        key = out.stdout.strip()
        if key:
            return key
    raise RuntimeError(
        "NVIDIA_API_KEY not found in environment or ~/.claude/.env"
    )


def build_model(stream: bool = True, think: bool = False) -> OpenAIChatModel:
    """Working NIM client config from SPIKE-REPORT.md, plus a thinking toggle.

    nemotron-3-super is a reasoning model; with thinking enabled a single
    ledger-composition turn was observed to take ~4 minutes (thinking tokens
    are billed and streamed), which exceeds the execution budget for a
    multi-turn pipeline. ``enable_thinking: False`` (verified working via
    extra_body on this endpoint) keeps turns in the seconds range.
    """
    return OpenAIChatModel(
        credential=OpenAICredential(
            api_key=load_nvidia_api_key(),
            base_url=NIM_BASE_URL,
        ),
        model=NIM_MODEL,
        stream=stream,  # works with streaming ON for tool use
        extra_body={"chat_template_kwargs": {"enable_thinking": think}},
    )
