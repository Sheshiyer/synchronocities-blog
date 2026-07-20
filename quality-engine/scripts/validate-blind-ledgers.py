#!/usr/bin/env python3
"""Validate the v2.3.1 blind-extraction ledgers in quality-engine/audits/albedo-v231-blind/.

Checks per ledger:
  1. Required top-level fields + exact enum values (schema_version, ledger_state, modes, statuses, locks)
  2. source_sha256 matches the current post bytes
  3. Every claim anchor: line_start/line_end within file, quote found verbatim in those lines
  4. RECERTIFIED => all requires_review false; failing statuses carry a non-KEEP remediation code
Usage: python3 quality-engine/scripts/validate-blind-ledgers.py
"""
import hashlib, json, re, sys, glob, collections

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
BLIND = f"{ROOT}/quality-engine/audits/albedo-v231-blind"
POSTS = f"{ROOT}/src/content/posts"

MODES = {"DIRECT-OBSERVATION","EMPIRICAL-CORRELATE","TRADITIONAL-SOURCE","HISTORICAL-CLAIM","HOUSE-MODEL","DERIVED-SYNTHESIS","DECLARED-METAPHOR"}
STATUSES = {"VERIFIED","ATTRIBUTED","COHERENT","DECLARED","UNSUPPORTED","CONTRADICTED","MISATTRIBUTED","MODE-CONFLATED"}
FAILING = {"UNSUPPORTED","CONTRADICTED","MISATTRIBUTED","MODE-CONFLATED"}
LOCKS = {"PASS","FAIL","UNASSESSED","NOT-APPLICABLE"}
MATH_ROLES = {"NONE","LOAD-BEARING","ANALOGICAL","DECORATIVE","WRONG"}

failures = []
stats = collections.Counter()

for path in sorted(glob.glob(f"{BLIND}/*-albedo-ledger.json")):
    slug = path.split("/")[-1].replace("-albedo-ledger.json", "")
    d = json.load(open(path))
    post_file = f"{POSTS}/{slug}.md"
    try:
        lines = open(post_file).read().splitlines()
        sha = hashlib.sha256(open(post_file, "rb").read()).hexdigest()
    except FileNotFoundError:
        failures.append(f"{slug}: post file missing")
        continue

    if d.get("schema_version") != "2.3": failures.append(f"{slug}: bad schema_version")
    if d.get("ledger_state") not in ("BOOTSTRAPPED", "RECERTIFIED"): failures.append(f"{slug}: bad ledger_state")
    if d.get("source_sha256") != sha: failures.append(f"{slug}: source_sha256 mismatch")
    if not re.match(rf"^quality-engine/audits/nigredo/{re.escape(slug)}\.md-nigredo-audit\.md$", d.get("legacy_audit_path", "")):
        failures.append(f"{slug}: legacy_audit_path malformed")

    states = [c.get("claim_status") for c in d.get("claims", [])]
    for i, c in enumerate(d.get("claims", [])):
        tag = f"{slug}: claim {i}"
        if c.get("claim_mode") not in MODES: failures.append(f"{tag}: bad mode {c.get('claim_mode')}")
        if c.get("claim_status") not in STATUSES: failures.append(f"{tag}: bad status {c.get('claim_status')}")
        a = c.get("anchor", {})
        ls, le, q = a.get("line_start"), a.get("line_end"), a.get("quote", "")
        if not (isinstance(ls, int) and isinstance(le, int) and 1 <= ls <= le <= len(lines)):
            failures.append(f"{tag}: anchor lines out of range ({ls}-{le})")
        elif q and q not in "\n".join(lines[ls - 1:le]):
            failures.append(f"{tag}: quote not found at cited lines")
        m = c.get("math", {})
        if m.get("role") not in MATH_ROLES: failures.append(f"{tag}: bad math role")
        for k in ("correctness", "consequence", "provenance"):
            if m.get("locks", {}).get(k) not in LOCKS: failures.append(f"{tag}: bad lock {k}")
        if c.get("claim_status") in FAILING and c.get("remediation_codes") == ["KEEP"]:
            failures.append(f"{tag}: failing status with KEEP-only remediation")
        if c.get("requires_review"): stats["requires_review"] += 1
    if d.get("ledger_state") == "RECERTIFIED" and any(c.get("requires_review") for c in d["claims"]):
        failures.append(f"{slug}: RECERTIFIED with requires_review rows")
    stats["ledgers"] += 1
    stats["claims"] += len(d.get("claims", []))

print(json.dumps({"ledgers": stats["ledgers"], "claims": stats["claims"],
                  "requires_review": stats["requires_review"],
                  "failure_count": len(failures), "failures": failures[:40]}, indent=1))
sys.exit(1 if failures else 0)
