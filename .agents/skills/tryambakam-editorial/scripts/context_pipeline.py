#!/usr/bin/env python3
"""Local source projection and reproducible editorial assignments. No authoring or approval."""
import datetime as dt
import hashlib
import json
import re
from pathlib import Path

SCHEMA='tryambakam.assignment-context.v1'
WRITER_ROOT=Path('/Volumes/madara/2026/twc-vault/.agents/skills/noesis-writer-skill')
CONTRACT_ID='noesis-writer-human-direction-2026-10-09-v4'
SKILL_VERSION='2.20.0'
MUSES=('polymnia','clio','euterpe','thalia','melpomene','erato','calliope','terpsichore','urania')
BRANDS=('tryambakam-noesis','thoughtseed')
PORTFOLIOS=(('tryambakam-noesis',Path('/Volumes/madara/2026/twc-vault/_System/00-meta/work-object-registry.tryambakam-noesis.v1.json')),('thoughtseed',Path('/Volumes/madara/2026/Projects/thoughtseed/thoughtseed-labs/00-meta/work-object-registry.v1.json')))
EVIDENCE_ROOTS={'vault-resources':Path('/Volumes/madara/2026/twc-vault/03-Resources'),'synchronocities-public':Path('/Volumes/madara/2026/Projects/tryambakam-noesis/synchronocities-blog')}
MAX_FILE=192_000
MAX_CONTEXT=800_000
GUIDANCE=('SKILL.md','references/integrated-understanding.md','references/young-source-understanding.md','references/contemporary-author-direction.md','references/aletheos-prana-inference-covenant.md','references/albedo-epistemic-grammar.md','references/cosmology-evolution-and-lexicon.md')

def canonical(value):
    return json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf-8')
def digest(value):return hashlib.sha256(canonical(value)).hexdigest()
def sha(data):return hashlib.sha256(data).hexdigest()
def package_hash(root=None):
    root=Path(root or WRITER_ROOT).resolve()
    if not (root/'SKILL.md').is_file():raise ValueError('writer package unavailable')
    paths=[p for p in root.rglob('*') if p.is_file() and not any(x in {'.git','__pycache__','.DS_Store'} for x in p.relative_to(root).parts)]
    if len(paths)>1000:raise ValueError('writer package exceeds bound')
    mapping={}
    for p in paths:
        if p.is_symlink() or not p.resolve().is_relative_to(root):raise ValueError('writer package symlink/out-of-root')
        mapping[p.relative_to(root).as_posix()]=sha(p.read_bytes())
    return digest(mapping)
def read_json(path,default=None):
    path=Path(path)
    if not path.exists():return default
    if path.stat().st_size>3_000_000:raise ValueError('registry exceeds bound')
    return json.loads(path.read_text())
def contained(path,roots):
    path=Path(path).expanduser()
    if not path.is_absolute():raise ValueError('absolute source path required')
    resolved=path.resolve(strict=True)
    if path.is_symlink() or not any(resolved.is_relative_to(Path(r).resolve()) for r in roots):raise ValueError('private/out-of-root source path')
    if any(x.startswith('.') for x in resolved.parts if x not in {'.agents','.codex'}):raise ValueError('hidden/private source path')
    return resolved

def source(path,roots,id,provenance,observed,access='publication-eligible',start=0,end=None):
    if access!='publication-eligible':raise ValueError('private source cannot enter assignment')
    path=contained(path,roots)
    if path.stat().st_size>8_000_000:raise ValueError('source exceeds bounded original-file read')
    data=path.read_bytes()
    if end is None and len(data)>MAX_FILE:raise ValueError('source exceeds direct-file bound; select an explicit reviewed passage')
    end=len(data) if end is None else end
    if not 0<=start<end<=len(data) or end-start>MAX_FILE:raise ValueError('invalid passage byte locator')
    text=data[start:end].decode('utf-8')
    passage={'start_byte':start,'end_byte':end,'start_line':data[:start].count(b'\n')+1,'end_line':data[:end].count(b'\n')+1,'text':text,'sha256':sha(data[start:end])}
    return {'id':id,'path':str(path),'sha256':sha(data),'access':access,'observedAt':observed,'provenance':provenance,'passages':[passage]}

def scalar(text,key,default=''):
    m=re.search(r'^'+re.escape(key)+r':\s*(.*)$',text,re.M)
    return m[1].strip().strip('"\'') if m else default

