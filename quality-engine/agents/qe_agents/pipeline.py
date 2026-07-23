"""Sequential 3-stage pipeline: Extractor -> Verifier -> Verdict.

Extractor reads a post and writes a blind albedo v2.3.1 ledger into
quality-engine/agents/runs/<slug>/. The Verifier is then driven in a
Python-bounded loop (max 5 iterations): the driver validates, hands the
verbatim failures to the Verifier, and the Verifier repairs the ledger.

The Verdict stage (run_verdict_pass) re-judges every claim with a
thinking-enabled model: extraction runs thinking-OFF (fast but over-lenient —
a real math error slipped through as VERIFIED), so the verdict pass pays for
~2-5 min thinking turns, batched 3-4 claims per turn. Verdict agents are
single-turn (no ReAct loop): they return a strict-JSON verdict document and
the DRIVER applies it through the existing patch_ledger / append_claims
tools. This keeps each batch at exactly one thinking turn (a 2-turn ReAct
loop would risk the ~300 s execution budget) while still routing every
ledger mutation through the schema-validated tools.
"""
import asyncio
import json
import shutil
import time
from pathlib import Path
from typing import AsyncGenerator, Callable

from agentscope.agent import Agent, ReActConfig
from agentscope.message import UserMsg
from agentscope.middleware import MiddlewareBase
from agentscope.tool import Toolkit

from .config import build_model, build_verdict_model
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


# ---------------------------------------------------------------------------
# VERDICT stage (thinking-enabled re-judgement)
# ---------------------------------------------------------------------------

VERDICT_BATCH_SIZE = 3
VERDICT_CONTEXT_PAD = 6  # post lines of context around each batch's anchors
VERDICT_MAX_ATTEMPTS = 2  # per batch (initial + 1 regeneration on failure)

