#!/usr/bin/env python3
"""Read-only source census; writes only inventory and snapshots in this folder."""
from pathlib import Path
import subprocess,json,re,hashlib,collections
ROOT=Path.cwd();OUT=ROOT/'docs/editorial/corpus-refresh-2026-10-09';RUNTIME=Path('/Users/sheshnarayaniyer/.codex/editorial/tryambakam')
START='2026-06-09';END='2026-10-09'; records=[]; exclusions=[]
def sha(s):return hashlib.sha256(s.encode()).hexdigest()
def body(s):return re.sub(r'\A---\r?\n.*?\r?\n---\r?\n','',s,flags=re.S)
def field(s,k):
 m=re.search(r'^'+re.escape(k)+r':\s*(.*)$',s,re.M);return m.group(1).strip().strip('\'\"') if m else ''
def git(*args):return subprocess.run(['git',*args],capture_output=True,text=True)
BASE=git('rev-list','-1','--before='+START+'T00:00:00','HEAD').stdout.strip()
def add(p,text,kind,title='',status='',eligible=True,extra=None):
 n=len(records)+1;slug=re.sub('[^a-zA-Z0-9._-]+','-',str(title or Path(p).stem)).strip('-')[:90]
 ident=f'{n:03d}-{slug}';snap=OUT/'snapshots'/(ident+'.md');snap.parent.mkdir(exist_ok=True,parents=True);snap.write_text(text)
 rec={'id':ident,'source_path':str(Path(p).resolve()),'kind':kind,'title':title or field(text,'title') or next((l[2:] for l in text.splitlines() if l.startswith('# ')),Path(p).stem),'sha256':sha(text),'body_sha256':sha(body(text)),'words':len(body(text).split()),'bytes':len(text.encode()),'status':status or 'local candidate; external status not inferred','eligible':eligible,'hold':None if eligible else 'source or publication boundary requires review','snapshot_path':str(snap.relative_to(ROOT)),'candidate_output_path':str((OUT/'revisions'/(ident+'.md')).relative_to(ROOT)),'review_priority':1 if kind!='blog' else 2}
 if extra:rec.update(extra)
 records.append(rec)
for p in sorted((ROOT/'src/content/posts').glob('*.md')):
 text=p.read_text();old=git('show',BASE+':'+str(p.relative_to(ROOT)));head=git('show','HEAD:'+str(p.relative_to(ROOT)));d=field(text,'date')[:10]
 change='new' if old.returncode else 'body_changed' if body(text)!=body(old.stdout) else 'metadata_only' if text!=old.stdout else 'unchanged'
 dated=START<=d<=END
 logs=git('log','--since='+START,'--until='+END+'T23:59:59','--format=%H %aI','--',str(p.relative_to(ROOT))).stdout.splitlines()
 # If net body is unchanged, examine historical versions to catch reverted body changes.
 historical=False
 if change in ['metadata_only','unchanged'] and logs:
  original=body(old.stdout)
  for line in logs:
   version=git('show',line.split()[0]+':'+str(p.relative_to(ROOT)))
   if not version.returncode and body(version.stdout)!=original:historical=True;break
 include=dated or change in ['new','body_changed'] or historical
 extra={'frontmatter_date':d,'date_in_window':dated,'git_change_since_window':change,'historical_body_change_reverted':historical,'window_commits':logs,'dirty_current_snapshot':not head.returncode and text!=head.stdout,'entry_kind':field(text,'entry_kind'),'card':field(text,'card'),'draft_flag':field(text,'draft'),'eligibility_evidence':'date in window or body created/changed since window','publication_destination':'https://synchronocities.tryambakam.space/posts/'+p.stem+'/','frontmatter_sha256':sha(text[:-len(body(text))]) if body(text) else sha(text)}
 if include:add(p,text,'blog',field(text,'title'),extra=extra)
 else:exclusions.append({'source_path':str(p.relative_to(ROOT)),'reason':change+'; no in-window date or historical body change','frontmatter_date':d,'sha256':sha(text)})
