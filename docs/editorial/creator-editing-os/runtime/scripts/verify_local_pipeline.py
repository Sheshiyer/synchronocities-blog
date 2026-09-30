"""One actual synthetic pipeline, with explicitly test-only approvals.

Keeps private test state for restart inspection. Never opens the publication queue.
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ceos.controller import Controller
from ceos.studio_adapter import StudioAdapter, _ffprobe
from ceos.store import sha256_file

root = Path(tempfile.mkdtemp(prefix="ceos-independent-"))
sources = root / "sources"
sources.mkdir()
clip = sources / "synthetic-original.mp4"
shutil.copy2("/tmp/creator-editing-fixtures/synthetic-original.mp4", clip)
captions = sources / "synthetic.srt"
captions.write_text("1\n00:00:00,000 --> 00:00:03,000\nSynthetic test pattern\n\n2\n00:00:03,000 --> 00:00:07,000\n440 Hz test tone\n\n3\n00:00:07,000 --> 00:00:10,000\nNo observed speech\n")
job = "synthetic-verified"
ctl = Controller(root / "state", allowed_source_roots=[sources])
adapter = StudioAdapter(ctl)
ctl.create_job(job, "TEST-ONLY synthetic pipeline; no publishing", [
    {"path": str(clip), "label": "synthetic clip"},
    {"path": str(captions), "label": "synthetic SRT cue timings"},
], "create")

def run(action, **kwargs):
    result = adapter.run(action, job, **kwargs)
    assert result["ok"], (action, result)
    print(json.dumps({"step": action, "ok": True}), flush=True)
    return result

def approve(kind, saved):
    ctl.submit_for_approval(job, kind, f"{kind}-submit")
    ctl.record_operator_approval(job_id=job, stage_key=kind,
        approver="TEST-ONLY synthetic fixture operator",
        operator_token=ctl.ensure_operator_token(),
        expected_version=saved["version"], expected_sha256=saved["sha256"],
        note="TEST-ONLY approval; never human editorial approval", event_id=f"{kind}-approve")

run("create")
run("prep")
plan = ctl.save_artifact(job, "plan", json.dumps({
    "format": "9:16", "seconds": 10, "synthetic": True,
    "edit": "Show the full test pattern, supplied fixture captions and unchanged test-tone audio; no publishing",
}), "plan")
approve("plan", plan)
draft = run("draft", fixture_path=str(clip))
saved = ctl.save_artifact(job, "draft", json.dumps({
    "render_inputs": draft["render_inputs"], "artifacts": draft["artifacts"],
    "test_only": True,
}), "draft")
approve("draft", saved)
final = run("final", format="9:16")
output = Path(next(a["path"] for a in final["artifacts"] if a["path"].endswith("-final.mp4")))
probe = _ffprobe(output)
video = next(s for s in probe["streams"] if s["codec_type"] == "video")
audio = next(s for s in probe["streams"] if s["codec_type"] == "audio")
assert (video["width"], video["height"]) == (1080, 1920)
assert video["codec_name"] == "h264" and audio["codec_name"] == "aac"
assert abs(float(probe["format"]["duration"]) - 10) < 0.1
ctl.save_artifact(job, "final_evidence", json.dumps({
    "output_path": str(output), "output_sha256": sha256_file(output), "probe": probe,
}), "final-evidence")
restarted = Controller(root / "state", allowed_source_roots=[sources])
assert restarted.inspect(job)["state"]["stage"] == "finalized"
replayed = StudioAdapter(restarted).run("final", job, format="9:16")
assert replayed["ok"] and replayed["replayed"], replayed
# An actual config change must prevent cached success before any process launches.
config = adapter.studio_root / "assets" / "projects" / job / "job-config.json"
original = config.read_bytes()
try:
    config.write_bytes(original + b"\n")
    held = StudioAdapter(restarted).run("final", job, format="9:16")
    assert not held["ok"] and "render input drift" in " ".join(held["errors"]), held
finally:
    config.write_bytes(original)
receipt = {
    "status": "verified", "test_only": True, "state_root": str(root / "state"),
    "job_id": job, "final_path": str(output), "final_sha256": sha256_file(output),
    "dimensions": [video["width"], video["height"]], "fps": video["avg_frame_rate"],
    "duration": probe["format"]["duration"], "audio_codec": audio["codec_name"],
    "restart_inspection": True, "cached_replay": True, "config_drift_held": True,
    "manifest": str(root / "state" / "jobs" / job / "asset-manifest.json"),
    "source_sha256": sha256_file(clip), "no_public_write": True,
}
(root / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2), flush=True)
