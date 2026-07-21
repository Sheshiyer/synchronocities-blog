# Spike Report — AgentScope 2.0 × NVIDIA NIM tool use

**Date:** 2026-05-22 (run timestamp of spike)
**Result: PASS.** AgentScope's `Agent` (ReAct loop) successfully executed a real
file-I/O tool call through NVIDIA NIM's OpenAI-compatible endpoint and produced a
correct final answer. Phase 1 is unblocked.

## Environment

| Item | Value |
|---|---|
| Python | 3.12.13 (system `python3`, `python3 -m venv quality-engine/agents/.venv`) |
| agentscope | **2.0.4.post1** (installed via `pip install "agentscope==2.0.*"`) |
| API key | `NVIDIA_API_KEY` found in `~/.claude/.env` (not in `workers/.env` / `workers/.dev.vars`); used via env var only, never printed or committed. Worker fallback NOT needed and untested. |

## Working model client config (verbatim)

```python
from agentscope.credential._openai import OpenAICredential
from agentscope.model import OpenAIChatModel

model = OpenAIChatModel(
    credential=OpenAICredential(
        api_key=os.environ["NVIDIA_API_KEY"],
        base_url="https://integrate.api.nvidia.com/v1",
    ),
    model="nvidia/nemotron-3-super-120b-a12b",
    stream=True,   # works with streaming ON for tool use
)
```

## What worked

- **Tool calling over NIM: YES.** The agent autonomously called
  `read_ledger_claim("seventeen-ways-pattern-repeats", "C010")` (verified by an
  in-process trace), received the JSON tool result, and answered correctly:
  status `COHERENT`, resolution `RESOLVED(verified): valid partition reproduces 17 —
  p1|p2|{p2mm,p2mg,p2gg,c2mm}=4|...; 1+1+4+3+5+3=17.` Nemotron accepts the standard
  OpenAI tool schema AgentScope emits; no schema munging needed.
- **Streaming + tool use together: YES** (`stream=True`). No forced-`tool_choice`
  failure observed on this thinking endpoint — the known thinking-endpoint
  `tool_choice` issue did NOT trigger with AgentScope's default request shape.
- **Plain chat (no tools): YES.** `stream=False`, replied `NIM-OK`.
- **Thinking blocks:** nemotron is a reasoning model; replies contain a
  `ThinkingBlock` followed by a `TextBlock`. AgentScope handles this natively —
  no config needed. Content blocks are pydantic objects, not dicts: use
  `getattr(block, "text", None)` / `getattr(block, "thinking", None)`.
- **No warnings, no fallbacks, no retries observed.** Stderr was clean on all runs.

## What failed / gotchas (Phase 1 must-read)

1. **API is AgentScope 2.0-style, NOT the 1.x `ReActAgent`.** There is no
   `agentscope.agent.ReActAgent` in 2.0.4. The pattern is:
   ```python
   from agentscope.agent import Agent, ReActConfig
   agent = Agent(
       name=..., system_prompt=..., model=model,
       toolkit=Toolkit(tools=[...]),
       react_config=ReActConfig(max_iters=6),
   )
   reply = await agent.reply(UserMsg(name="user", content="..."))
   ```
2. **Permission gate stalls headless runs.** `FunctionTool.check_permissions`
   defaults to `PermissionBehavior.ASK`, which emits `RequireUserConfirmEvent`
   and stops the loop waiting for user confirmation. For headless/CI agents,
   subclass and auto-allow read-only tools:
   ```python
   class AutoAllowFunctionTool(FunctionTool):
       async def check_permissions(self, *_a, **_k):
           return PermissionDecision(behavior=PermissionBehavior.ALLOW, message="...")
   ```
   (Alternative: register an allow-rule on the agent's `PermissionEngine`.)
3. **Tool registration is easy:** `FunctionTool(your_fn, is_read_only=True)` —
   schema is derived from the signature + docstring (Args: section). A plain
   `-> str` return is auto-wrapped into a `ToolChunk`; JSON-string returns work well.
4. **Empty-looking replies:** if you iterate `reply.content` expecting dicts you
   get nothing — blocks are pydantic models (`TextBlock`, `ThinkingBlock`). This
   cost one debugging cycle.
5. **Ledger shape note:** claims use key `id` (not `claim_id`) and `claim_status`;
   `ledger["claims"]` is a list of 35 claims in the seventeen-ways ledger.
6. **`~/.claude/.env` is not safely `source`-able** — it contains unquoted values
   that bash tries to execute. Extract single vars with
   `grep '^NVIDIA_API_KEY=' ... | cut -d= -f2-` instead.

## Token usage observed

| Run | input_tokens | output_tokens | Latency (wall, whole agent loop) |
|---|---|---|---|
| Tool-use run A | 1143 | 504 | 11.8 s |
| Tool-use run B (repeat) | 1151 | 416 | 26.0 s |
| Plain chat | 28 | 38 | 5.8 s |

Latency feel: single-digit to ~30 s per full ReAct loop (tool call + final
answer); NIM queue variance is significant. Output-token counts include hidden
thinking. Budget ~15–30 s per agent step for Phase 1 planning.

## Files

- `quality-engine/agents/spike_nim.py` — the spike (tool-use default; `--plain` for chat-only)
- `quality-engine/agents/.gitignore` — ignores `.venv/`, `__pycache__/`, `*.pyc`, `.env`

Nothing committed; no files outside `quality-engine/agents/` modified.
