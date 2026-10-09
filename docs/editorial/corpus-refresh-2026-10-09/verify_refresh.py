#!/usr/bin/env python3
"""Verify the frozen corpus and separate candidates; never apply or enqueue copy."""
from pathlib import Path
import collections, difflib, hashlib, importlib.util, json, re

ROOT = Path(__file__).resolve().parents[3]
BASE = Path(__file__).resolve().parent
def sha(raw): return hashlib.sha256(raw).hexdigest()
def load(path): return json.loads(path.read_text())
def frontmatter(raw):
    match = re.match(br'\A---\r?\n.*?\r?\n---(?:\r?\n|$)', raw, re.S)
    return match.group(0) if match else b''
def links(text):
    return set(re.findall(r'https?://[^\s<>"\])]+',text))
def main():
    inventory=load(BASE/'inventory.json'); rows=load(BASE/'inventory-blogs.json')+load(BASE/'inventory-drafts.json')
    checks=[]; notes=[]
    def check(name, condition, detail=None):
        checks.append({'check':name,'passed':bool(condition),**({'detail':detail} if detail else {})})
    check('111 distinct representatives',len(rows)==111 and len({r['id'] for r in rows})==111)
    for row in inventory['records']:
        raw=(ROOT/row['snapshot_path']).read_bytes()
        check(row['id']+': frozen snapshot hash',sha(raw)==row['sha256'])
        original=Path(row['source_path'])
        expected=row.get('source_container_sha256') or row['sha256']
        # Plain repository files and extracted runtime bodies have different hashes.
        check(row['id']+': original container preserved',original.exists() and sha(original.read_bytes())==expected)
        check(row['id']+': representative exists',row['revision_representative'] in {r['id'] for r in rows})
    spec=importlib.util.spec_from_file_location('voice_audit',ROOT/'scripts/audit-editorial-voice.py')
    audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
    triage=[];introduced=collections.defaultdict(list); summary=collections.Counter();records=[]
    diff_dir=BASE/'diffs';diff_dir.mkdir(exist_ok=True)
    contract_hash=sha((ROOT/'docs/editorial/WRITER-CONTRACT.md').read_bytes())
    for row in rows:
        id=row['id']; source=(ROOT/row['snapshot_path']).read_bytes();path=ROOT/row['candidate_output_path']
        check(id+': candidate and review present',path.exists() and (BASE/'reviews'/f'{id}.json').exists())
        if not path.exists() or not (BASE/'reviews'/f'{id}.json').exists():continue
        raw=path.read_bytes(); text=raw.decode();before=source.decode();review=load(BASE/'reviews'/f'{id}.json')
        check(id+': review source hash',review['source_sha256']==sha(source))
        check(id+': review exact candidate hash',review['candidate_sha256']==sha(raw))
        check(id+': current skill',review['skill_version']=='2.18.0')
        check(id+': current contract',review.get('contract_id',review.get('contract'))=='noesis-writer-human-direction-2026-10-09-v2')
        check(id+': current contract bytes',review.get('contract_sha256')==contract_hash)
        check(id+': exact frontmatter',frontmatter(source)==frontmatter(raw))
        check(id+': no lost source URL',links(before)<=links(text),sorted(links(before)-links(text)))
        changed=raw!=source;summary['revised' if changed else 'unchanged']+=1
        summary[row['kind']+('_revised' if changed else '_unchanged')]+=1
        unresolved=review.get('unresolved_findings',[])
        summary['with_source_or_delivery_findings']+=bool(unresolved)
        diff=''.join(difflib.unified_diff(before.splitlines(True),text.splitlines(True),fromfile='source/'+id+'.md',tofile='candidate/'+id+'.md'))
        (diff_dir/(id+'.diff')).write_text(diff or '# Complete contextual review: copy retained unchanged.\n')
        oldparas=set(p.strip() for p in before.split('\n\n'))
        for para in text.split('\n\n'):
            p=para.strip()
            if len(p)>100 and p not in oldparas and not p.startswith(('#','|','```')):introduced[p].append(id)
        triage.append({'id':id,'source_findings':audit.scan(before),'candidate_findings':audit.scan(text),'scope':'Pattern prompts only; no voice-fit or authorship score.'})
        records.append({'id':id,'kind':row['kind'],'title':row['title'],'candidate':row['candidate_output_path'],'source':row['snapshot_path'],'changed':changed,'verdict':review['verdict'],'unresolved_findings':unresolved,'candidate_sha256':sha(raw)})
    repeated=[{'paragraph':p,'ids':ids} for p,ids in introduced.items() if len(set(ids))>1]
    (BASE/'PATTERN-TRIAGE.json').write_text(json.dumps({'scope':'All111 frozen representatives and local candidates; contextual prompts only.','records':triage,'introduced_repeated_paragraphs':repeated},indent=2,ensure_ascii=False)+'\n')
    for entry in load(BASE/'PRESERVATION.json')['sources']:
        check('preservation: '+entry['path'],sha(Path(entry['path']).read_bytes())==entry['sha256'])
    package=load(BASE/'WRITER-PACKAGE.json')
    for entry in package['files']:
        archived=ROOT/entry['path'];relative=archived.relative_to(BASE/'writer-package-v2.18.0')
        for target in (archived,Path(package['canonical'])/relative,Path(package['mirror'])/relative):
            check('writer package: '+str(target),sha(target.read_bytes())==entry['sha256'])
    independent=[]
    for p in sorted((BASE/'independent').glob('*.json')):
        data=load(p)
        for rec in data if isinstance(data,list) else data.get('records',[]):
            if rec.get('id'): independent.append(rec)
    coverage={r['id']:r for r in independent}
    for row in rows:
        rec=coverage.get(row['id']);path=ROOT/row['candidate_output_path']
        check(row['id']+': independent whole-piece record',rec is not None)
        if rec:
            check(row['id']+': independent current candidate',rec.get('candidate_sha256')==sha(path.read_bytes()))
            check(row['id']+': independent source hash',rec.get('source_sha256')==row['sha256'])
            check(row['id']+': independent full reading',rec.get('full_source_read') and rec.get('full_candidate_read'))
    # Thread ordering is the six paragraphs after its editorial heading.
    thread=(BASE/'revisions/079-x-thread.md').read_text().strip().split('\n\n')[1:]
    check('X thread six ordered posts',len(thread)==6)
    check('X thread basic character envelope',all(len(p)<=280 for p in thread),[len(p) for p in thread])
    check('One pilot alternative, not two releases',(BASE/'revisions/077-substack-companion.md').read_bytes()==(BASE/'revisions/080-let-the-sentence-finish.md').read_bytes())
    result={'schema':'noesis.corpus-refresh-verification.v1','scope':'Local latest-writer revision package. Structural/source/coverage checks do not certify empirical claims or publication readiness.','summary':dict(summary),'independent_records':len(coverage),'checks':checks,'passed':all(c['passed'] for c in checks),'failures':[c for c in checks if not c['passed']],'source_claims':'Unresolved findings remain explicit per-piece. No clinical, historical, mathematical or autobiographical literature-verification PASS inferred.','public_actions':[]}
    (BASE/'VERIFICATION.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    (BASE/'REVIEW-INDEX.json').write_text(json.dumps({'records':records,'aliases':[{'id':r['id'],'representative':r['revision_representative'],'source':r['snapshot_path']} for r in inventory['records']]},indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'passed':result['passed'],'summary':result['summary'],'independent_records':len(coverage),'checks':len(checks),'failures':result['failures'][:8],'introduced_repeat_groups':len(repeated)}))
if __name__=='__main__':main()