VERDICT_SYSTEM = """You are QE-Verdict, a rigorous epistemic re-judgement specialist for albedo \
v2.3.1 blind audit ledgers. A fast extraction pass already produced draft \
claims; several verdicts are over-lenient. Your job is to RE-JUDGE each claim \
with full rigor and return a strict-JSON verdict document. A driver applies \
your document to the ledger through schema-validated patch/append tools — \
you do NOT call tools yourself.

ENUMS (exact, uppercase):
- claim_mode: DIRECT-OBSERVATION | EMPIRICAL-CORRELATE | TRADITIONAL-SOURCE \
| HISTORICAL-CLAIM | HOUSE-MODEL | DERIVED-SYNTHESIS | DECLARED-METAPHOR
- claim_status: VERIFIED | ATTRIBUTED | COHERENT | DECLARED | UNSUPPORTED \
| CONTRADICTED | MISATTRIBUTED | MODE-CONFLATED
- math.role: NONE | LOAD-BEARING | ANALOGICAL | DECORATIVE | WRONG
- math.locks values: PASS | FAIL | UNASSESSED | NOT-APPLICABLE
- remediation_codes (unique array): KEEP, R-SPLIT, R-REMODE, R-SCOPE, \
R-SOURCE, R-ATTRIBUTE, R-CAUSE, R-MODEL, R-SYNTHESIS, R-METAPHOR, R-MATH, \
R-PROVENANCE, R-DELETE, R-MANUAL. If claim_status is failing (UNSUPPORTED, \
CONTRADICTED, MISATTRIBUTED, MODE-CONFLATED) codes must NOT be ["KEEP"].

STATUS DEFINITIONS:
- VERIFIED: independently checkable AND correct. For math: you recomputed it \
in your thinking and it holds. For facts: well-established and accurately stated.
- ATTRIBUTED: the claim reports what a person/text/traction holds or did, and \
the attribution itself is accurate.
- COHERENT: internal house-model reasoning; consistent, not externally checkable.
- DECLARED: the author explicitly flags it as metaphor, lens, or speculation.
- UNSUPPORTED: a checkable empirical/factual assertion with no in-post \
evidence or citation and not independently verifiable.
- CONTRADICTED: demonstrably false. For math you must show the failing \
computation in the rationale.
- MISATTRIBUTED: attributed to the wrong person, era, or text.
- MODE-CONFLATED: a metaphor, analogy, or author interpretation asserted as \
literal external fact.

EPISTEMIC RULES (this is why you exist — the fast pass violated these):
1. MATH CLAIMS MUST ACTUALLY BE CHECKED. Recompute digit by digit in your \
thinking before judging. Example of the failure mode you must catch: \
"the circle of fifths generates every pitch class by repeated multiplication \
by 3 (modulo 12), closing after twelve steps" — powers of 3 mod 12 are \
1,3,9,3,... an order-4 cycle on {0,3,6,9}; it never reaches the other 8 \
pitch classes. (The actual circle of fifths adds 7 semitones mod 12; \
multiplication by 3 mod 12 is a different, non-generating map.) Such a claim \
is CONTRADICTED with math.role=WRONG, not VERIFIED.
2. Empirical or historical assertions need in-post evidence/citation OR \
independent verifiability; otherwise UNSUPPORTED.
3. Metaphors or author synthesis presented as literal fact -> MODE-CONFLATED \
(or DERIVED-SYNTHESIS + UNSUPPORTED when it is checkable synthesis without \
evidence). When you set MODE-CONFLATED, math.role must NOT be ANALOGICAL \
(use NONE, or WRONG if the underlying math is also false).
4. Author-framed interpretations ("read through this lens", "I do not know \
whether...") stay DECLARED/DECLARED-METAPHOR.
5. SPLIT BUNDLED CLAIMS AGGRESSIVELY. If a claim contains a checkable true \
assertion alongside metaphorical or house-model framing, you MUST split it: \
judge the checkable core on its own merits (VERIFIED/ATTRIBUTED/UNSUPPORTED) \
and the framing separately (DECLARED/COHERENT). Do NOT downgrade the entire \
claim to MODE-CONFLATED or CONTRADICTED because one bundled element is \
metaphorical or questionable. The production standard favors splitting over \
blanket harsh verdicts.
6. HOUSE-MODEL CLAIMS WITH TRUE CORES. When the blog uses its own conceptual \
vocabulary (e.g., "trace of a rotor", "toroidal state machine") to describe \
a mathematically or structurally true object, do NOT penalize the vocabulary \
choice. If the underlying math/fact is correct, the claim mode should be \
HOUSE-MODEL or DERIVED-SYNTHESIS and the status should reflect the truth of \
the core — not MODE-CONFLATED. MODE-CONFLATED is reserved for cases where \
the metaphor is asserted as literal external fact WITHOUT a separable true core.

MATH-BLOCK CONDITIONAL RULES (hard schema constraints — your output must satisfy them):
- role LOAD-BEARING => load_bearing=true, evidence_eligible=true, all locks PASS.
- role DECORATIVE => load_bearing=false, evidence_eligible=false, \
correctness=PASS, at least one of consequence/provenance = FAIL.
- role ANALOGICAL => claim_mode=DECLARED-METAPHOR AND claim_status=DECLARED, \
load_bearing=false, evidence_eligible=false, all locks NOT-APPLICABLE.
- role NONE => load_bearing=false, evidence_eligible=false, all locks NOT-APPLICABLE.
- role WRONG => load_bearing=false, evidence_eligible=false, correctness=FAIL \
(other locks NOT-APPLICABLE or UNASSESSED).

SPLITS: if one claim covers multiple assertions that deserve DIFFERENT \
verdicts (e.g. a true mathematical statement plus a false topological claim \
in one sentence), split it:
- Re-anchor the ORIGINAL claim id to the first assertion: set "anchor" to \
{"line_start": int, "line_end": int, "quote": "<verbatim substring of those \
lines>"} and judge that assertion only.
- Add each remaining assertion as an entry in "new_claims" with its own tight \
anchor (verbatim quote), mode, status, remediation_codes, requires_review, \
math, rationale. Do NOT include "id" or "legacy" in new claims — the driver \
assigns ids and injects the legacy block.
- Add "R-SPLIT" to the original claim's remediation_codes when splitting.
ANCHOR IMMUTABILITY: apart from splits, NEVER change a claim's anchor lines \
or quote. If an anchor looks slightly off but the claim is judgeable, judge \
it and leave the anchor alone.

OUTPUT CONTRACT — your ENTIRE reply must be ONE strict JSON object, no prose, \
no code fences, no trailing commas:
{
  "verdicts": [
    {
      "id": "<existing claim id>",
      "claim_mode": "<enum>",
      "claim_status": "<enum>",
      "remediation_codes": ["<enum>", ...],
      "math": {"role": "<enum>", "load_bearing": <bool>,
               "evidence_eligible": <bool>,
               "locks": {"correctness": "<enum>", "consequence": "<enum>",
                          "provenance": "<enum>"}},
      "rationale": "<1-3 sentences, audit voice: what is asserted, why this \
status, and the evidence or computation it was checked against>",
      "anchor": null,
      "new_claims": []
    }
  ]
}
One verdicts entry per claim you were given, including every key above even \
when the judgement is unchanged (use the current values). "anchor" is null \
unless splitting. "new_claims" is [] unless splitting. Refine rationales \
whenever the old one is vague, wrong, or cites the wrong standard."""


