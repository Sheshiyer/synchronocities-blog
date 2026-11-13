#!/usr/bin/env python3
"""Apply inspected exact-span editorial repairs to candidates only; no source edits."""
from pathlib import Path
import hashlib,json,sys
BASE=Path(__file__).resolve().parent
def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
    if len(sys.argv)!=2:raise SystemExit('usage: apply_review_repairs.py independent/<proposal>.json')
    path=(BASE/sys.argv[1]).resolve()
    if not path.is_relative_to(BASE/'independent'):raise SystemExit('Proposal must live in independent/.')
    data=json.loads(path.read_text());edits=data if isinstance(data,list) else data['edits']
    groups={}
    for e in edits:groups.setdefault(e['id'],[]).append(e)
    plan=[]
    for id,changes in groups.items():
        p=BASE/'revisions'/f'{id}.md';before=p.read_bytes();text=before.decode()
        for e in changes:
            if not e['before'] or text.count(e['before'])!=1:raise SystemExit(f'{id}: expected exactly one nonempty span')
            text=text.replace(e['before'],e['after'],1)
        if text==before.decode():continue
        if before.startswith(b'---\n') and text.split('\n---',1)[0]!=before.decode().split('\n---',1)[0]:raise SystemExit('Frontmatter change refused')
        plan.append((id,p,before,text,changes))
    ledger=[]
    for id,p,before,text,changes in plan:
        r=BASE/'reviews'/f'{id}.json';review=json.loads(r.read_text());assert review['candidate_sha256']==sha(before)
        p.write_text(text);review['candidate_sha256']=sha(p.read_bytes())
        review.setdefault('independent_followup_edits',[]).extend(changes)
        if 'exact_revision_trace' in review:review['exact_revision_trace'].extend(changes)
        review['followup_readback']='Independent reader proposals applied as exact unique spans; original full comparison plus final changed-span/context reread must be rebound to this candidate hash.'
        r.write_text(json.dumps(review,indent=2,ensure_ascii=False)+'\n')
        ledger.append({'id':id,'before_candidate_sha256':sha(before),'after_candidate_sha256':review['candidate_sha256'],'edits':changes,'publication_approval_transferred':False})
    receipt=BASE/'independent'/(path.stem+'-APPLIED.json')
    receipt.write_text(json.dumps({'proposal':str(path.relative_to(BASE)),'changes':ledger},indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'pieces':len(ledger),'exact_edits':sum(len(x['edits']) for x in ledger),'receipt':str(receipt)}))
if __name__=='__main__':main()