def inventory(blog,observed):
    blog=Path(blog).resolve();posts=blog/'src/content/posts';archive_path=blog/'docs/editorial/archive-distribution-2026-10-08/catalogue.json';census_path=blog/'docs/editorial/corpus-refresh-2026-10-09/inventory.json';concept_path=blog/'docs/editorial/concepts/claude-ideas-2026-09-30/registry.json'
    archive=read_json(archive_path,{'posts':[]});census=read_json(census_path,{'records':[]});concept=read_json(concept_path,{'items':[]})
    old={x['slug']:x for x in archive['posts']};aliases={str(Path(x['source_path']).resolve()):x for x in census['records'] if x.get('kind')=='blog'}
    records=[]
    for path in sorted(posts.glob('*.md')):
        path=contained(path.resolve(),[posts]);data=path.read_bytes()
        if len(data)>MAX_FILE:raise ValueError('blog source exceeds bounded inventory read')
        text=data.decode();fm=text.split('---',2)[1] if text.startswith('---') else '';prior=old.get(path.stem,{});a=aliases.get(str(path),{});eligible=scalar(fm,'draft','false').lower()!='true' and scalar(fm,'hidden','false').lower()!='true';issues=[]
        if prior.get('source_sha256') and prior['source_sha256']!=sha(data):issues.append('archive source changed; fresh context required')
        records.append({'id':'blog:'+path.stem,'aliases':[a['id']] if a else [],'kind':'blog','title':scalar(fm,'title',path.stem),'path':str(path),'sha256':sha(data),'series':prior.get('series'),'date':scalar(fm,'date'),'access':'publication-eligible' if eligible else 'held','eligible':eligible,'observedAt':observed,'provenance':{'registry':str(archive_path),'census':str(census_path) if a else None,'method':'current complete direct-file read; registry series retained, no platform absence or claim-verification inferred'},'unresolved_findings':issues,'publication_url':prior.get('blog_url')})
    # Concept pointers and census aliases remain metadata only, never fabricated manuscript text.
    for x in concept['items']:
        records.append({'id':'concept:'+str(x['id']),'kind':'concept','title':x['title'],'eligible':False,'access':'held','observedAt':observed,'provenance':{'registry':str(concept_path)},'unresolved_findings':x.get('blockers') or ['concept outline is not a complete publication source']})
    for x in census['records']:
        if x.get('kind')!='blog':
            records.append({'id':'census:'+x['id'],'aliases':x.get('exact_copy_group',[]),'kind':x.get('kind','prepared-draft'),'title':x.get('title','Untitled'),'eligible':False,'access':'held','observedAt':observed,'provenance':{'registry':str(census_path),'source_identity':x['id']},'unresolved_findings':[x.get('hold') or 'Prepared text requires explicit public-source classification and current writer review; no private body projected']})
    portfolios=portfolio_projection(observed)
    records.extend(portfolios['records'])
    return {'schema':'tryambakam.source-projection.v1','portfolio_projection':portfolios,'repository_census':repository_census(blog,portfolios['records']),'observedAt':observed,'records':records,'registries':[{'path':str(x),'sha256':sha(x.read_bytes())} for x in (archive_path,census_path,concept_path) if x.exists()],'limitations':['Current local sources only; external platform history not audited','Census revision eligibility does not confer publication approval','Private runtime drafts and client/reference dumps excluded']}

def portfolio_projection(observed):
    records=[];registries=[];missing=[]
    for brand,path in PORTFOLIOS:
        reg=read_json(path,None)
        if reg is None:missing.append(brand);continue
        provenance={'registry':str(path),'sha256':sha(path.read_bytes()),'generatedAt':reg.get('generatedAt'),'status':reg.get('status'),'authority':reg.get('authority')}
        registries.append({'brand':brand,**provenance,'sourceInventory':reg.get('sourceInventory',[]),'operationalGaps':reg.get('operationalGaps',[])})
        for x in reg.get('workObjects',[]):
            records.append({'id':'work:'+brand+':'+x['workId'],'workId':x['workId'],'title':x.get('name',x['workId']),'name':x.get('name'),'kind':x.get('kind'),'brand':brand,'promotionState':x.get('promotionState'),'operationalAdmission':x.get('operationalAdmission'),'tenantIdentity':x.get('tenantIdentity'),'sourceRefs':x.get('sourceRefs',[]),'eligible':False,'access':'restricted-metadata-only; source permission and current evidence required','observedAt':observed,'provenance':provenance,'unresolved_findings':['Registry classification is not permission to ingest a project/client body or claim live availability']})
    return {'schema':'tryambakam.portfolio-projection.v1','records':records,'registries':registries,'missing':missing,'scope':'Metadata only; no project/private/client body reads or operational activation'}

