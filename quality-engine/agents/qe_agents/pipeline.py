"""Sequential 2-agent pipeline: Extractor -> Verifier (driver-bounded loop).

Extractor reads a post and writes a blind albedo v2.3.1 ledger into
quality-engine/agents/runs/<slug>/. The Verifier is then driven in a
Python-bounded loop (max 5 iterations): the driver validates, hands the
verbatim failures to the Verifier, and the Verifier repairs the ledger.
"""
import asyncio
import json
import time
from pathlib import Path
from typing import AsyncGenerator, Callable

from agentscope.agent import Agent, ReActConfig
from agentscope.message import UserMsg
from agentscope.middleware import MiddlewareBase
from agentscope.tool import Toolkit

from .config import build_model
from . import tools as T

MAX_VERIFIER_ITERS = 5

MODEL_CALLS = {"count": 0}


class ModelCallCounter(MiddlewareBase):
    """Counts raw model API calls (for the NIM-call budget)."""

    async def on_model_call(self, agent, input_kwargs, next_handler):
        MODEL_CALLS["count"] += 1
        return await next_handler()


def _is_rate_limit(exc: Exception) -> bool:
    s = str(exc).lower()
    return any(k in s for k in ("429", "rate limit", "rate_limit", "503",
                                "timeout", "timed out", "resourceexhausted",
                                "request limit", "limit reached"))


async def reply_with_backoff(agent: Agent, msg: UserMsg, label: str,
                             max_retries: int = 4):
    """agent.reply with exponential backoff on NIM rate limits / transient errors."""
    delay = 20.0
    for attempt in range(max_retries + 1):
        try:
            return await agent.reply(msg)
        except Exception as exc:  # noqa: BLE001
            if attempt < max_retries and _is_rate_limit(exc):
                T.TRACE.append({
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "agent": label, "tool": "__backoff__",
                    "args": {"attempt": attempt + 1, "delay_s": delay},
                    "result_preview": f"{type(exc).__name__}: {str(exc)[:300]}",
                })
                await asyncio.sleep(delay)
                delay *= 2
            else:
                raise


def serialize_reply(reply) -> dict:
    """Defensive serialization of a reply Msg: blocks + usage."""
    blocks = []
    for block in getattr(reply, "content", []) or []:
        entry = {"type": type(block).__name__}
        text = getattr(block, "text", None)
        thinking = getattr(block, "thinking", None)
        if text:
            entry["text"] = text
        if thinking:
            entry["thinking_chars"] = len(thinking)
        blocks.append(entry)
    usage = getattr(reply, "usage", None)
    usage_dict = None
    if usage is not None:
        for attr in ("model_dump", "dict"):
            fn = getattr(usage, attr, None)
            if callable(fn):
                try:
                    usage_dict = fn()
                    break
                except Exception:  # noqa: BLE001
                    pass
        if usage_dict is None:
            usage_dict = repr(usage)
    return {"blocks": blocks, "usage": usage_dict}


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

