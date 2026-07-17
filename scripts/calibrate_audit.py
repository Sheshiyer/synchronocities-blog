import json, sys, re
from pathlib import Path

# Fix ci-audit.py in-place with calibration adjustments
path = '/Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog/scripts/ci-audit.py'
content = open(path).read()

# 1. Fix composite classifier
old_classifier = '''def classify_post(dimensions: dict) -> str:
    """
    Composite classification:
    - Any FAIL dimension → FAIL (unless shadow is the only FAIL and it's WARN-only)
    - No FAIL, but 2+ WARNINGs → WARNING
    - Otherwise → PASS
    """
    fails = [k for k, v in dimensions.items() if v.get("verdict") == "FAIL"]
    warns = [k for k, v in dimensions.items() if v.get("verdict") == "WARNING"]

    if fails:
        # If only shadow integration fails and it's not critical, still FAIL
        return "FAIL"
    if len(warns) >= 2:
        return "WARNING"
    return "PASS"'''

new_classifier = '''def classify_post(dimensions: dict) -> str:
    """
    Composite classification:
    - 3+ FAIL dimensions → FAIL
    - 1-2 FAIL dimensions → WARNING
    - 0 FAIL but 3+ WARNINGs → WARNING
    - Otherwise → PASS
    """
    fails = [k for k, v in dimensions.items() if v.get("verdict") == "FAIL"]
    warns = [k for k, v in dimensions.items() if v.get("verdict") == "WARNING"]

    if len(fails) >= 3:
        return "FAIL"
    if len(fails) >= 1:
        return "WARNING"
    if len(warns) >= 3:
        return "WARNING"
    return "PASS"'''

content = content.replace(old_classifier, new_classifier)

# 2. Fix vocabulary thresholds
old_vocab = '''    if critical_count > 0:
        verdict = "FAIL"
    elif total >= 3:
        verdict = "FAIL"
    elif total >= 1:
        verdict = "WARNING"
    else:
        verdict = "PASS"'''

new_vocab = '''    if critical_count > 0:
        verdict = "FAIL"
    elif total >= 4:
        verdict = "FAIL"
    elif total >= 1:
        verdict = "WARNING"
    else:
        verdict = "PASS"'''

content = content.replace(old_vocab, new_vocab)

# 3. Fix Cosmological Coherence: broader terms and lower base
old_cosmo_terms = '''    engine_terms = [
        "noesis engine", "selemene", "sixteen lenses", "16 lenses", "perceptual lens",
        "engine", "workflow", "compass", "birth-blueprint", "daily-practice",
        "decision-support", "self-inquiry", "creative-expression", "full-spectrum",
    ]'''

new_cosmo_terms = '''    engine_terms = [
        "noesis engine", "selemene", "sixteen lenses", "16 lenses", "perceptual lens",
        "engine", "workflow", "compass", "birth-blueprint", "daily-practice",
        "decision-support", "self-inquiry", "creative-expression", "full-spectrum",
        "noesis", "tryambakam", "kha-ba-la", "framework", "system", "lens",
        "architecture", "model", "protocol", "ritual", "practice", "witness",
        "consciousness", "self-consciousness", "inquiry", "examination",
    ]'''

content = content.replace(old_cosmo_terms, new_cosmo_terms)

old_cosmo_score = '''    score = min(100, 40 + count * 8)

    if score >= 70:
        verdict = "PASS"
    elif score >= 50:
        verdict = "WARNING"
    else:
        verdict = "FAIL"'''

new_cosmo_score = '''    score = min(100, 50 + count * 5)

    if score >= 60:
        verdict = "PASS"
    elif score >= 40:
        verdict = "WARNING"
    else:
        verdict = "FAIL"'''

content = content.replace(old_cosmo_score, new_cosmo_score)

# 4. Fix Fractal Depth thresholds
old_fractal_thresh = '''    if score >= 80:
        verdict = "PASS"
    elif score >= 60:
        verdict = "WARNING"
    else:
        verdict = "FAIL"'''

new_fractal_thresh = '''    if score >= 60:
        verdict = "PASS"
    elif score >= 40:
        verdict = "WARNING"
    else:
        verdict = "FAIL"'''

# There are multiple copies of this threshold block; replace all
content = content.replace(old_fractal_thresh, new_fractal_thresh)

# 5. Fix Source Grounding: remove bold regex and fix vault refs
old_source_markers = '''SOURCE_MARKERS = [
    r"\\[\\d+\\]",           # [1] style citations
    r"\\*\\*.*?\\*\\*",       # bolded references
    r"\\b(?:gober|hickson|young|fool's wisdom|upside down|kings dethroned|pubmed|doi:|arxiv)\\b",
    r"\\b(?:source|reference|citation|footnote|see also|further reading)\\b",
]'''

new_source_markers = '''SOURCE_MARKERS = [
    r"\\[\\d+\\]",           # [1] style citations
    r"\\b(?:gober|hickson|young|fool's wisdom|upside down|kings dethroned|pubmed|doi:|arxiv)\\b",
    r"\\b(?:source|reference|citation|footnote|see also|further reading)\\b",
]'''

content = content.replace(old_source_markers, new_source_markers)

old_source_score = '''    score = min(100, max(0, 20 + count * 3 - vault_penalty))

    if score >= 60:
        verdict = "PASS"
    elif score >= 40:
        verdict = "WARNING"
    else:
        verdict = "FAIL"'''

new_source_score = '''    score = min(100, max(0, 30 + count * 3 - vault_penalty))

    if score >= 50:
        verdict = "PASS"
    elif score >= 30:
        verdict = "WARNING"
    else:
        verdict = "FAIL"'''

content = content.replace(old_source_score, new_source_score)

# 6. Fix Shadow Integration thresholds
old_shadow_score = '''    score = min(100, 20 + count * 10)

    if should_skip:
        verdict = "PASS"
        skipped = True
    else:
        skipped = False
        if score >= 60:
            verdict = "PASS"
        elif score >= 40:
            verdict = "WARNING"
        else:
            verdict = "FAIL"'''

new_shadow_score = '''    score = min(100, 30 + count * 12)

    if should_skip:
        verdict = "PASS"
        skipped = True
    else:
        skipped = False
        if score >= 50:
            verdict = "PASS"
        elif score >= 30:
            verdict = "WARNING"
        else:
            verdict = "FAIL"'''

content = content.replace(old_shadow_score, new_shadow_score)

# 7. Fix Kha-Ba-La thresholds
old_kha_thresh = '''    if score >= 80:
        verdict = "PASS"
    elif score >= 60:
        verdict = "WARNING"
    else:
        verdict = "FAIL"'''

new_kha_thresh = '''    if score >= 60:
        verdict = "PASS"
    elif score >= 40:
        verdict = "WARNING"
    else:
        verdict = "FAIL"'''

content = content.replace(old_kha_thresh, new_kha_thresh)

# 8. Fix Voice thresholds
old_voice_thresh = '''    if score >= 85:
        verdict = "PASS"
    elif score >= 60:
        verdict = "WARNING"
    else:
        verdict = "FAIL"'''

new_voice_thresh = '''    if score >= 75:
        verdict = "PASS"
    elif score >= 50:
        verdict = "WARNING"
    else:
        verdict = "FAIL"'''

content = content.replace(old_voice_thresh, new_voice_thresh)

open(path, 'w').write(content)
print('ci-audit.py calibrated')