def repository_census(blog,work_records):
    path=Path.home()/'.codex/editorial/tryambakam/runs/2026-10-09-daily/evidence/github-pages-private.json'
    verification=Path(blog)/'docs/editorial/cross-brand-2026-10-09/VERIFICATION.json'
    if not path.exists():return {'available':False,'scope':'Existing dated repository census unavailable; no live API attempted'}
    pages=read_json(path,[]);repos=[x for page in pages for x in page];proof=read_json(verification,{})
    names={x.get('name','').casefold():x for x in repos};matches=[]
    for w in work_records:
        for ref in w.get('sourceRefs',[]):
            if ref.startswith('repo:') and ref[5:].casefold() in names:
                repo=names[ref[5:].casefold()];matches.append({'workId':w['workId'],'brand':w['brand'],'repository_id':repo.get('id'),'visibility':'private' if repo.get('private') else 'public','access':'metadata linkage only; body/disclosure not admitted'})
    return {'schema':'tryambakam.repository-census-link.v1','available':True,'path':str(path),'sha256':sha(path.read_bytes()),'observedAt':proof.get('verified_at','2026-10-09'),'observation_scope':'Inherited October9 read-only metadata census; not a new live API read','verification':{'path':str(verification.resolve()),'sha256':sha(verification.read_bytes()) if verification.exists() else None},'coverage':{'repositories':len(repos),'public':sum(not x.get('private',False) for x in repos),'private':sum(bool(x.get('private')) for x in repos),'forks':sum(bool(x.get('fork')) for x in repos),'workObject_links':len(matches)},'workObject_links':matches,'access':'Private census retained at original locator. Public visibility, affiliation and operational admission remain separate; no repository bodies ingested.'}

def cloud_assets(blog):
    path=Path(blog)/'docs/editorial/integrated-publishing-2026-10-09/CF-ASSET-PROJECTION.json';reg=read_json(path,None)
    if reg is None:return {'schema':'tryambakam.cloud-asset-context.v1','available':False,'unresolved_findings':['Cloud asset projection unavailable; no remote media assumed']}
    return {'schema':'tryambakam.cloud-asset-context.v1','available':True,'provenance':{'path':str(path.resolve()),'sha256':sha(path.read_bytes()),'observedAt':reg.get('observedAt')},'buckets':[{k:x.get(k) for k in ('bucket','project','purpose','access','live_bucket_verified','observedAt','limits')} for x in reg.get('buckets',[])],'field_report':reg.get('field_report'),'conflicts':reg.get('conflicts',[]),'scope':'Restricted metadata for selection only; no object body downloaded, reviewed or admitted by bucket existence'}

def muses(blog,observed):
    path=Path(blog)/'docs/editorial/nine-muses-2026-10-08/registry.json';reg=read_json(path,{'profiles':[]});profiles={p['id']:p for p in reg['profiles']};available=[x for x in MUSES if x in profiles]
    return {'required':list(MUSES),'available':[],'missing':list(MUSES),'registry_profiles':available,'profile_missing':[x for x in MUSES if x not in profiles],'availability_scope':'Fresh report availability, not role/profile existence. No Muse reports verified by this local preparation.','reports':[{'id':x,'status':'unknown/unverified','finding':'No fresh report supplied; a scoped local source review may cover this question'} for x in MUSES],'assignments':[{'id':x,'responsibility':profiles[x]['responsibility'],'series':profiles[x].get('blog_series',[]),'status':'role context assigned; report unknown/unverified'} for x in available],'registry':{'path':str(path.resolve()),'sha256':sha(path.read_bytes()) if path.exists() else None,'observedAt':observed}}

