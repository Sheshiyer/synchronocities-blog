#!/usr/bin/env python3
"""Rebuild the bounded publishing graph from committed evidence, without network or writes outside this folder."""
import collections, hashlib, json, pathlib
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parent.parent
DATE='2026-10-09'
def read(rel): return json.loads((ROOT/rel).read_text())
def ev(rel, observed=DATE):
 p=ROOT/rel
 return {'path':str(pathlib.Path('..')/pathlib.Path(rel).relative_to('docs')), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'observedAt':observed}
PROJ='docs/editorial/integrated-pipeline-2026-10-09/source-projection.json'
CF='docs/editorial/integrated-publishing-2026-10-09/CF-ASSET-PROJECTION.json'
MUSE='docs/editorial/nine-muses-2026-10-08/registry.json'
p=read(PROJ); cf=read(CF); muses=read(MUSE)['profiles']
nodes=[]; edges=[]
def node(id,type,label,status='configured',access='operator-reference',evidence=None,**attrs):
 nodes.append(dict(id=id,type=type,label=label,status=status,access=access,observedAt=DATE,evidence=evidence or [],**attrs))
def edge(a,r,b,status='documented',evidence=None,**attrs):
 edges.append(dict(id=f'{a}|{r}|{b}',source=a,relation=r,target=b,status=status,observedAt=DATE,evidence=evidence or [],**attrs))
def comp(id,type,label,status,rel=None,**attrs):
 node(id,type,label,status,evidence=[ev(rel)] if rel else [],**attrs)
comp('infrastructure:workflow-migration','infrastructure-state','GitHub Actions removed for local job migration','migration-pending-verification','docs/ecosystem/RECONCILIATION-STATE.json')
edge('ecosystem:publishing','records','infrastructure:workflow-migration')
comp('ecosystem:publishing','ecosystem','Noesis / Thoughtseed publishing projection','verified-local',PROJ)
for id,label in [('tryambakam-noesis','Tryambakam Noesis'),('thoughtseed','Thoughtseed')]:
 node('brand:'+id,'brand',label,'configured');edge('ecosystem:publishing','contains','brand:'+id)
comp('vault:twc','source-family','TWC vault','configured',PROJ,locator='/Volumes/madara/2026/twc-vault',access='mixed; exact source classification required')
for id,label,path in [('areas','Authored frameworks','02-Areas'),('resources','Attributed reference library','03-Resources'),('projects','Project evidence and mappings','01-Projects')]:
 node('vault:'+id,'source-family',label,'configured',locator='/Volumes/madara/2026/twc-vault/'+path,access='mixed; bounded source authorization required');edge('vault:twc','contains','vault:'+id)
comp('writer:canonical','skill','Noesis writer v2.20.0','verified-local','docs/editorial/integrated-writer-2026-10-09/PACKAGE.json',locator='/Volumes/madara/2026/twc-vault/.agents/skills/noesis-writer-skill/SKILL.md')
comp('writer:mirror','skill','Claude writer mirror','verified-local','docs/editorial/integrated-writer-2026-10-09/CHECKS.json',locator='/Volumes/madara/2026/twc-vault/.claude/skills/noesis-writer-skill/SKILL.md')
comp('writer:foundation','reference','Integrated philosophical and lexical understanding','verified-local','docs/editorial/integrated-writer-2026-10-09/writer-package-v2.20.0/references/integrated-understanding.md')
comp('writer:young','reference','Young primary source distinctions and OCR reading','verified-local','docs/editorial/integrated-writer-2026-10-09/READING.md',limits=['OCR reading is not facsimile verification; unreviewed videos remain unreviewed'])
comp('writer:contract','policy','Exact writer review contract v4','verified-local','docs/editorial/WRITER-CONTRACT.md')
edge('writer:canonical','mirrored-as','writer:mirror');edge('writer:foundation','informs','writer:canonical');edge('writer:young','grounds','writer:foundation');edge('vault:areas','informs','writer:foundation');edge('vault:resources','supplies-bounded-passages','writer:young');edge('writer:contract','governs','writer:canonical')
comp('inventory:sources','projection','343 source/project identities','verified-local',PROJ,counts={'eligible_blog':127,'held_concept_or_prepared':113,'restricted_work':103})
comp('inventory:repos','projection','331 repository metadata census','inherited-metadata',PROJ,coverage=p['repository_census']['coverage'],sourceObservedAt=p['repository_census']['observedAt'],limits=['Inherited read-only census; no new live GitHub read','Metadata links confer no body ingestion, runtime verification or disclosure authority'])
edge('vault:projects','classified-in','inventory:sources');edge('inventory:repos','linked-to','inventory:sources',count=44);edge('ecosystem:publishing','contains','inventory:sources')
for record in p['records']:
 work=record['id'].startswith('work:')
 kind='work-identity' if work else 'editorial-source'
 evidence=[ev(PROJ,record.get('observedAt',DATE))]
 attrs={k:record[k] for k in ['workId','brand','kind','series','publication_url','sha256','promotionState','operationalAdmission'] if k in record}
 if record.get('path'):attrs['locator']=record['path']
 node(record['id'],kind,record['title'],'restricted-metadata' if work else ('eligible-source' if record['eligible'] else 'held'),record['access'],evidence,**attrs)
 edge('inventory:sources','projects',record['id'])
 edge(record['id'],'belongs-to','brand:'+record.get('brand','tryambakam-noesis'))
 if not work and record['eligible']:edge(record['id'],'eligible-input-to','pipeline:bundle',status='eligible-not-approved')
 if work:edge('vault:projects','maps',record['id'],status='metadata-only')