EXTRACTOR_SYSTEM = """You are QE-Extractor, a meticulous blind audit-ledger extractor for the \
albedo v2.3.1 schema. You read a blog post and produce a JSON ledger of its \
checkable claims. You work ONLY through your tools. You never invent content \
and you never read anything outside the tools given.

LEDGER TOP LEVEL (exact keys, no extras):
{
  "schema_version": "2.3",
  "ledger_state": "BOOTSTRAPPED",
  "post": "<slug>.md",
  "source_path": "src/content/posts/<slug>.md",
  "source_sha256": "<from compute_sha256 tool>",
  "legacy_audit_path": "quality-engine/audits/nigredo/<slug>.md-nigredo-audit.md",
  "claims": [ ... ]
}

EACH CLAIM (exact keys, no extras):
- id: "C001", "C002", ... sequential, zero-padded to 3.
- anchor: {"line_start": int, "line_end": int, "quote": str}. Line numbers come \
from the numbered post text your tools return. "quote" must be a VERBATIM \
substring of the joined text of lines line_start..line_end — copy it exactly, \
including markdown and punctuation. Keep ranges tight (usually 1-2 lines). \
The validator joins the lines with "\\n" and requires the quote to appear in \
the result verbatim.
- claim_mode: one of DIRECT-OBSERVATION | EMPIRICAL-CORRELATE | TRADITIONAL-SOURCE \
| HISTORICAL-CLAIM | HOUSE-MODEL | DERIVED-SYNTHESIS | DECLARED-METAPHOR
- claim_status: one of VERIFIED | ATTRIBUTED | COHERENT | DECLARED | UNSUPPORTED \
| CONTRADICTED | MISATTRIBUTED | MODE-CONFLATED
- remediation_codes: unique array drawn from KEEP, R-SPLIT, R-REMODE, R-SCOPE, \
R-SOURCE, R-ATTRIBUTE, R-CAUSE, R-MODEL, R-SYNTHESIS, R-METAPHOR, R-MATH, \
R-PROVENANCE, R-DELETE, R-MANUAL. If claim_status is failing (UNSUPPORTED, \
CONTRADICTED, MISATTRIBUTED, MODE-CONFLATED) the codes must NOT be ["KEEP"].
- requires_review: false (use true only if genuinely undecidable).
- math: {"role": one of NONE|LOAD-BEARING|ANALOGICAL|DECORATIVE|WRONG, \
"load_bearing": bool, "locks": {"correctness","consequence","provenance" each \
PASS|FAIL|UNASSESSED|NOT-APPLICABLE}, "evidence_eligible": bool}
  Conditional rules (hard schema constraints):
  * role LOAD-BEARING => load_bearing=true, evidence_eligible=true, all locks PASS.
  * role DECORATIVE => load_bearing=false, evidence_eligible=false, \
correctness=PASS, and at least one of consequence/provenance = FAIL.
  * role ANALOGICAL => claim_mode=DECLARED-METAPHOR, claim_status=DECLARED, \
load_bearing=false, evidence_eligible=false, all locks NOT-APPLICABLE.
  * role NONE => load_bearing=false, evidence_eligible=false, locks NOT-APPLICABLE.
  * role WRONG => load_bearing=false, evidence_eligible=false, correctness=FAIL.
- rationale: 1-3 sentences in audit voice: what the sentence asserts, why the \
status, and the evidence or standard it was checked against.
- legacy: exactly this blind-pass block (type is "math" if the claim is \
mathematical else "science"; load_bearing mirrors math.load_bearing):
  {"anchor": "BLIND-NEW-COVERAGE", \
"quote": "(no legacy row; blind-pass extraction)", \
"type": "science"|"math", \
"verdict": "NOT FLAGGED (§5 safe harbor)", \
"load_bearing": <bool>, \
"note": "New blind-pass coverage finding; legacy ledger not consulted per BLIND rule — no provenance counterfeited."}

WHAT TO EXTRACT: every sentence that makes a checkable factual, mathematical, \
historical, etymological, or traditional-source assertion — definitions, \
numeric claims, named-person attributions, "X is true because Y" statements. \
Skip pure rhetoric, questions to the reader, and section scaffolding. Judge \
status honestly: mark shaky attributions MISATTRIBUTED, overstatements \
CONTRADICTED or UNSUPPORTED, author synthesis presented as external fact \
MODE-CONFLATED, declared analogies DECLARED.

WORKFLOW (keep tool calls minimal):
1. read_post(slug) once (the post is short; if it is long, use read_post_lines \
in at most 2-3 chunks).
2. compute_sha256(slug).
3. Compose the full ledger JSON and write it with ONE write_run_file call. \
Pretty-print with 2-space indent. Ensure it parses as strict JSON (no trailing \
commas, no comments).
4. Reply with a one-paragraph summary: number of claims, status distribution, \
and any claims you were unsure about."""