def assets(manifest,blog,observed):
    result={'schema':'tryambakam.reviewed-assets.v1','assets':[],'unresolved_findings':[]}
    if manifest is None:return result
    reg=read_json(manifest,{})
    if len(reg.get('assets',[]))>20:raise ValueError('asset list exceeds bound')
    for a in reg.get('assets',[]):
        if a.get('access')!='publication-eligible' or a.get('reviewed') is not True or not a.get('reviewer'):
            result['unresolved_findings'].append('asset not explicitly reviewed/publication-eligible: '+str(a.get('id',a.get('role','unnamed'))));continue
        path=contained(Path(a['path']),[Path(blog)/'public',Path(blog)/'docs/editorial']);data=path.read_bytes()
        if len(data)>25_000_000:raise ValueError('asset exceeds bound')
        if sha(data)!=a.get('sha256'):raise ValueError('asset digest mismatch')
        if not a.get('alt') and a.get('role')!='worksheet':raise ValueError('reviewed visual requires alt')
        result['assets'].append({'id':a.get('id',path.name),'path':str(path),'sha256':sha(data),'access':'publication-eligible','observedAt':a.get('observedAt',observed),'provenance':{'manifest':str(Path(manifest).resolve()),'sha256':sha(Path(manifest).read_bytes()),'source':a.get('provenance')},'reviewed':True,'reviewer':a['reviewer'],'role':a.get('role'),'alt':a.get('alt','')})
    return result

def reviewed_evidence(e,blog,observed):
    """External evidence needs a pinned, locally reviewed authorization; caller labels are insufficient."""
    ledger_path=Path(blog)/'docs/editorial/integrated-pipeline-2026-10-09/evidence-authorizations.json'
    ledger=read_json(ledger_path,{'records':[]})
    authorization=next((x for x in ledger['records'] if x.get('id')==e.get('authorization_id')),None)
    if not authorization or authorization.get('reviewed') is not True or authorization.get('reviewer_kind') not in {'agent','human'} or not authorization.get('reviewer') or not authorization.get('authorization_scope') or authorization.get('access')!='publication-eligible':raise ValueError('reviewed source authorization required')
    root=EVIDENCE_ROOTS.get(authorization.get('root_id'))
    if root is None:raise ValueError('unknown approved source root')
    for key in ('path','sha256','start_byte','end_byte'):
        if e.get(key)!=authorization.get(key):raise ValueError('source authorization mismatch: '+key)
    item=source(e['path'],[root],e['id'],e.get('provenance',{}),observed,start=e['start_byte'],end=e['end_byte'])
    if item['sha256']!=e['sha256']:raise ValueError('approved original source changed')
    item['authorization']={**authorization,'ledger_path':str(ledger_path.resolve()),'ledger_sha256':sha(ledger_path.read_bytes())}
    return item

def assemble(blog,row,observed,contract,asset_path=None,evidence=None,writer_root=None):
    blog=Path(blog).resolve();wr=Path(writer_root or WRITER_ROOT).resolve();contract=Path(contract).resolve()
    if not row.get('eligible') or row.get('access')!='publication-eligible':raise ValueError('source held')
    source_roots=[blog/'src/content/posts'] if row.get('kind')=='blog' else [blog/'docs/editorial']
    s=reviewed_evidence(row,blog,observed) if row.get('authorization_id') else source(row['path'],source_roots,row['id'],row['provenance'],observed)
    if s['sha256']!=row['sha256']:raise ValueError('inventory source drift')
    if f'v{SKILL_VERSION}' not in (wr/'SKILL.md').read_text() or CONTRACT_ID not in contract.read_text():raise ValueError('current writer/contract not installed')
    guidance=[]
    for rel in GUIDANCE:
        path=wr/rel
        if path.exists():guidance.append(source(path,[wr],'writer:'+rel,{'package_relative_path':rel},observed))
    for path,id in [(contract,'writer:contract'),(blog/'docs/VOICE.md','writer:voice'),(Path(__file__).resolve().parents[1]/'references/living-cosmology-context.md','writer:living-cosmology')]:
        if path.exists():guidance.append(source(path,[blog,Path(__file__).resolve().parents[1]],'writer:'+id.split(':')[-1],{'source':'current local editorial guidance'},observed))
    # Project evidence must be deliberately classified; arbitrary private paths are never inferred public.
    projects=[]
    for e in evidence or []:
        if e.get('access')!='publication-eligible':raise ValueError('private project evidence')
        projects.append(reviewed_evidence(e,blog,observed) if e.get('authorization_id') else source(e['path'],[blog/'docs/editorial',blog/'docs/INFRA.md'],e['id'],e.get('provenance',{}),e.get('observedAt',observed)))
        if projects[-1]['sha256']!=e.get('sha256'):raise ValueError('project evidence changed')
    coverage=muses(blog,observed);a=assets(asset_path,blog,observed)
    findings=list(row.get('unresolved_findings',[]))+['Human full-source and adjacent-draft review pending','Channel overlap and intended destination readback pending']
    if coverage['missing']:findings.append('Fresh Muse reports unknown/unverified; deliberate scoped local review needed: '+', '.join(coverage['missing']))
    findings+=a['unresolved_findings']
    context={'schema':SCHEMA,'sources':[s],'project_evidence':projects,'writer_guidance':guidance,'muse_coverage':coverage,'asset_projection':cloud_assets(blog),'portfolio_evidence':{'workObjects':[x for x in portfolio_projection(observed)['records'] if 'synchronocities-blog' in x['workId']],'scope':'Existing related project identities only; metadata is not runtime proof'},'unresolved_findings':findings}
    if len(canonical(context))>MAX_CONTEXT:raise ValueError('context bundle exceeds bound')
    return {'context_bundle':context,'asset_manifest':a,'package_sha256':package_hash(wr),'contract_sha256':sha(contract.read_bytes()),'context_sha256':digest(context),'assets_sha256':digest(a),'skill_version':SKILL_VERSION,'contract':CONTRACT_ID}