for item in p['repository_census']['workObject_links']:
 rid='repository:'+str(item['repository_id'])
 if not any(n['id']==rid for n in nodes):
  node(rid,'repository-metadata','Repository ID '+str(item['repository_id']),'inherited-metadata',item['access'],[ev(PROJ)],visibility=item['visibility'])
  edge('inventory:repos','contains-linked-identity',rid)
 edge(rid,'metadata-link','work:'+item['brand']+':'+item['workId'],status='metadata-only')
comp('assets:cf','projection','Cloudflare purpose/access projection','verified-bucket-inventory',CF,counts={'account_buckets':20,'purpose_mappings':9,'field_report_objects':11})
edge('ecosystem:publishing','contains','assets:cf')
for b in cf['buckets']:
 id='r2:'+b['bucket'];node(id,'asset-store',b['bucket'],'bucket-exists' if b['live_bucket_verified'] else 'held-unresolved-account',b['access'],[ev(CF,b['observedAt'])],purpose=b['purpose'],project=b['project'],limits=b['limits'])
 edge('assets:cf','maps-purpose',id)
 name={'Synchronocities':'synchronocities-blog','Somatic Canticles':'somatic-canticles-webapp','Somatic Canticles book':'somatic-canticles-book','Urania':'urania-137'}.get(b['project'])
 if name:edge(id,'configured-for','work:tryambakam-noesis:sapling:'+name,status='configuration-only')
for m in cf['field_report']['media']:
 id='media:'+m['id'];node(id,'media',m['id'],'integrity-verified',m['access'],[ev(CF,m['observedAt'])],sha256=m['sha256'],size=m['size'],visual_review=m['visual_review']);edge('assets:cf','contains-private-media',id)
 edge(id,'requires-fit-review','review:exact',status='required')
comp('muses:registry','registry','Nine Muse roles','configured',MUSE,limits=['Profiles and historical briefs do not establish current reports or unattended Grok exchange'])
comp('muses:fresh-reports','finding','Fresh Muse reports','held-unverified','docs/editorial/integrated-pipeline-2026-10-09/PILOT-RECEIPT.json')
edge('vault:areas','grounds-role-context','muses:registry');edge('ecosystem:publishing','contains','muses:registry')
for m in muses:
 id='muse:'+m['id'];node(id,'editorial-role',m['name'],'role-configured',evidence=[ev(MUSE,'2026-10-08')],pillar=m['pillar'],categories=m['categories'],domains=m['domains'],fresh_report='unknown/unverified');edge('muses:registry','contains',id);edge(id,'may-contribute-to','muses:fresh-reports',status='unverified')