VERIFIER_SYSTEM = """You are QE-Verifier, a schema-and-anchor repair specialist for albedo \
v2.3.1 ledgers. You are given validator failures verbatim. Your job is to make \
the MINIMAL edits that clear every failure — never restructure the ledger, \
never add or delete claims, never rewrite rationales unless they cite wrong \
line numbers.

Tools: patch_ledger (PREFERRED — small targeted edits, always produces valid \
JSON), read_run_file, write_run_file (last resort only), read_post_lines, \
compute_sha256, run_ledger_validator.

IMPORTANT: always prefer patch_ledger over write_run_file. Rewriting the \
whole 25KB+ ledger through write_run_file has repeatedly introduced JSON \
syntax errors; patch_ledger edits fields programmatically and cannot break \
JSON. Use write_run_file ONLY if the file itself is currently unparseable.

Repair playbook:
- "anchor lines out of range": re-read the post around the claim's topic with \
read_post_lines, find the real line range, fix line_start/line_end.
- "quote not found at cited lines": re-read the cited lines; replace "quote" \
with an exact verbatim substring of those lines (mind markdown, dashes, \
Unicode), or widen/shift the range to where the quote actually lives.
- "source_sha256 mismatch": set source_sha256 to compute_sha256(slug).
- "bad mode/status/math role/lock" or SCHEMA enum errors: replace with a valid \
enum value from the schema (call read_schema via the extractor docs if unsure — \
the enums are: modes DIRECT-OBSERVATION, EMPIRICAL-CORRELATE, TRADITIONAL-SOURCE, \
HISTORICAL-CLAIM, HOUSE-MODEL, DERIVED-SYNTHESIS, DECLARED-METAPHOR; statuses \
VERIFIED, ATTRIBUTED, COHERENT, DECLARED, UNSUPPORTED, CONTRADICTED, \
MISATTRIBUTED, MODE-CONFLATED; math roles NONE, LOAD-BEARING, ANALOGICAL, \
DECORATIVE, WRONG; locks PASS, FAIL, UNASSESSED, NOT-APPLICABLE).
- SCHEMA conditional errors (LOAD-BEARING/DECORATIVE/ANALOGICAL rules): bring \
the math block (and, for ANALOGICAL, claim_mode=DECLARED-METAPHOR + \
claim_status=DECLARED) into compliance.
- "failing status with KEEP-only remediation": add the appropriate R-* code.
- "legacy_audit_path malformed": pattern must be \
quality-engine/audits/nigredo/<slug>.md-nigredo-audit.md.
- "not valid JSON": rewrite the whole file as strict JSON.

Workflow each round: read_run_file the ledger, apply fixes with patch_ledger \
(one call, all ops batched), then confirm with run_ledger_validator. Reply \
with a short list of what you changed."""


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def _extractor_toolkit() -> Toolkit:
    return Toolkit(tools=[
        T.AutoAllowFunctionTool(T.read_post, is_read_only=True),
        T.AutoAllowFunctionTool(T.read_post_lines, is_read_only=True),
        T.AutoAllowFunctionTool(T.read_schema, is_read_only=True),
        T.AutoAllowFunctionTool(T.compute_sha256, is_read_only=True),
        T.AutoAllowFunctionTool(T.write_run_file),
        T.AutoAllowFunctionTool(T.read_run_file, is_read_only=True),
        T.AutoAllowFunctionTool(T.append_claims),
    ])


def _verifier_toolkit() -> Toolkit:
    return Toolkit(tools=[
        T.AutoAllowFunctionTool(T.patch_ledger),
        T.AutoAllowFunctionTool(T.read_run_file, is_read_only=True),
        T.AutoAllowFunctionTool(T.write_run_file),
        T.AutoAllowFunctionTool(T.read_post_lines, is_read_only=True),
        T.AutoAllowFunctionTool(T.compute_sha256, is_read_only=True),
        T.AutoAllowFunctionTool(T.run_ledger_validator, is_read_only=True),
    ])