def prepare_day(blog,date,projection,observed,contract,previous=None,source_id=None,asset_path=None,evidence=None,writer_root=None):
    day=dt.date.fromisoformat(date);brand=BRANDS[(day-dt.date(2026,10,9)).days%len(BRANDS)];previous=previous or []
    eligible=[x for x in projection['records'] if x.get('eligible') and x.get('access')=='publication-eligible'] if brand=='tryambakam-noesis' else []
    if brand=='thoughtseed':
        for e in evidence or []:
            if e.get('brand')=='thoughtseed' and e.get('access')=='publication-eligible' and e.get('source_kind')=='public-project-evidence':
                eligible.append({**{k:e[k] for k in ('authorization_id','start_byte','end_byte') if k in e},'id':e['id'],'kind':'project-evidence','title':e.get('title',e['id']),'path':e['path'],'sha256':e['sha256'],'eligible':True,'access':'publication-eligible','provenance':e.get('provenance',{}),'unresolved_findings':[]})
        if not eligible:
            held={'schema':'tryambakam.daily-assignment.v1','id':'assignment:'+date,'date':date,'observedAt':observed,'brand':brand,'lead_count':0,'source_id':None,'status':'held-source-selection','authoring':{'body':None,'writer_review':None,'publication_approval':False},'context_bundle':{'schema':SCHEMA,'sources':[],'project_evidence':[],'writer_guidance':[],'muse_coverage':muses(blog,observed),'asset_projection':cloud_assets(blog),'unresolved_findings':['Thoughtseed day requires explicitly classified current Thoughtseed public-project evidence; registry metadata and a relabelled Noesis blog are insufficient']}}
            held['assignment_sha256']=digest(held);return held
    if source_id:eligible=[x for x in eligible if x['id']==source_id]
    used={x.get('source_id') for x in previous}
    eligible.sort(key=lambda x:(x['id'] in used,-int(re.sub(r'\D','',x.get('date','')[:10]) or '0'),x['id']))
    if not eligible:raise ValueError('no eligible complete source')
    row=eligible[0];bundle=assemble(blog,row,observed,contract,asset_path,evidence,writer_root)
    assignment={'schema':'tryambakam.daily-assignment.v1','id':'assignment:'+date,'date':date,'observedAt':observed,'brand':brand,'lead_count':1,'source_id':row['id'],'subject':row['title'],'adaptation_scope':'Technology/product/system inquiry for Thoughtseed; cosmological/symbolic inquiry for Tryambakam. The chosen source remains attributed; no project claims without evidence.','status':'prepared-context-only','channels':['substack','x'],'genre':'source-led supplementary essay and native-channel adaptation','authoring':{'body':None,'writer_review':None,'publication_approval':False,'meaning_axes':'author chooses relevant scale and exposure; no timeline mode imposed'},**bundle}
    assignment['assignment_sha256']=digest(assignment)
    return assignment