edge('muse:calliope','digest-input-to','schedule:daily',status='when-available')
comp('grok:handoff','transport','Native Grok unattended exchange','held-unverified','docs/editorial/integrated-publishing-2026-10-09/README.md')
edge('muses:fresh-reports','native-exchange-via','grok:handoff',status='unverified')
comp('retrieval:semantic','retrieval','Synchronocities semantic retrieval','held-403','docs/editorial/integrated-publishing-2026-10-09/RETRIEVAL-PROBE.json')
edge('retrieval:semantic','potential-input-to','pipeline:bundle',status='held-unverified-not-used')
comp('retrieval:direct','retrieval','Pinned direct source retrieval','verified-local','docs/editorial/integrated-pipeline-2026-10-09/evidence-authorizations.json')
edge('vault:resources','bounded-read-via','retrieval:direct');edge('retrieval:direct','supplies','pipeline:bundle')
comp('pipeline:bundle','pipeline','Compact assignment and context bundle','verified-local','docs/editorial/integrated-pipeline-2026-10-09/README.md')
comp('schedule:daily','automation','One lead daily at10:30 Europe/Paris','configured-active','docs/editorial/integrated-publishing-2026-10-09/AUTOMATION-READBACK.json',automationId='tryambakam-conversations-and-approved-publisher',timezone='Europe/Paris',future_run_verified=False)
edge('schedule:daily','prepares','pipeline:bundle');edge('schedule:daily','rotates','brand:tryambakam-noesis');edge('schedule:daily','rotates','brand:thoughtseed');edge('writer:canonical','reviews','pipeline:bundle');edge('assets:cf','selected-assets-feed','pipeline:bundle',status='individual-selection-required');edge('muses:fresh-reports','findings-feed','pipeline:bundle',status='when-available')
comp('field-report:site','review-surface','Owner-private Field Report','live-verified','docs/editorial/integrated-publishing-2026-10-09/DEPLOYMENT.json',url='https://field-report.witnessalchemist.chatgpt.site',access='owner-private')
comp('field-report:dynamic','persistence','Dynamic persisted candidates','live-verified','docs/editorial/integrated-publishing-2026-10-09/LIVE-VERIFICATION.json',access='owner-private')
comp('review:exact','checkpoint','Current semantic/context/assets/exact-copy review','live-verified','docs/editorial/integrated-publishing-2026-10-09/LIVE-VERIFICATION.json')
comp('review:hitl','human-decision','Questions and individual exact-item approval','live-verified','docs/editorial/integrated-publishing-2026-10-09/UI-VERIFICATION.json',access='owner-only human decision; service cannot approve', verification_scope=['live question persistence and presentation','service approval denial'], owner_login_approval_flow_tested=False)
comp('delivery:queue','handoff','Human-queued publication handoff','configured','docs/editorial/nine-muses-2026-10-08/DELIVERY-CONTRACT.md')
comp('delivery:receipt','receipt-boundary','Verified platform readback and receipt','documented','docs/editorial/nine-muses-2026-10-08/PUBLICATION-RECEIPT.json')
for a,r,b in [('pipeline:bundle','draft-ingestion-to','field-report:dynamic'),('field-report:dynamic','presented-on','field-report:site'),('field-report:dynamic','bound-to','review:exact'),('writer:contract','required-by','review:exact'),('review:exact','asks','review:hitl'),('review:hitl','authorizes-exact-item','delivery:queue'),('delivery:queue','requires','delivery:receipt')]:edge(a,r,b,status='approval-required' if a=='review:hitl' else 'documented')
for id,label in [('substack','Substack'),('x','X'),('reddit','Reddit')]:
 node('platform:'+id,'platform',label,'destination-configured',access='exact account/destination/capability approval required');edge('pipeline:bundle','meaning-preserving-adaptation','platform:'+id,status='candidate-only');edge('delivery:queue','may-deliver-to','platform:'+id,status='capability-and-approval-required');edge('platform:'+id,'readback-for','delivery:receipt',status='required')
comp('pilot:integration','candidate','Before the answer arrives','held','docs/editorial/integrated-publishing-2026-10-09/LIVE-VERIFICATION.json',access='owner-private',url='https://field-report.witnessalchemist.chatgpt.site/details?district=publishing&record=draft%3ATN-LIGHTED-CLEARING-INTEGRATION-PILOT-20261009&page=questions',holds=['overlap with existing published essay','carousel cover fit','fresh Muse reports unknown'])
comp('publication:sentence','publication','Let the Sentence Finish','published-readback-recorded','docs/editorial/nine-muses-2026-10-08/PUBLICATION-RECEIPT.json',url='https://thewhychromosome.substack.com/p/let-the-sentence-finish',publishedAt='2026-10-08T16:13:05.777Z',access='public')
edge('field-report:dynamic','contains','pilot:integration');edge('pilot:integration','requires','review:hitl',status='unanswered');edge('pilot:integration','overlaps','publication:sentence',status='editorial-hold');edge('publication:sentence','verified-by','delivery:receipt');edge('media:18409d8107f25e09','selected-for','pilot:integration',status='fit-held')
graph={'schema':'noesis.publishing-ecosystem.v1','observedAt':DATE,'scope':'Bounded current editorial/project projection; metadata does not grant access, activation or publication authority','statusVocabulary':sorted({n['status'] for n in nodes}),'nodes':nodes,'edges':edges,'limitations':p['limitations']+cf['conflicts']+['No new GitHub/API or Cloudflare inventory probe performed by graph generator','Source records retain their source identities; graph is a projection, not canonical operational truth','Semantic retrieval403; native Grok unattended exchange and fresh Muse reports unverified']}
ids=[n['id'] for n in nodes]
assert len(ids)==len(set(ids)), 'duplicate nodes'
assert len(edges)==len({e['id'] for e in edges}), 'duplicate edges'
assert all(e['source'] in ids and e['target'] in ids for e in edges), 'dangling edge'
(HERE/'ecosystem-map.json').write_text(json.dumps(graph,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'nodes':len(nodes),'edges':len(edges),'source_identities':len(p['records']),'work_identities':sum(n['type']=='work-identity' for n in nodes),'validation':'unique IDs and edge endpoints pass'}))