async def run_extractor(slug: str, run_dir: Path) -> list[dict]:
    """AGENT 1 stage only. Returns the list of reply records."""
    rel_run_dir = str(run_dir.relative_to(T.REPO_ROOT))
    ledger_name = f"{slug}-albedo-ledger.json"
    ledger_path = run_dir / ledger_name
    run_dir.mkdir(parents=True, exist_ok=True)

    replies: list[dict] = []
    T.set_current_agent("extractor")
    extractor = Agent(
        name="QE-Extractor",
        system_prompt=EXTRACTOR_SYSTEM,
        model=build_model(),
        toolkit=_extractor_toolkit(),
        middlewares=[ModelCallCounter()],
        react_config=ReActConfig(max_iters=8),
    )
    task = (
        f"Extract a blind albedo v2.3.1 ledger for the post with slug \"{slug}\".\n\n"
        "MANDATORY WORKFLOW:\n"
        f"1. Call read_post(\"{slug}\") — it returns the post with line numbers.\n"
        f"2. Call compute_sha256(\"{slug}\").\n"
        "3. Compose the ledger and save it with ONE write_run_file call: "
        f"run_dir=\"{rel_run_dir}\", filename=\"{ledger_name}\".\n"
        "4. Reply with a short summary.\n\n"
        "The ledger MUST be strict JSON with EXACTLY these top-level keys "
        "(no others — no ledger_id, no generated_at, no ledger_hash, no "
        "integrity, no schema, no source object):\n"
        "{\n"
        '  "schema_version": "2.3",\n'
        '  "ledger_state": "BOOTSTRAPPED",\n'
        f'  "post": "{slug}.md",\n'
        f'  "source_path": "src/content/posts/{slug}.md",\n'
        '  "source_sha256": "<64-hex from compute_sha256>",\n'
        f'  "legacy_audit_path": "quality-engine/audits/nigredo/{slug}.md-nigredo-audit.md",\n'
        '  "claims": [ ... ]\n'
        "}\n\n"
        "Each claim MUST have EXACTLY these keys: id, anchor, claim_mode, "
        "claim_status, remediation_codes, requires_review, math, rationale, "
        "legacy. Example of ONE complete claim (follow this shape exactly):\n"
        "{\n"
        '  "id": "C001",\n'
        '  "anchor": {"line_start": 12, "line_end": 12, "quote": "<verbatim substring of line 12>"},\n'
        '  "claim_mode": "HISTORICAL-CLAIM",\n'
        '  "claim_status": "VERIFIED",\n'
        '  "remediation_codes": ["KEEP"],\n'
        '  "requires_review": false,\n'
        '  "math": {"role": "NONE", "load_bearing": false, "locks": '
        '{"correctness": "NOT-APPLICABLE", "consequence": "NOT-APPLICABLE", '
        '"provenance": "NOT-APPLICABLE"}, "evidence_eligible": false},\n'
        '  "rationale": "<1-3 sentences: what is asserted, why this status, evidence>",\n'
        '  "legacy": {"anchor": "BLIND-NEW-COVERAGE", "quote": "(no legacy row; blind-pass extraction)", '
        '"type": "science", "verdict": "NOT FLAGGED (§5 safe harbor)", "load_bearing": false, '
        '"note": "New blind-pass coverage finding; legacy ledger not consulted per BLIND rule — '
        'no provenance counterfeited."}\n'
        "}\n\n"
        "Extract 12-25 claims covering every checkable factual, mathematical, "
        "historical, or traditional-source assertion in the post. Anchor "
        "quotes must be VERBATIM substrings of the cited line range. Apply "
        "the enum values and the math-role conditional rules from your "
        "instructions exactly."
    )
    t0 = time.monotonic()
    reply = await reply_with_backoff(extractor, UserMsg(name="user", content=task),
                                     "extractor")
    replies.append({"agent": "extractor", "round": 0,
                    "latency_s": round(time.monotonic() - t0, 1),
                    **serialize_reply(reply)})

    # Ensure the ledger exists, parses, and is structurally valid; nudge with
    # verbatim validator failures if not (max 2 nudges).
    for nudge in range(2):
        if ledger_path.exists():
            try:
                json.loads(ledger_path.read_text())
                check = T.validate_ledger(rel_run_dir)
                if check["failure_count"] == 0:
                    break
                failures_text = "\n".join(f"- {f}" for f in check["failures"][:30])
            except json.JSONDecodeError as e:
                failures_text = f"- ledger is not valid JSON: {e}"
        else:
            failures_text = f"- ledger file {ledger_name} was not written"
        T.set_current_agent("extractor")
        reply = await reply_with_backoff(
            extractor,
            UserMsg(name="user", content=(
                "The ledger you wrote does NOT conform to the required albedo "
                "v2.3.1 format. Rewrite the COMPLETE ledger with write_run_file "
                f"(run_dir=\"{rel_run_dir}\", filename=\"{ledger_name}\") using "
                "EXACTLY the top-level keys and claim shape from the original "
                "task — no invented keys. Validator failures verbatim:\n"
                f"{failures_text}")),
            "extractor")
        replies.append({"agent": "extractor", "round": nudge + 1,
                        **serialize_reply(reply)})
    else:
        if not ledger_path.exists():
            raise RuntimeError("Extractor failed to write a ledger file.")
    return replies