# Complete owned editorial manuscripts and platform copy.
for p in sorted((ROOT/'docs/editorial/archive-distribution-2026-10-08/drafts').glob('*')):
 if p.name=='claim-sheet.md':continue
 if p.suffix=='.json':
  j=json.loads(p.read_text());text='# '+j.get('title',p.stem)+'\n\n'+'\n\n'.join(str(x) if isinstance(x,str) else x.get('text',x.get('body','')) for x in j.get('posts',[]))
 else:text=p.read_text()
 add(p,text,'prepared_adaptation',extra={'source_container_sha256':sha(p.read_text()),'publication_destination':p.stem.split('-')[0],'source_date':'2026-10-08'})
p=ROOT/'docs/editorial/voice-revision-2026-10-08/let-the-sentence-finish.md';add(p,p.read_text(),'revision_candidate',status='revision of published pilot; exact approval required')
for p in sorted((ROOT/'docs/editorial').glob('cross-brand-*/items.json')):
 j=json.loads(p.read_text())
 for row in j['items']:
  add(p,row['body'],'prepared_social_copy',row.get('title') or row['id'],row.get('status',row.get('lifecycle','awaiting review')),extra={'source_record_id':row['id'],'source_container_sha256':sha(p.read_text()),'publication_destination':row.get('destination'),'platform':row.get('platform'),'brand':row.get('brand'),'existing_payload_sha256':row.get('payload_sha256'),'existing_review_sha256':row.get('review_sha256'),'media_review_hold':row.get('publication_review_readiness'),'source_date':j.get('date')})
# October7 predates structured items.json; take prose after destination and before media/operational notes.
p=ROOT/'docs/editorial/cross-brand-2026-10-07/TODAY.md';text=p.read_text()
for m in re.finditer(r'^## ((?:TS|TN)-[^\n]+)\n(.*?)(?=^## |\Z)',text,re.S|re.M):
 title,section=m.groups();part=section.split('Destination:',1)[1].split('\n\n',1)[1]
 part=re.split(r'\n(?:- \[|Review fingerprint:|Exact carried|Approval target|Seven existing|Portrait Reel|Alternative to)',part,maxsplit=1)[0].strip()
 add(p,part,'prepared_social_copy',title,extra={'source_record_id':title.split(' — ')[0],'source_date':'2026-10-07','publication_destination':section.split('Destination:',1)[1].split('\n')[0].strip(),'source_container_sha256':sha(text)})
# Runtime packets and queue: copy only intended public prose, never auth/raw JSON or research.
queue_path=RUNTIME/'queue.json';queue=json.loads(queue_path.read_text());qrows=queue['items'];queue_hash=sha(queue_path.read_text())
for p in sorted((RUNTIME/'packets').rglob('*.json')):
 j=json.loads(p.read_text())
 if isinstance(j.get('body'),str) and j['body'].strip():add(p,j['body'],'runtime_packet',status=j.get('status','draft'),extra={'source_record_id':j.get('id'),'source_container_sha256':sha(p.read_text()),'publication_destination':j.get('destination'),'platform':j.get('platform'),'not_before':j.get('not_before'),'source_date':'2026-09-30 onward','runtime_copy_safety':'public-facing body only; raw packet excluded'})
for j in qrows:
 if isinstance(j.get('body'),str) and j['body'].strip():add(queue_path,j['body'],'queue_copy',status=j.get('status'),extra={'source_record_id':j.get('id'),'source_container_sha256':queue_hash,'publication_destination':j.get('destination'),'platform':j.get('platform'),'not_before':j.get('not_before'),'existing_payload_sha256':j.get('payload_sha256'),'existing_approved_payload_sha256':j.get('approved_payload_sha256'),'external_id':j.get('external_id'),'runtime_copy_safety':'public-facing body only; raw queue and approval authorization text excluded','status_evidence':'local ledger only; known drift requires native reconciliation'})
