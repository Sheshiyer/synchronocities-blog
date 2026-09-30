"""Seed a private playbook job; stop at exact human plan review."""
import argparse
import json
from pathlib import Path
from .controller import Controller
from .store import default_state_root, sha256_file

JOB_ID = "pilot-creator-editing-os-01"
BRIEF = """# Creator Editing Steward operational pilot

Build a durable local video workflow connected to the Editorial Steward.
The licensed PDF is a private operational reference, never authorial canon.
The chosen setup proof uses a synthetic test pattern, test-tone audio and
explicit fixture captions. It does not establish speech transcription accuracy.

Actual synthetic verification uses separate temporary test state. Its approvals
never become human editorial approval. This private job stops for plan review.
"""
PLAN = """# Proposed video workflow

Inspect durable state, exact source hashes and existing receipts before work.
Prepare the brief with the exact script, intended duration/format and scoped
original media. Run named create/prep operations and report actual capabilities.

Present the versioned edit plan for exact human approval. Build a draft with
shared frame-driven motion and the approved inputs. Supplied SRT cue times can
produce estimated within-cue word timing; this is never observed word alignment.
Inspect draft first/key/last frames and actual audio/video streams.

Present the exact draft and its render-input fingerprints for human approval.
Final rendering checks approved source, artifact, config, prepared-media and
composition hashes, and holds drift. Verify the actual output before saving a
final receipt and asset manifest. After interruption inspect/reconcile, then
reuse verified receipts rather than submitting duplicate work.

Attach verified final assets to an editorial DRAFT packet. Publication requires
its own exact-item approval and verified account/destination. This job grants
no publication authority. Cloud activation requires a proven execution
connection, declared budget and recovery demonstration; it remains unactivated.
"""

def seed(*, state_root=None, playbook_pdf=None):
    manifest = json.loads((Path(__file__).resolve().parents[2] / "source-manifest.json").read_text())
    pdf = Path(playbook_pdf or manifest["source"]).expanduser().resolve()
    if not pdf.is_file() or sha256_file(pdf) != manifest["sha256"]:
        raise ValueError("Playbook missing or changed; refresh its source manifest before seeding")
    ctl = Controller(state_root or default_state_root(), allowed_source_roots=[pdf])
    ctl.ensure_operator_token()
    existing = {j["job_id"]: j for j in ctl.list_jobs()}
    if JOB_ID in existing:
        return {"status": "already-seeded", "job_id": JOB_ID, "stage": existing[JOB_ID]["stage"]}
    ctl.create_job(JOB_ID, "Private Creator Editing Steward workflow pilot", [{"path": str(pdf), "label": "licensed private playbook", "classification": manifest["classification"]}], "seed-create")
    ctl.save_artifact(JOB_ID, "brief", BRIEF, "seed-brief")
    plan = ctl.save_artifact(JOB_ID, "plan", PLAN, "seed-plan")
    ctl.submit_for_approval(JOB_ID, "plan", "seed-submit")
    return {"status": "awaiting_plan_approval", "job_id": JOB_ID, "state_root": str(ctl.state_root), "plan_version": plan["version"], "plan_sha256": plan["sha256"], "human_approval_recorded": False}

def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-root")
    parser.add_argument("--playbook-pdf")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    if args.dry_run:
        print(json.dumps({"job_id": JOB_ID, "state_root": str(default_state_root()), "would_submit": "plan"}))
        return 0
    print(json.dumps(seed(state_root=Path(args.state_root).expanduser() if args.state_root else None, playbook_pdf=args.playbook_pdf), indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