async def run_verifier(slug: str, run_dir: Path,
                       replies: list[dict] | None = None) -> dict:
    """AGENT 2 stage: driver-bounded fix loop (max 5 iterations)."""
    rel_run_dir = str(run_dir.relative_to(T.REPO_ROOT))
    ledger_name = f"{slug}-albedo-ledger.json"
    ledger_path = run_dir / ledger_name
    if not ledger_path.exists():
        raise RuntimeError(f"no ledger at {ledger_path}")
    replies = replies if replies is not None else []
    validator_iters: list[dict] = []

    verifier = Agent(
        name="QE-Verifier",
        system_prompt=VERIFIER_SYSTEM,
        model=build_model(),
        toolkit=_verifier_toolkit(),
        middlewares=[ModelCallCounter()],
        react_config=ReActConfig(max_iters=8),
    )

    final_validation = None
    for it in range(1, MAX_VERIFIER_ITERS + 1):
        T.set_current_agent("driver")
        result = T.validate_ledger(rel_run_dir)  # programmatic; no NIM call
        validator_iters.append({"iteration": it - 1, **result})
        if result["failure_count"] == 0:
            final_validation = result
            break
        T.set_current_agent("verifier")
        failures_text = "\n".join(f"- {f}" for f in result["failures"])
        fix_task = (
            f"Validation round {it} of the ledger {rel_run_dir}/{ledger_name} "
            f"produced {result['failure_count']} failure(s). Fix them ALL with "
            f"minimal edits, then re-validate. Failures verbatim:\n{failures_text}"
        )
        t0 = time.monotonic()
        reply = await reply_with_backoff(verifier, UserMsg(name="user", content=fix_task),
                                         "verifier")
        replies.append({"agent": "verifier", "round": it,
                        "latency_s": round(time.monotonic() - t0, 1),
                        **serialize_reply(reply)})
    else:
        final_validation = result

    # Final programmatic check for the report (records the terminal state).
    T.set_current_agent("driver")
    final_check = T.validate_ledger(rel_run_dir)
    validator_iters.append({"iteration": "final", **final_check})
    final_validation = final_check

    ledger = json.loads(ledger_path.read_text())
    return {
        "slug": slug,
        "ledger_path": str(ledger_path),
        "ledger": ledger,
        "replies": replies,
        "validator_iters": validator_iters,
        "final_validation": final_validation,
        "model_calls": MODEL_CALLS["count"],
    }


async def run_verifier_only(slug: str, run_dir: Path) -> dict:
    """Resume path: reuse the ledger already in run_dir and run only the
    verifier loop. Used when a previous run was interrupted post-extraction."""
    return await run_verifier(slug, run_dir)