# Remaining complete repository draft manuscripts and ancillary copy packs.
paths=list((ROOT/'docs/editorial/substack/2026-10-launch').glob('[0-9][0-9]-*.md'))
paths += [ROOT/'docs/editorial/substack/2026-10-launch/five-field-worksheet.md',ROOT/'docs/editorial/profile-overhaul/2026-09-30/07-substack-reintroduction.md',ROOT/'docs/editorial/profile-overhaul/2026-09-30/reddit-discussion.md',ROOT/'docs/editorial/profile-overhaul/2026-09-30/instagram-carousel.md',ROOT/'docs/editorial/profile-overhaul/2026-09-30/publication-about.md',ROOT/'docs/editorial/profile-overhaul/2026-09-30/profile-copy.md',ROOT/'docs/editorial/noesis-programme-first-cycle-2026-10-02/the-answer-after-recognition.md',ROOT/'docs/editorial/noesis-programme-first-cycle-2026-10-02/recognition-return-card.md']
for p in sorted(paths):
 if p.exists():add(p,p.read_text(),'prepared_repository_draft',extra={'source_date':'2026-09-30 onward','copy_scope':'complete source file; operational framing must be kept outside any public revision'})
p=ROOT/'docs/editorial/profile-overhaul/2026-09-30/x-posts.json'
for x in json.loads(p.read_text())['posts']:add(p,x['body'],'prepared_social_copy',x['id'],extra={'source_record_id':x['id'],'platform':'x','source_date':'2026-09-30','source_container_sha256':sha(p.read_text())})
# Concept registry entries are tracked separately; source holds prevent invented manuscripts.
p=ROOT/'docs/editorial/concepts/claude-ideas-2026-09-30/registry.json';reg=json.loads(p.read_text());concepts=[]
for x in reg['items']:
 concepts.append({k:x.get(k) for k in ['id','title','kind','state','blockers','next_action','source_snapshot','target_slug']})
# Group exact prose copies without pretending near-duplicates are equivalent.
groups=collections.defaultdict(list)
for r in records:groups[r['body_sha256']].append(r['id'])
for r in records:
 r['exact_copy_group']=groups[r['body_sha256']];r['revision_representative']=groups[r['body_sha256']][0]
unique=[r for r in records if r['id']==r['revision_representative']]
counts=dict(collections.Counter(r['kind'] for r in records))
summary={'window_start':START,'window_end':END,'baseline_git_commit':BASE,'inventory_records':len(records),'unique_exact_prose_bodies':len(unique),'counts_by_kind':counts,'excluded_blog_records':len(exclusions),'concept_records':len(concepts),'concept_manuscripts_present':(p.parent/'manuscripts').exists(),'gananatha_hold':'await both long drafts','consecration_hold':'await named Agama/source','queue_sha256_before':queue_hash,'runtime_queue_unchanged':sha(queue_path.read_text())==queue_hash,'baseline_plan_release_exists':Path('/tmp/synchronocities-blog-release-20260930').exists(),'baseline_fallback':'.agents/skills/tryambakam-editorial/references/baseline-calendar.md','scope_limit':'Local practical census; external-only platform drafts not recovered; raw private research/client material/source extracts and audits excluded'}
payload={'schema':'noesis.corpus-refresh-inventory.v1','summary':summary,'records':records,'blog_exclusions':exclusions,'concept_development_holds_and_outlines':concepts,'excluded_categories':['audit,receipt,report,verification and source-manifest documents','source excerpts and intake conversation transcripts','raw private/client research and third-party sources','calendar concepts with no completed manuscript','creator studio/runtime dependencies','voice-reading historical snapshots retained as calibration, not new revisions']}
(OUT/'inventory.json').write_text(json.dumps(payload,indent=2,ensure_ascii=False)+'\n')
# Balanced source assignment, with drafts and articles separate.
for kind,rs in [('blogs',[r for r in unique if r['kind']=='blog']),('drafts',[r for r in unique if r['kind']!='blog'])]:
 (OUT/('inventory-'+kind+'.json')).write_text(json.dumps(rs,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(summary,indent=2))