def _verdict_paths(run_dir: Path, slug: str) -> dict:
    return {
        "orig": run_dir / f"{slug}-albedo-ledger.orig.json",
        "state": run_dir / "verdict-state.json",
        "verdict": run_dir / f"{slug}-albedo-ledger.verdict.json",
    }


def _claim_sort_key(c: dict):
    a = c.get("anchor", {})
    return (a.get("line_start", 0), a.get("line_end", 0), str(c.get("id", "")))


def _blind_legacy(math_block: dict) -> dict:
    """The standard blind-pass legacy block for split-derived new claims."""
    role = (math_block or {}).get("role", "NONE")
    return {
        "anchor": "BLIND-NEW-COVERAGE",
        "quote": "(no legacy row; blind-pass extraction)",
        "type": "math" if role != "NONE" else "science",
        "verdict": "NOT FLAGGED (§5 safe harbor)",
        "load_bearing": bool((math_block or {}).get("load_bearing", False)),
        "note": "New blind-pass coverage finding; legacy ledger not consulted "
                "per BLIND rule — no provenance counterfeited.",
    }


def _extract_json_doc(text: str) -> dict | None:
    """Parse the verdict agent's reply as one JSON object, tolerating code
    fences and stray prose around it."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1] if "\n" in t else t
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    start, end = t.find("{"), t.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(t[start:end + 1])
    except json.JSONDecodeError:
        return None


def _apply_verdict_doc(rel_run_dir: str, doc: dict) -> dict:
    """Apply one batch's verdict document through the EXISTING patch/append
    tools (schema-validated, atomic append). Raises RuntimeError on tool
    errors so the batch can be regenerated."""
    verdicts = doc.get("verdicts")
    if not isinstance(verdicts, list) or not verdicts:
        raise RuntimeError("verdict document has no 'verdicts' array")
    ops: list[dict] = []
    new_claims: list[tuple[str, dict]] = []
    per_claim: list[dict] = []
    for v in verdicts:
        cid = v.get("id")
        if not cid:
            raise RuntimeError(f"verdict entry missing id: {str(v)[:200]}")
        a = v.get("anchor")
        if a:  # split re-anchor of the original claim (only place anchors may change)
            ops.append({"op": "set_anchor", "claim_id": cid,
                        "line_start": int(a["line_start"]),
                        "line_end": int(a["line_end"]),
                        "quote": str(a["quote"])})
        for field in ("claim_mode", "claim_status", "remediation_codes", "rationale"):
            if field in v:
                ops.append({"op": "set", "claim_id": cid, "field": field,
                            "value": v[field]})
        m = v.get("math")
        if isinstance(m, dict):
            ops.append({"op": "set", "claim_id": cid, "field": "math.role",
                        "value": m.get("role", "NONE")})
            ops.append({"op": "set", "claim_id": cid, "field": "math.load_bearing",
                        "value": bool(m.get("load_bearing", False))})
            ops.append({"op": "set", "claim_id": cid, "field": "math.evidence_eligible",
                        "value": bool(m.get("evidence_eligible", False))})
            for lk in ("correctness", "consequence", "provenance"):
                ops.append({"op": "set", "claim_id": cid,
                            "field": f"math.locks.{lk}",
                            "value": m.get("locks", {}).get(lk, "NOT-APPLICABLE")})
        for nc in v.get("new_claims") or []:
            nc = dict(nc)
            nc.pop("id", None)
            nc.pop("new_claims", None)  # no nested splits; schema is additionalProperties:false
            nc.setdefault("requires_review", False)
            nc.setdefault("legacy", _blind_legacy(nc.get("math")))
            new_claims.append((cid, nc))
        per_claim.append({"id": cid, "claim_status": v.get("claim_status"),
                          "split": bool(new_claims and new_claims[-1][0] == cid
                                        and (v.get("new_claims") or []))})

    applied = {"patch": None, "appended": {}}
    if ops:
        res = T.patch_ledger(rel_run_dir, json.dumps(ops))
        if res.startswith("ERROR"):
            raise RuntimeError(f"patch_ledger failed: {res}")
        applied["patch"] = json.loads(res)
        if applied["patch"].get("errors"):
            raise RuntimeError(f"patch_ledger op errors: {applied['patch']['errors']}")
    if new_claims:
        res = T.append_claims(rel_run_dir,
                              json.dumps([nc for _, nc in new_claims],
                                         ensure_ascii=False))
        if res.startswith("ERROR"):
            raise RuntimeError(f"append_claims failed: {res}")
        out = json.loads(res)
        for (orig_id, _), new_id in zip(new_claims, out.get("appended", [])):
            applied["appended"].setdefault(orig_id, []).append(new_id)
    applied["per_claim"] = per_claim
    return applied


def _verdict_batch_prompt(slug: str, claims: list[dict], excerpt: str,
                          feedback: str | None) -> str:
    ids = ", ".join(c["id"] for c in claims)
    prompt = (
        f"Post: {slug}.md — numbered excerpt covering the claims below:\n\n"
        f"{excerpt}\n\n"
        "Current draft claims to re-judge (full ledger entries):\n"
        f"{json.dumps(claims, indent=1, ensure_ascii=False)}\n\n"
        f"Re-judge EVERY claim ({ids}) under the epistemic rules: actually "
        "recompute any math, demand in-post evidence for empirical claims, "
        "flag metaphors-asserted-as-fact as MODE-CONFLATED, and split claims "
        "that bundle assertions needing different verdicts. Return ONLY the "
        "strict JSON verdict document — one verdicts entry per claim id."
    )
    if feedback:
        prompt += (
            "\n\nPREVIOUS ATTEMPT FAILED — regenerate the COMPLETE document "
            f"with this fixed:\n{feedback}"
        )
    return prompt


async def _run_verdict_batch(slug: str, rel_run_dir: str, ledger_path: Path,
                             state: dict, bi: int) -> list[dict]:
    """One thinking-enabled verdict turn over one batch; driver applies the
    returned document via patch_ledger/append_claims. One regeneration retry."""
    claim_ids = state["batches"][bi]
    replies: list[dict] = []
    feedback = None
    for attempt in range(VERDICT_MAX_ATTEMPTS):
        ledger = json.loads(ledger_path.read_text())
        claims = sorted((c for c in ledger["claims"] if c["id"] in claim_ids),
                        key=_claim_sort_key)
        if not claims:
            raise RuntimeError(f"batch {bi}: none of {claim_ids} found in ledger")
        lo = max(1, min(c["anchor"]["line_start"] for c in claims) - VERDICT_CONTEXT_PAD)
        hi = max(c["anchor"]["line_end"] for c in claims) + VERDICT_CONTEXT_PAD
        T.set_current_agent(f"verdict-b{bi}")
        excerpt = T.read_post_lines(slug, lo, hi)  # tool fn; logged to trace
        agent = Agent(
            name=f"QE-Verdict-B{bi}",
            system_prompt=VERDICT_SYSTEM,
            model=build_verdict_model(),  # thinking ENABLED; ~2-5 min/turn
            middlewares=[ModelCallCounter()],
            react_config=ReActConfig(max_iters=1),  # single turn, no ReAct loop
        )
        t0 = time.monotonic()
        reply = await reply_with_backoff(
            agent,
            UserMsg(name="user", content=_verdict_batch_prompt(
                slug, claims, excerpt, feedback)),
            f"verdict-b{bi}", max_retries=2)
        rec = {"agent": f"verdict-b{bi}", "round": attempt,
               "latency_s": round(time.monotonic() - t0, 1),
               **serialize_reply(reply)}
        replies.append(rec)
        # Persist the raw reply for post-mortem debugging (cheap, on disk).
        debug_path = ledger_path.parent / f"verdict-last-reply-b{bi}.json"
        debug_path.write_text(json.dumps(rec, indent=1, ensure_ascii=False))
        texts = [b.get("text", "") for b in rec["blocks"] if b.get("text")]
        doc = _extract_json_doc(texts[-1]) if texts else None
        if isinstance(doc, list):  # model returned a bare array of verdicts
            doc = {"verdicts": doc}
        if isinstance(doc, dict) and "verdicts" not in doc:
            for alt in ("claims", "verdict", "results", "judgements"):
                if isinstance(doc.get(alt), list):
                    doc = {"verdicts": doc[alt]}
                    break
        if doc is None or "verdicts" not in doc:
            feedback = ("Your reply was not the required JSON document with a "
                        "'verdicts' array (see the OUTPUT CONTRACT). Return ONLY "
                        "that JSON object (no prose, no code fences).")
            continue
        try:
            T.set_current_agent("driver")
            applied = _apply_verdict_doc(rel_run_dir, doc)
        except RuntimeError as exc:
            feedback = str(exc)
            continue
        # Success — record old->new for the report.
        orig = state["original_claims"]
        change = {"batch": bi, "latency_s": rec["latency_s"], "claims": []}
        for v in doc["verdicts"]:
            cid = v["id"]
            old = orig.get(cid, {})
            change["claims"].append({
                "id": cid,
                "old_status": old.get("claim_status"),
                "new_status": v.get("claim_status"),
                "old_mode": old.get("claim_mode"),
                "new_mode": v.get("claim_mode"),
                "split_new_ids": applied["appended"].get(cid, []),
            })
        state["changes"].append(change)
        state["done"].append(bi)
        return replies
    raise RuntimeError(f"verdict batch {bi} failed after "
                       f"{VERDICT_MAX_ATTEMPTS} attempts: {feedback}")


async def run_verdict_pass(ledger_path: str | Path, post_slug: str,
                           batch_index: int | None = None,
                           batch_size: int = VERDICT_BATCH_SIZE) -> dict:
    """VERDICT stage: re-judge a draft ledger with thinking ENABLED.

    Loads the draft ledger at ledger_path (runs/<slug>/<slug>-albedo-ledger.json),
    batches its claims (3-4 per thinking turn), sends each batch with the
    surrounding post context to a single-turn Verdict agent, and applies the
    returned verdicts through the existing patch_ledger/append_claims tools —
    including fine-splits (re-anchored original + appended claims with
    corrected auto-assigned ids). Anchors are never changed except where a
    split requires it.

    Resume-safe: the draft is preserved at <slug>-albedo-ledger.orig.json on
    first invocation; progress lives in verdict-state.json, so per-batch CLI
    invocations accumulate. When all batches are done, a thinking-OFF verifier
    loop brings the ledger green, the result is written to
    <slug>-albedo-ledger.verdict.json, and the original draft is restored
    untouched at its original path.
    """
    ledger_path = Path(ledger_path)
    run_dir = ledger_path.parent
    slug = post_slug
    rel_run_dir = str(run_dir.relative_to(T.REPO_ROOT))
    paths = _verdict_paths(run_dir, slug)
    replies: list[dict] = []
    validator_iters: list[dict] = []
    final_validation = {"failure_count": -1,
                        "failures": ["verdict pass not finalized yet"]}

    if not paths["orig"].exists():
        shutil.copy(ledger_path, paths["orig"])
    if paths["state"].exists():
        state = json.loads(paths["state"].read_text())
    else:
        ledger = json.loads(ledger_path.read_text())
        ordered = sorted(ledger["claims"], key=_claim_sort_key)
        state = {
            "slug": slug,
            "batch_size": batch_size,
            "batches": [[c["id"] for c in ordered[i:i + batch_size]]
                        for i in range(0, len(ordered), batch_size)],
            "done": [],
            "changes": [],
            "original_claims": {c["id"]: c for c in ledger["claims"]},
            "finalized": False,
        }
        paths["state"].write_text(json.dumps(state, indent=1, ensure_ascii=False))

    pending = ([batch_index] if batch_index is not None
               else [i for i in range(len(state["batches"]))
                     if i not in state["done"]])
    for bi in pending:
        if bi in state["done"]:
            continue
        replies.extend(await _run_verdict_batch(
            slug, rel_run_dir, ledger_path, state, bi))
        paths["state"].write_text(json.dumps(state, indent=1, ensure_ascii=False))

    if (not state["finalized"]
            and len(state["done"]) == len(state["batches"])):
        # All batches judged: thinking-OFF verifier loop to green, then swap
        # the verdict ledger into <slug>-albedo-ledger.verdict.json and
        # restore the untouched draft at its original path.
        vres = await run_verifier(slug, run_dir, replies)
        replies = vres["replies"]
        validator_iters = vres["validator_iters"]
        final_validation = vres["final_validation"]
        if final_validation["failure_count"] == 0:
            shutil.move(str(ledger_path), paths["verdict"])
            shutil.copy(paths["orig"], ledger_path)
            state["finalized"] = True
            paths["state"].write_text(
                json.dumps(state, indent=1, ensure_ascii=False))

    out_ledger_path = paths["verdict"] if state["finalized"] else ledger_path
    return {
        "slug": slug,
        "ledger_path": str(out_ledger_path),
        "ledger": json.loads(out_ledger_path.read_text()),
        "replies": replies,
        "validator_iters": validator_iters,
        "final_validation": final_validation,
        "model_calls": MODEL_CALLS["count"],
        "verdict_state": state,
    }