async def run_expansion(slug: str, run_dir: Path, start: int, end: int) -> list[dict]:
    """Second-pass extraction: cover a previously missed line range by
    APPENDING claims (append_claims assigns ids; no full-file rewrite)."""
    rel_run_dir = str(run_dir.relative_to(T.REPO_ROOT))
    replies: list[dict] = []
    T.set_current_agent("extractor")
    extractor = Agent(
        name="QE-Extractor-Expand",
        system_prompt=EXTRACTOR_SYSTEM,
        model=build_model(),
        toolkit=_extractor_toolkit(),
        middlewares=[ModelCallCounter()],
        react_config=ReActConfig(max_iters=6),
    )
    task = (
        f"The ledger for slug \"{slug}\" already exists at "
        f"{rel_run_dir}/{slug}-albedo-ledger.json with claims covering only "
        f"later lines. Your job: extract claims from lines {start}-{end} of "
        f"the post and APPEND them.\n\n"
        "MANDATORY WORKFLOW:\n"
        f"1. Call read_post_lines(\"{slug}\", {start}, {end}).\n"
        "2. Compose claims for every checkable factual, mathematical, "
        "historical, or traditional-source assertion in those lines "
        "(typically 6-15 claims; skip front-matter YAML between '---' lines "
        "and pure rhetoric). Each claim MUST be a JSON object with EXACTLY "
        "these keys and shapes (NO \"id\" key — ids are auto-assigned):\n"
        "{\n"
        '  "anchor": {"line_start": 45, "line_end": 45, "quote": "<verbatim substring of those lines>"},\n'
        '  "claim_mode": "HISTORICAL-CLAIM",\n'
        '  "claim_status": "VERIFIED",\n'
        '  "remediation_codes": ["KEEP"],\n'
        '  "requires_review": false,\n'
        '  "math": {"role": "NONE", "load_bearing": false, "locks": '
        '{"correctness": "NOT-APPLICABLE", "consequence": "NOT-APPLICABLE", '
        '"provenance": "NOT-APPLICABLE"}, "evidence_eligible": false},\n'
        '  "rationale": "<1-3 sentences: what is asserted, why this status, evidence>",\n'
        '  "legacy": {"anchor": "BLIND-NEW-COVERAGE", "quote": "(no legacy row; blind-pass extraction)", '
        '"type": "science", "verdict": "NOT FLAGGED (§5 safe harbor)", "load_bearing": false, '
        '"note": "New blind-pass coverage finding; legacy ledger not consulted per BLIND rule — '
        'no provenance counterfeited."}\n'
        "}\n"
        "claim_mode must be one of DIRECT-OBSERVATION | EMPIRICAL-CORRELATE | "
        "TRADITIONAL-SOURCE | HISTORICAL-CLAIM | HOUSE-MODEL | "
        "DERIVED-SYNTHESIS | DECLARED-METAPHOR (exact uppercase). "
        "claim_status: VERIFIED | ATTRIBUTED | COHERENT | DECLARED | "
        "UNSUPPORTED | CONTRADICTED | MISATTRIBUTED | MODE-CONFLATED. "
        "anchor must be an OBJECT with integer line numbers and a verbatim "
        "quote — never a string. math must be an OBJECT — never a boolean. "
        "append_claims validates each claim against the schema and REJECTS "
        "malformed ones.\n"
        "3. Save them with ONE append_claims call: "
        f"run_dir=\"{rel_run_dir}\", claims_json=<the JSON array as a string>.\n"
        "4. Reply with a one-paragraph summary."
    )
    t0 = time.monotonic()
    reply = await reply_with_backoff(extractor, UserMsg(name="user", content=task),
                                     "extractor-expand")
    replies.append({"agent": "extractor-expand", "round": 0,
                    "latency_s": round(time.monotonic() - t0, 1),
                    **serialize_reply(reply)})
    return replies


async def run_pipeline(slug: str, run_dir: Path) -> dict:
    """Full pipeline: Extractor then Verifier."""
    T.set_trace_file(run_dir / "trace.jsonl")
    run_dir.mkdir(parents=True, exist_ok=True)
    replies = await run_extractor(slug, run_dir)
    return await run_verifier(slug, run_dir, replies)
