#!/usr/bin/env python3
"""Reproducible local prose-pattern triage. Does not classify authorship or approve copy."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    'negation-reframe': re.compile(r"\b(?:not|isn['’]t|aren['’]t)\b[^.!?\n]{0,160}\b(?:but|rather|instead)\b", re.I),
    'contrast-template': re.compile(r"\b(?:this|it) (?:is|isn['’]t|is not)\b[^.!?\n]{0,130}[.!?]\s*(?:this|it) (?:is|isn['’]t|is not)\b", re.I),
    'stock-transition': re.compile(r"\b(?:in short|at its core|it['’]s worth noting|the bottom line|delve into|foster a|leverage the)\b", re.I),
}

def scan(text):
    # Exclude frontmatter and fenced code; keep quotations as contextual review findings.
    body = re.sub(r'\A---\n.*?\n---\n', '', text, count=1, flags=re.S)
    body = re.sub(r'```.*?```', '', body, flags=re.S)
    findings = []
    for kind, pattern in PATTERNS.items():
        for match in pattern.finditer(body):
            findings.append({'kind': kind, 'excerpt': body[max(0, match.start()-45):match.end()+85].strip()})
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', body) if p.strip() and not p.lstrip().startswith(('#', '-', '*', '|', '>'))]
    run = []
    for paragraph in paragraphs + ['']:
        if paragraph and len(paragraph.split()) <= 18:
            run.append(paragraph)
        else:
            if len(run) >= 3:
                findings.append({'kind': 'short-paragraph-run', 'excerpt': '\n\n'.join(run[:6]), 'paragraphs': len(run)})
            run = []
    return findings

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    paths = sorted((ROOT / 'src/content/posts').glob('*.md'))
    paths += sorted((ROOT / 'docs/editorial/archive-distribution-2026-10-08/drafts').glob('*.md'))
    records = []
    for path in paths:
        raw = path.read_bytes()
        records.append({'path': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(raw).hexdigest(), 'findings': scan(raw.decode())})
    for path in [ROOT/'docs/editorial/archive-distribution-2026-10-08/drafts/x-thread.json', ROOT/'docs/editorial/cross-brand-2026-10-08/items.json']:
        data = json.loads(path.read_text())
        # Inspect only public prose fields, never internal policy/evidence paragraphs.
        def visit(value, pointer=''):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key in ('body', 'text') and isinstance(child, str):
                        records.append({'path': str(path.relative_to(ROOT))+'#'+pointer+'/'+key, 'sha256': hashlib.sha256(child.encode()).hexdigest(), 'findings': scan(child)})
                    elif isinstance(child, (dict, list)):
                        visit(child, pointer+'/'+key)
            elif isinstance(value, list):
                for index, child in enumerate(value):
                    if isinstance(child, str) and pointer == '/posts':
                        records.append({'path': str(path.relative_to(ROOT))+'#'+pointer+'/'+str(index), 'sha256': hashlib.sha256(child.encode()).hexdigest(), 'findings': scan(child)})
                    else:
                        visit(child, pointer+'/'+str(index))
        visit(data)
    report = {'schema': 'noesis.voice-triage.v1', 'contract': 'noesis-writer-human-direction-2026-10-08-v1', 'scope': 'Local blog archive and October 8 prepared platform copy; not a live ecosystem crawl', 'status': 'contextual-review-required', 'records': records, 'summary': {'records': len(records), 'flagged_records': sum(bool(r['findings']) for r in records), 'findings': sum(len(r['findings']) for r in records)}}
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report['summary']))

if __name__ == '__main__':
    main()
