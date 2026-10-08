"""Build a source-hashed catalogue. Requires the existing PyYAML runtime."""
from pathlib import Path
import csv, hashlib, json, re
from collections import Counter
import yaml
ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
baseline = json.loads((ROOT/'.agents/skills/tryambakam-editorial/references/baseline-catalogue.json').read_text())
previous = {v['slug']: v for v in baseline['blog']}
queue_path = Path.home()/'.codex/editorial/tryambakam/queue.json'
queue = json.loads(queue_path.read_text())
items = queue if isinstance(queue,list) else queue['items']
prior_catalogue = json.loads((OUT/'catalogue.json').read_text()) if (OUT/'catalogue.json').exists() else {'posts':[]}
prior_reviews = {p['slug']: p for p in prior_catalogue['posts']}
overlap = json.loads((OUT/'platform-overlap.json').read_text()) if (OUT/'platform-overlap.json').exists() else {}
supplements = json.loads((OUT/'series-plan.json').read_text()).get('episodes',[]) if (OUT/'series-plan.json').exists() else []
rows=[]
for path in sorted((ROOT/'src/content/posts').glob('*.md')):
    raw=path.read_text(); parts=raw.split('---',2); meta=yaml.safe_load(parts[1]); body=parts[2]
    slug=path.stem; old=previous.get(slug,{})
    series=old.get('series','UNASSIGNED')
    refs=[]
    for item in items:
        source_text=json.dumps(item.get('sources',[]),ensure_ascii=False)
        if path.name in source_text or '/posts/'+slug in json.dumps(item,ensure_ascii=False):
            refs.append({'id':item['id'],'platform':item.get('platform'), 'ledger_status':item.get('status'), 'evidence_scope':'local ledger; platform state may differ'})
    kind=meta.get('entry_kind','card-journey' if meta.get('card') else 'essay')
    navigation=kind in ['hub','reference'] or 'transcript' in slug or 'diagrams' in slug
    risk=series in ['G','B','E'] or any(x in slug for x in ['trauma','endocrine','quantum','morphic','water','magnetic','noetic'])
    row={'slug':slug,'title':meta['title'],'series':series,'source_path':str(path.relative_to(ROOT)), 'source_sha256':hashlib.sha256(raw.encode()).hexdigest(),'body_words':len(re.findall(r'\S+',body)), 'date':str(meta.get('date','')), 'kind':kind,'card':str(meta.get('card','')), 'draft':bool(meta.get('draft',False)), 'hidden':bool(meta.get('hidden',False)), 'blog_url':'https://synchronocities.tryambakam.space/posts/'+slug+'/', 'baseline_changed':old.get('sha256')!=hashlib.sha256(raw.encode()).hexdigest(), 'ledger_matches':refs, 'substack_status':'ledger match: refresh native status' if any(v['platform']=='substack' for v in refs) else 'no matched local receipt; historical semantic overlap check required', 'x_status':'ledger match: refresh native status' if any(v['platform']=='x' for v in refs) else 'unknown: full account history not audited', 'reddit_status':'unknown: full account history not audited', 'adaptation_route':'supporting map/source link' if navigation else 'standalone supplement + Note + X sequence; Reddit discussion when appropriate', 'review_gate':'targeted empirical/mathematical/quotation review' if risk else 'source close-read and platform overlap check', 'review_scope':'full file indexed; candidate close-read pending', 'baseline_series_provenance':baseline['snapshot']}
    row['substack_status'] = overlap.get('known_overlap_sources',{}).get(slug,row['substack_status'])
    row['supplementary_episode_ids'] = [e['id'] for e in supplements if slug in e['source_slugs']]
    prior = prior_reviews.get(slug,{})
    if prior.get('source_sha256') == row['source_sha256']:
        row['review_scope'] = prior.get('review_scope',row['review_scope'])
    rows.append(row)
summary={'total':len(rows),'public_candidates':sum(not r['draft'] and not r['hidden'] for r in rows),'series_counts':dict(Counter(r['series'] for r in rows)),'changed_since_baseline':sum(r['baseline_changed'] for r in rows), 'navigation_count':sum(r['adaptation_route']=='supporting map/source link' for r in rows)}
(OUT/'catalogue.json').write_text(json.dumps({'schema':'tryambakam.distribution.catalogue.v1','date':'2026-10-08','method':'complete local file inventory; baseline series assignments retained; ledger matches are not platform absence proof','queue_sha256':hashlib.sha256(queue_path.read_bytes()).hexdigest(),'summary':summary,'posts':rows},indent=2,ensure_ascii=False)+'\n')
with (OUT/'catalogue.csv').open('w') as f:
    fields=[k for k in rows[0] if k!='ledger_matches'];w=csv.DictWriter(f,fieldnames=fields,lineterminator="\n");w.writeheader();w.writerows({k:r[k] for k in fields} for r in rows)
print(json.dumps(summary,indent=2));assert len(rows)==len(set(r['slug'] for r in rows));assert all(r['series']!='UNASSIGNED' for r in rows)