def validate_packet(row,blog,contract,writer_root=None):
    review=row.get('writer_review',{});context=row.get('context_bundle');a=row.get('asset_manifest')
    wr_current=Path(writer_root or WRITER_ROOT)
    if f'v{SKILL_VERSION}' not in (wr_current/'SKILL.md').read_text() or CONTRACT_ID not in Path(contract).read_text():raise ValueError('current writer/contract not installed')
    if not isinstance(context,dict) or context.get('schema')!=SCHEMA or not isinstance(a,dict) or a.get('schema')!='tryambakam.reviewed-assets.v1':raise ValueError('complete context/asset bundle required')
    if review.get('package_sha256')!=package_hash(writer_root):raise ValueError('writer package changed')
    if review.get('context_sha256')!=digest(context) or review.get('assets_sha256')!=digest(a):raise ValueError('context or assets changed after review')
    if review.get('semantic_review') is not True:raise ValueError('semantic writer review required')
    if context.get('unresolved_findings') or a.get('unresolved_findings'):raise ValueError('unresolved assignment context')
    coverage=context.get('muse_coverage',{});available=set(coverage.get('available',[]));missing=set(coverage.get('missing',[]))
    if available & missing or available | missing != set(MUSES):raise ValueError('incomplete Muse accounting')
    if missing:
        disposition=coverage.get('disposition',{})
        if disposition.get('reviewed') is not True or not disposition.get('reviewer') or not disposition.get('reason') or set(disposition.get('missing',[]))!=missing or disposition.get('mode')!='local-source-review' or disposition.get('reviewer_kind') not in {'agent','human'}:raise ValueError('missing Muse reports need deliberate reviewed disposition')
    wr=Path(writer_root or WRITER_ROOT).resolve();blog=Path(blog).resolve()
    selected=context.get('sources',[])
    required={'writer:'+x for x in GUIDANCE}|{'writer:contract'}
    if not required.issubset({x.get('id') for x in context.get('writer_guidance',[])}):raise ValueError('required current writer passages missing')
    if not selected:raise ValueError('missing actual source passages')
    for s in selected+context.get('project_evidence',[])+context.get('writer_guidance',[]):
        if s.get('access')!='publication-eligible':raise ValueError('private context source')
        roots=[wr] if s['id'].startswith('writer:') and Path(s['path']).resolve().is_relative_to(wr) else [blog/'src/content/posts',blog/'docs/editorial',blog/'docs/VOICE.md',blog/'docs/INFRA.md',Path(__file__).resolve().parents[1]/'references']
        if s.get('authorization'):
            auth=s['authorization'];verified=reviewed_evidence({'id':s['id'],'path':s['path'],'sha256':s['sha256'],'authorization_id':auth['id'],'start_byte':auth['start_byte'],'end_byte':auth['end_byte'],'provenance':s.get('provenance',{})},blog,s['observedAt'])
            if verified!=s:raise ValueError('reviewed evidence authorization changed')
            roots=[EVIDENCE_ROOTS[auth['root_id']]]
        path=contained(s['path'],roots);data=path.read_bytes()
        if sha(data)!=s.get('sha256'):raise ValueError('context source changed')
        if s in selected and path.is_relative_to(blog/'src/content/posts'):
            text=data.decode('utf-8');fm=text.split('---',2)[1] if text.startswith('---') else ''
            if scalar(fm,'draft','false').lower()!='false' or scalar(fm,'hidden','false').lower()!='false':raise ValueError('private/held blog source')
        if not s.get('passages'):raise ValueError('missing passage bytes')
        if len(s['passages'])>20:raise ValueError('passage count exceeds bound')
        for q in s['passages']:
            if not 0<=q['start_byte']<q['end_byte']<=len(data):raise ValueError('invalid passage byte locator')
            if q.get('start_line')!=data[:q['start_byte']].count(b'\n')+1 or q.get('end_line')!=data[:q['end_byte']].count(b'\n')+1:raise ValueError('passage line locator mismatch')
            actual=data[q['start_byte']:q['end_byte']]
            if actual.decode()!=q.get('text') or sha(actual)!=q.get('sha256'):raise ValueError('passage locator/hash mismatch')
    if {(s['path'],s['sha256']) for s in selected}!={(s['path'],s['sha256']) for s in row.get('sources',[])}:raise ValueError('payload sources differ from reviewed context')
    for x in a.get('assets',[]):
        if x.get('access')!='publication-eligible' or x.get('reviewed') is not True or not x.get('reviewer'):raise ValueError('unreviewed/private asset')
        path=contained(x['path'],[blog/'public',blog/'docs/editorial'])
        if sha(path.read_bytes())!=x.get('sha256'):raise ValueError('reviewed asset changed')
    if {(x['path'],x['sha256']) for x in a.get('assets',[])}!={(x['path'],x['sha256']) for x in row.get('media',[])}:raise ValueError('payload media differs from reviewed assets')
    return True
