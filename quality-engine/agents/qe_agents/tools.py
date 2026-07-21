"""Repo-scoped file tools for the QE extraction pipeline.

All tools are read-only against src/content/posts and read/write only inside
quality-engine/agents/runs/. The production audits tree is never touched here.
Every call is appended to TRACE for the run's trace.json artifact.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from agentscope.permission import PermissionBehavior, PermissionDecision
from agentscope.tool import FunctionTool

REPO_ROOT = Path(__file__).resolve().parents[3]
POSTS_DIR = REPO_ROOT / "src" / "content" / "posts"
RUNS_DIR = REPO_ROOT / "quality-engine" / "agents" / "runs"
VALIDATOR_SCRIPT = REPO_ROOT / "quality-engine" / "scripts" / "validate-blind-ledgers.py"
SCHEMA_FILE = REPO_ROOT / "quality-engine" / "schemas" / "albedo-v2.3.schema.json"

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

# In-process trace: {ts, agent, tool, args, result_preview}
TRACE: list[dict] = []
_CURRENT_AGENT = {"name": "driver"}
_TRACE_FILE: dict[str, Path | None] = {"path": None}


def set_current_agent(name: str) -> None:
    _CURRENT_AGENT["name"] = name


def set_trace_file(path: Path) -> None:
    """Flush every trace entry to disk immediately (survives timeouts)."""
    _TRACE_FILE["path"] = path


def _log(tool: str, args: dict, result: str) -> None:
    entry = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "agent": _CURRENT_AGENT["name"],
        "tool": tool,
        "args": args,
        "result_preview": result[:1500],
    }
    TRACE.append(entry)
    if _TRACE_FILE["path"] is not None:
        with open(_TRACE_FILE["path"], "a") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


class AutoAllowFunctionTool(FunctionTool):
    """FunctionTool that auto-allows its own invocation.

    Default FunctionTool.check_permissions returns ASK, which emits a
    RequireUserConfirmEvent and stalls a headless run. These tools are local
    file I/O scoped to the repo, so we allow them outright (per spike).
    """

    async def check_permissions(self, *_args, **_kwargs) -> PermissionDecision:
        return PermissionDecision(
            behavior=PermissionBehavior.ALLOW,
            message="Repo-scoped local file I/O; auto-allowed for headless run.",
        )


def _check_slug(slug: str) -> None:
    if not SLUG_RE.match(slug):
        raise ValueError(f"bad slug: {slug!r}")


def _resolve_run_dir(run_dir: str) -> Path:
    """Resolve run_dir, which must stay inside quality-engine/agents/runs/."""
    rd = (REPO_ROOT / run_dir).resolve() if not os.path.isabs(run_dir) else Path(run_dir).resolve()
    runs = RUNS_DIR.resolve()
    if rd != runs and runs not in rd.parents:
        raise ValueError(f"run_dir escapes runs dir: {run_dir!r}")
    return rd


# ---------------------------------------------------------------------------
# Tool functions
# ---------------------------------------------------------------------------

def list_posts() -> str:
    """List all post slugs available under src/content/posts/.

    Returns:
        JSON array of slug strings (filename without .md).
    """
    slugs = sorted(p.stem for p in POSTS_DIR.glob("*.md"))
    res = json.dumps(slugs)
    _log("list_posts", {}, res)
    return res


def read_post(slug: str) -> str:
    """Read a whole post with 1-based line numbers, for anchoring claims.

    Args:
        slug: Post slug, e.g. "vortex-based-mathematics".

    Returns:
        The post text with each line prefixed by "N: " (1-based line number),
        plus a header with the total line count.
    """
    _check_slug(slug)
    path = POSTS_DIR / f"{slug}.md"
    if not path.exists():
        return f"ERROR: post not found: {slug}"
    lines = path.read_text().splitlines()
    res = f"TOTAL_LINES={len(lines)}\n" + "\n".join(
        f"{i + 1}: {ln}" for i, ln in enumerate(lines)
    )
    _log("read_post", {"slug": slug}, res)
    return res


def read_post_lines(slug: str, start: int, end: int) -> str:
    """Read a line range of a post with 1-based line numbers.

    Args:
        slug: Post slug, e.g. "vortex-based-mathematics".
        start: First line to return (1-based, inclusive).
        end: Last line to return (1-based, inclusive).

    Returns:
        The requested lines, each prefixed by "N: ".
    """
    _check_slug(slug)
    path = POSTS_DIR / f"{slug}.md"
    if not path.exists():
        return f"ERROR: post not found: {slug}"
    lines = path.read_text().splitlines()
    start = max(1, start)
    end = min(len(lines), end)
    if start > end:
        return f"ERROR: empty range {start}-{end} (file has {len(lines)} lines)"
    res = "\n".join(f"{i + 1}: {lines[i]}" for i in range(start - 1, end))
    _log("read_post_lines", {"slug": slug, "start": start, "end": end}, res)
    return res


def read_schema() -> str:
    """Read the albedo v2.3 JSON schema that the ledger must satisfy.

    Returns:
        The full schema JSON text.
    """
    res = SCHEMA_FILE.read_text()
    _log("read_schema", {}, res)
    return res


def compute_sha256(slug: str) -> str:
    """Compute the SHA-256 of the raw bytes of a post file.

    Args:
        slug: Post slug, e.g. "vortex-based-mathematics".

    Returns:
        64-char lowercase hex digest.
    """
    _check_slug(slug)
    path = POSTS_DIR / f"{slug}.md"
    if not path.exists():
        return f"ERROR: post not found: {slug}"
    res = hashlib.sha256(path.read_bytes()).hexdigest()
    _log("compute_sha256", {"slug": slug}, res)
    return res


def write_run_file(run_dir: str, filename: str, content: str) -> str:
    """Write a file inside a run directory under quality-engine/agents/runs/.

    Args:
        run_dir: Run directory, e.g. "quality-engine/agents/runs/vortex-based-mathematics".
        filename: Plain file name (no slashes), e.g. "vortex-based-mathematics-albedo-ledger.json".
        content: Full file content to write.

    Returns:
        Confirmation with the path and byte count, or an error message.
    """
    try:
        if not SAFE_NAME_RE.match(filename) or "/" in filename:
            return f"ERROR: bad filename {filename!r}"
        rd = _resolve_run_dir(run_dir)
        rd.mkdir(parents=True, exist_ok=True)
        path = rd / filename
        path.write_text(content)
        res = f"OK: wrote {path.relative_to(REPO_ROOT)} ({len(content)} bytes)"
    except Exception as e:  # noqa: BLE001 - surfaced to the agent verbatim
        res = f"ERROR: {e}"
    _log("write_run_file", {"run_dir": run_dir, "filename": filename,
                            "content_bytes": len(content)}, res)
    return res


def read_run_file(run_dir: str, filename: str) -> str:
    """Read a file from a run directory under quality-engine/agents/runs/.

    Args:
        run_dir: Run directory, e.g. "quality-engine/agents/runs/vortex-based-mathematics".
        filename: Plain file name (no slashes).

    Returns:
        The file content, or an error message.
    """
    try:
        if not SAFE_NAME_RE.match(filename) or "/" in filename:
            return f"ERROR: bad filename {filename!r}"
        path = _resolve_run_dir(run_dir) / filename
        res = path.read_text()
    except Exception as e:  # noqa: BLE001
        res = f"ERROR: {e}"
    _log("read_run_file", {"run_dir": run_dir, "filename": filename}, res)
    return res


def validate_ledger(run_dir: str) -> dict:
    """Programmatic validation (no NIM call). Returns a result dict.

    Runs (a) jsonschema validation against albedo-v2.3.schema.json and
    (b) quality-engine/scripts/validate-blind-ledgers.py against a temp ROOT
    laid out as the script expects (blind ledger copied in, post symlinked).
    """
    rd = _resolve_run_dir(run_dir)
    slug = rd.name
    ledger_path = rd / f"{slug}-albedo-ledger.json"
    if not ledger_path.exists():
        return {"failure_count": 1,
                "failures": [f"ledger file missing: {ledger_path.name}"]}

    failures: list[str] = []
    try:
        ledger = json.loads(ledger_path.read_text())
    except json.JSONDecodeError as e:
        return {"failure_count": 1,
                "failures": [f"ledger is not valid JSON: {e}"]}

    # (a) JSON Schema validation (catches the math-role conditional rules
    #     that the script validator does not check)
    import jsonschema

    schema = json.loads(SCHEMA_FILE.read_text())
    validator = jsonschema.Draft202012Validator(schema)
    for err in sorted(validator.iter_errors(ledger), key=lambda e: list(e.absolute_path)):
        loc = "/".join(str(p) for p in err.absolute_path) or "(root)"
        msg = err.message
        if len(msg) > 300:
            msg = msg[:300] + "..."
        failures.append(f"SCHEMA {loc}: {msg}")

    # (b) script validator in a temp ROOT with the expected layout
    with tempfile.TemporaryDirectory(prefix="qe-validate-") as tmp:
        blind = Path(tmp) / "quality-engine" / "audits" / "albedo-v231-blind"
        blind.mkdir(parents=True)
        posts = Path(tmp) / "src" / "content" / "posts"
        posts.mkdir(parents=True)
        shutil.copy(ledger_path, blind / ledger_path.name)
        os.symlink(POSTS_DIR / f"{slug}.md", posts / f"{slug}.md")
        proc = subprocess.run(
            [sys.executable, str(VALIDATOR_SCRIPT), tmp],
            capture_output=True, text=True, check=False,
        )
        try:
            out = json.loads(proc.stdout)
            failures.extend(out.get("failures", []))
        except json.JSONDecodeError:
            failures.append(
                f"validator script unparsable output: {proc.stdout[:400]} {proc.stderr[:400]}"
            )

    result = {"failure_count": len(failures), "failures": failures}
    hist_path = rd / "validator-history.json"
    hist = json.loads(hist_path.read_text()) if hist_path.exists() else []
    hist.append({"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), **result})
    hist_path.write_text(json.dumps(hist, indent=1))
    return result


def run_ledger_validator(run_dir: str) -> str:
    """Validate the run's ledger against the v2.3 schema and the blind-ledger
    validator script (anchors, enums, sha256, remediation rules).

    Args:
        run_dir: Run directory, e.g. "quality-engine/agents/runs/vortex-based-mathematics".
            Must contain "<slug>-albedo-ledger.json" where <slug> is the
            directory name.

    Returns:
        JSON string: {"failure_count": int, "failures": [verbatim failure
        strings]}. failure_count 0 means fully green.
    """
    try:
        result = validate_ledger(run_dir)
    except Exception as e:  # noqa: BLE001
        result = {"failure_count": 1, "failures": [f"validator error: {e}"]}
    res = json.dumps(result, indent=1)
    _log("run_ledger_validator", {"run_dir": run_dir}, res)
    return res


def patch_ledger(run_dir: str, patches_json: str) -> str:
    """Apply small targeted edits to the run's ledger — ALWAYS prefer this
    over rewriting the whole file (full rewrites risk JSON syntax errors).

    Args:
        run_dir: Run directory, e.g. "quality-engine/agents/runs/vortex-based-mathematics".
        patches_json: JSON string: a list of patch operations. Each op is one of:
          {"op": "set", "claim_id": "C007", "field": "claim_mode", "value": "DECLARED-METAPHOR"}
            — set a field on one claim; dotted paths work, e.g.
            field "math.locks.consequence" or "anchor.line_start".
          {"op": "set_anchor", "claim_id": "C018", "line_start": 42,
           "line_end": 42, "quote": "<verbatim substring>"}
            — replace a claim's whole anchor.
          {"op": "set_top", "field": "source_sha256", "value": "<64 hex>"}
            — set a top-level ledger field.
          {"op": "fix_locks_key", "claim_id": "C012"}
            — repair a misspelled math.locks key (e.g. "conference" ->
            "consequence") by renaming any non-standard lock key to the
            missing standard one.

    Returns:
        Summary of applied patches, or an error message. The ledger is
        re-serialized as strict JSON after patching.
    """
    try:
        rd = _resolve_run_dir(run_dir)
        slug = rd.name
        ledger_path = rd / f"{slug}-albedo-ledger.json"
        ledger = json.loads(ledger_path.read_text())
        patches = json.loads(patches_json)
        if not isinstance(patches, list):
            return "ERROR: patches_json must be a JSON array of ops"

        def find_claim(cid: str):
            for c in ledger.get("claims", []):
                if c.get("id") == cid:
                    return c
            return None

        applied, errors = [], []
        for i, p in enumerate(patches):
            op = p.get("op")
            cid = p.get("claim_id")
            claim = find_claim(cid) if cid else None
            if op in ("set", "set_anchor", "fix_locks_key") and claim is None:
                errors.append(f"patch {i}: claim {cid} not found")
                continue
            if op == "set":
                parts = str(p["field"]).split(".")
                node = claim
                for part in parts[:-1]:
                    node = node.setdefault(part, {})
                node[parts[-1]] = p["value"]
                applied.append(f"set {cid}.{p['field']}")
            elif op == "set_anchor":
                claim["anchor"] = {
                    "line_start": int(p["line_start"]),
                    "line_end": int(p["line_end"]),
                    "quote": str(p["quote"]),
                }
                applied.append(f"set_anchor {cid}")
            elif op == "set_top":
                ledger[p["field"]] = p["value"]
                applied.append(f"set_top {p['field']}")
            elif op == "fix_locks_key":
                locks = claim.get("math", {}).get("locks", {})
                standard = {"correctness", "consequence", "provenance"}
                missing = standard - set(locks)
                extra = [k for k in locks if k not in standard]
                if missing and extra:
                    locks[next(iter(missing))] = locks.pop(extra[0])
                    applied.append(f"fix_locks_key {cid}: {extra[0]} -> {next(iter(missing))}")
                else:
                    errors.append(f"patch {i}: no lock-key repair needed for {cid}")
            else:
                errors.append(f"patch {i}: unknown op {op!r}")

        ledger_path.write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + "\n")
        res = json.dumps({"applied": applied, "errors": errors}, ensure_ascii=False)
    except Exception as e:  # noqa: BLE001
        res = f"ERROR: {e}"
    _log("patch_ledger", {"run_dir": run_dir, "patches": patches_json[:800]}, res)
    return res


def append_claims(run_dir: str, claims_json: str) -> str:
    """Append new claims to the run's ledger. Claim ids are assigned
    automatically (continuing the C00N sequence) — do NOT include "id".

    Args:
        run_dir: Run directory, e.g. "quality-engine/agents/runs/vortex-based-mathematics".
        claims_json: JSON string: an array of claim objects, each with keys
            anchor, claim_mode, claim_status, remediation_codes,
            requires_review, math, rationale, legacy (same shape as the
            ledger's existing claims, minus "id").

    Returns:
        Summary with the ids assigned, or an error message.
    """
    try:
        rd = _resolve_run_dir(run_dir)
        slug = rd.name
        ledger_path = rd / f"{slug}-albedo-ledger.json"
        ledger = json.loads(ledger_path.read_text())
        new_claims = json.loads(claims_json)
        if not isinstance(new_claims, list):
            return "ERROR: claims_json must be a JSON array of claim objects"
        required = {"anchor", "claim_mode", "claim_status", "remediation_codes",
                    "requires_review", "math", "rationale", "legacy"}
        # Strict per-claim validation against the schema's claim definition,
        # so malformed claims are rejected instead of corrupting the ledger.
        import jsonschema
        claim_schema = json.loads(SCHEMA_FILE.read_text())["$defs"]["claim"]
        claim_schema = {**claim_schema,
                        "definitions": json.loads(SCHEMA_FILE.read_text()).get("$defs", {})}
        for i, c in enumerate(new_claims):
            if not isinstance(c, dict):
                return (f"ERROR: new claim {i} is not an object. Each claim must "
                        f"have keys: {sorted(required)} (plus no 'id').")
            missing = required - set(c)
            if missing:
                return (f"ERROR: new claim {i} missing keys: {sorted(missing)}. "
                        "Every claim needs anchor {line_start,line_end,quote}, "
                        "claim_mode, claim_status, remediation_codes, "
                        "requires_review, math {role,load_bearing,locks,"
                        "evidence_eligible}, rationale, legacy — all as proper "
                        "objects/arrays with valid enum values.")
            probe = {"id": "C999", **c}
            errs = list(jsonschema.Draft202012Validator(
                {"$ref": "#/$defs/claim", "$defs": claim_schema["definitions"]}
            ).iter_errors(probe))
            if errs:
                msgs = "; ".join(
                    f"{'/'.join(str(p) for p in e.absolute_path) or '(root)'}: {e.message[:120]}"
                    for e in errs[:4])
                return (f"ERROR: new claim {i} fails schema: {msgs}. Fix the "
                        "claim and retry append_claims.")
        max_n = 0
        for c in ledger.get("claims", []):
            cid = str(c.get("id", ""))
            if cid.startswith("C") and cid[1:].isdigit():
                max_n = max(max_n, int(cid[1:]))
        assigned = []
        for i, c in enumerate(new_claims):
            missing = required - set(c)
            if missing:
                return f"ERROR: new claim {i} missing keys: {sorted(missing)}"
            max_n += 1
            cid = f"C{max_n:03d}"
            c = {"id": cid, **c}
            ledger["claims"].append(c)
            assigned.append(cid)
        ledger_path.write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + "\n")
        res = json.dumps({"appended": assigned, "total_claims": len(ledger["claims"])})
    except Exception as e:  # noqa: BLE001
        res = f"ERROR: {e}"
    _log("append_claims", {"run_dir": run_dir, "claims_preview": claims_json[:800]}, res)
    return res
