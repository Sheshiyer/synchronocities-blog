import copy, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import calendar_runner as c
p=c.pipeline

class ContextTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.blog=self.root/'blog';self.posts=self.blog/'src/content/posts';self.posts.mkdir(parents=True)
  self.editorial=self.blog/'docs/editorial';self.editorial.mkdir(parents=True);self.contract=self.editorial/'WRITER-CONTRACT.md';self.contract.write_text(p.CONTRACT_ID)
  self.writer=self.root/'writer';self.writer.mkdir();(self.writer/'SKILL.md').write_text('Noesis v'+p.SKILL_VERSION)
  for rel in p.GUIDANCE[1:]:q=self.writer/rel;q.parent.mkdir(exist_ok=True,parents=True);q.write_text('Relevant guidance '+rel)
  self.muse=self.editorial/'nine-muses-2026-10-08/registry.json';self.muse.parent.mkdir();self.muse.write_text(json.dumps({'profiles':[{'id':x,'responsibility':'Review '+x,'blog_series':[]} for x in p.MUSES]}))
  (self.posts/'a.md').write_text('---\ntitle: A\ndate: 2026-10-08\ndraft: false\n---\nA body café\n')
  (self.posts/'b.md').write_text('---\ntitle: B\ndate: 2026-10-07\ndraft: false\n---\nB body\n')
  (self.posts/'private.md').write_text('---\ntitle: private\ndate: 2026-10-09\ndraft: true\n---\nPrivate\n')
  self.observed='2026-10-09T00:00:00+00:00';self.proj=p.inventory(self.blog,self.observed)
  self.patch=patch.object(p,'WRITER_ROOT',self.writer);self.patch.start();self.addCleanup(self.patch.stop)
  self.cp=patch.object(c,'WRITER_CONTRACT_PATH',self.contract);self.cp.start();self.addCleanup(self.cp.stop)
 def tearDown(self):self.tmp.cleanup()
 def bundle(self):return p.prepare_day(self.blog,'2026-10-09',self.proj,self.observed,self.contract)
 def packet(self):
  b=self.bundle();context=b['context_bundle'];context['unresolved_findings']=[];context['muse_coverage']['disposition']={'reviewed':True,'reviewer':'fixture-agent','reviewer_kind':'agent','reason':'Fixture local source review covers missing reports','missing':list(p.MUSES),'mode':'local-source-review'}
  row={'id':'pilot','status':'draft','platform':'x','kind':'post','account':'@tester','destination':'https://x.com/tester','target_url':None,'audience':'public','send_email':False,'body':'Actual authored fixture','media':[],'sources':[{'path':s['path'],'sha256':s['sha256']} for s in context['sources']],'context_bundle':context,'asset_manifest':b['asset_manifest'],'not_before':self.observed}
  row['writer_review']={k:b[k] for k in ['package_sha256','contract_sha256','skill_version','contract']};row['writer_review'].update(context_sha256=p.digest(context),assets_sha256=p.digest(row['asset_manifest']),payload_sha256=c.queue.digest(row),semantic_review=True,source_coverage=True,reviewer='fixture-human-reviewer',verdict='ready-for-human-review',unresolved_findings=[])
  return row
 def test_actual_bytes_and_private_eligibility(self):
  b=self.bundle();s=b['context_bundle']['sources'][0];self.assertEqual(s['passages'][0]['text'],Path(s['path']).read_text());self.assertEqual(b['source_id'],'blog:a');self.assertIsNone(b['authoring']['body']);self.assertFalse(next(x for x in self.proj['records'] if x['id']=='blog:private')['eligible'])
 def test_brand_rotation_and_unused_source(self):
  a=self.bundle();b=p.prepare_day(self.blog,'2026-10-10',self.proj,self.observed,self.contract,[a]);self.assertNotEqual(a['brand'],b['brand']);self.assertEqual(b['status'],'held-source-selection');self.assertEqual(b['lead_count'],0)
  e=self.editorial/'thoughtseed-public.md';e.write_text('Public project evidence');ev=[{'id':'public:thoughtseed-pilot','title':'Thoughtseed project','brand':'thoughtseed','source_kind':'public-project-evidence','path':str(e),'sha256':p.sha(e.read_bytes()),'access':'publication-eligible','provenance':{'classification':'fixture-public-evidence'}}]
  b=p.prepare_day(self.blog,'2026-10-10',self.proj,self.observed,self.contract,[a],evidence=ev);self.assertEqual(b['source_id'],'public:thoughtseed-pilot');self.assertEqual(b['lead_count'],1)
  following=p.prepare_day(self.blog,'2026-10-11',self.proj,self.observed,self.contract,[a]);self.assertEqual(following['source_id'],'blog:b')
 def test_replay_and_drift(self):
  state=self.root/'state';a=c.preparation(state,'prepare-day',self.blog,'2026-10-09');self.assertEqual(a,c.preparation(state,'prepare-day',self.blog,'2026-10-09'))
  (self.posts/'a.md').write_text((self.posts/'a.md').read_text()+'changed')
  with self.assertRaisesRegex(ValueError,'inputs changed'):c.preparation(state,'prepare-day',self.blog,'2026-10-09')
  self.assertEqual(json.loads((state/'preparation/assignment-2026-10-09.json').read_text()),a)
 def test_missing_muse_explicit_hold(self):
  self.muse.write_text('{"profiles":[]}');b=self.bundle();self.assertEqual(len(b['context_bundle']['muse_coverage']['missing']),9)
  row=self.packet();row['context_bundle']['unresolved_findings']=[];row['context_bundle']['muse_coverage'].pop('disposition',None);row['writer_review']['context_sha256']=p.digest(row['context_bundle'])
  with self.assertRaisesRegex(ValueError,'deliberate reviewed disposition'):p.validate_packet(row,self.blog,self.contract)
  row['context_bundle']['muse_coverage']['disposition']={'reviewed':True,'reviewer':'fixture reviewer','reason':'Local reviewer covers missing reports for this bounded trial','missing':list(p.MUSES),'mode':'local-source-review','reviewer_kind':'agent'};row['writer_review']['context_sha256']=p.digest(row['context_bundle']);self.assertTrue(p.validate_packet(row,self.blog,self.contract))
 def test_enqueue_and_hash_bindings(self):
  row=self.packet();packet=self.root/'packet.json';c.atomic(packet,row);self.assertEqual(c.enqueue(self.root/'state',packet)['status'],'draft')
  for field in ['context_sha256','assets_sha256','package_sha256']:
   changed=copy.deepcopy(row);changed['writer_review'][field]='0'*64;c.atomic(packet,changed)
   with self.subTest(field=field),self.assertRaises(ValueError):c.enqueue(self.root/'state',packet)
  row['writer_review']['semantic_review']=False;c.atomic(packet,row)
  with self.assertRaisesRegex(ValueError,'semantic'):c.enqueue(self.root/'state',packet)
 def test_source_drift_and_false_passage(self):
  row=self.packet();s=row['context_bundle']['sources'][0];s['passages'][0]['text']='different';row['writer_review']['context_sha256']=p.digest(row['context_bundle'])
  with self.assertRaisesRegex(ValueError,'passage'):p.validate_packet(row,self.blog,self.contract)
  row=self.packet();Path(row['sources'][0]['path']).write_text('drift')
  with self.assertRaisesRegex(ValueError,'source changed'):p.validate_packet(row,self.blog,self.contract)
 def test_private_and_symlink_and_external(self):
  external=self.root/'private.md';external.write_text('private')
  for q in [external,Path('/etc/hosts')]:
   with self.assertRaises(ValueError):p.source(q,[self.posts],'test',{},self.observed)
  link=self.posts/'link.md';link.symlink_to(external)
  with self.assertRaises(ValueError):p.source(link,[self.posts],'test',{},self.observed)
  with self.assertRaisesRegex(ValueError,'private source'):p.source(self.posts/'a.md',[self.posts],'test',{},self.observed,access='private')
 def test_reviewed_asset_hash_and_payload_parity(self):
  image=self.blog/'public/test.png';image.parent.mkdir();image.write_bytes(b'image');manifest=self.root/'assets.json';asset={'id':'visual:test','path':str(image),'sha256':p.sha(image.read_bytes()),'reviewed':True,'reviewer':'fixture reviewer','access':'publication-eligible','role':'cover','alt':'Fixture'};manifest.write_text(json.dumps({'assets':[asset]}));a=p.assets(manifest,self.blog,self.observed);self.assertEqual(len(a['assets']),1)
  image.write_bytes(b'changed')
  with self.assertRaisesRegex(ValueError,'digest'):p.assets(manifest,self.blog,self.observed)
  asset['reviewed']=False;manifest.write_text(json.dumps({'assets':[asset]}));a=p.assets(manifest,self.blog,self.observed);self.assertEqual(a['assets'],[]);self.assertTrue(a['unresolved_findings'])
 def test_package_and_contract_drift(self):
  row=self.packet();(self.writer/'SKILL.md').write_text('changed')
  with self.assertRaisesRegex(ValueError,'current writer|package'):p.validate_packet(row,self.blog,self.contract)
 def test_canonical_unicode_recursive_sort(self):self.assertEqual(p.canonical({'z':{'b':2,'a':'é'},'a':1}),b'{"a":1,"z":{"a":"\xc3\xa9","b":2}}')


 def test_work_object_metadata_reconciliation_preserves_restrictions(self):
  registry=self.root/'work.json';registry.write_text(json.dumps({'generatedAt':'2026-10-01','status':'proposal','sourceInventory':[{'path':'private/not-opened','disposition':'source-hold'}],'operationalGaps':[{'workId':'sapling:private','tenantActivation':'not-authorized'}],'workObjects':[{'workId':'sapling:private','name':'Held project','kind':'sapling','promotionState':'proof-only','operationalAdmission':'needed','tenantIdentity':{'status':'unresolved'},'sourceRefs':['private:never-read']}]}))
  with patch.object(p,'PORTFOLIOS',(('thoughtseed',registry),)):
   projection=p.inventory(self.blog,self.observed);work=next(x for x in projection['records'] if x.get('workId')=='sapling:private');self.assertFalse(work['eligible']);self.assertEqual(work['sourceRefs'],['private:never-read']);self.assertEqual(projection['portfolio_projection']['registries'][0]['sourceInventory'][0]['disposition'],'source-hold')
 def test_private_body_inside_blog_cannot_be_relabelled(self):
  row=self.packet();s=row['context_bundle']['sources'][0];path=Path(s['path']);path.write_text(path.read_text().replace('draft: false','draft: true'));new=p.source(path,[self.posts],s['id'],s['provenance'],self.observed);row['context_bundle']['sources']=[new];row['sources']=[{'path':new['path'],'sha256':new['sha256']}];row['writer_review']['context_sha256']=p.digest(row['context_bundle'])
  with self.assertRaisesRegex(ValueError,'private/held'):p.validate_packet(row,self.blog,self.contract)

 def test_held_day_replay(self):
  state=self.root/'held-state';a=c.preparation(state,'prepare-day',self.blog,'2026-10-10');self.assertEqual(a,c.preparation(state,'prepare-day',self.blog,'2026-10-10'));self.assertEqual(a['lead_count'],0)
 def test_reviewed_external_original_requires_pinned_authorization(self):
  original=self.root/'approved-vault'/'source.md';original.parent.mkdir();original.write_text('Selected public passage.\nPrivate remainder never projected.')
  auth={'id':'approved','root_id':'fixture','path':str(original),'sha256':p.sha(original.read_bytes()),'start_byte':0,'end_byte':24,'access':'publication-eligible','reviewed':True,'reviewer_kind':'agent','reviewer':'fixture-agent','authorization_scope':'Selected context only'}
  ledger=self.editorial/'integrated-pipeline-2026-10-09/evidence-authorizations.json';ledger.parent.mkdir();ledger.write_text(json.dumps({'records':[auth]}))
  evidence={**auth,'id':'evidence:fixture','authorization_id':'approved'}
  with patch.object(p,'EVIDENCE_ROOTS',{'fixture':original.parent}):
   item=p.reviewed_evidence(evidence,self.blog,self.observed);self.assertEqual(item['passages'][0]['text'],'Selected public passage.');self.assertNotIn('Private remainder',item['passages'][0]['text'])
   changed={**evidence,'end_byte':30}
   with self.assertRaisesRegex(ValueError,'authorization mismatch'):p.reviewed_evidence(changed,self.blog,self.observed)
   original.write_text('changed original')
   with self.assertRaises(ValueError):p.reviewed_evidence(evidence,self.blog,self.observed)
  with self.assertRaisesRegex(ValueError,'authorization required'):p.reviewed_evidence({**evidence,'authorization_id':'unknown'},self.blog,self.observed)

class InstalledParityTests(unittest.TestCase):
 def test_installed_script_and_reference_parity(self):
  source=Path(__file__).resolve().parents[1];installed=Path.home()/'.codex/skills/tryambakam-editorial'
  if not installed.exists():self.skipTest('local installed skill not present')
  for rel in ['SKILL.md','scripts/calendar_runner.py','scripts/context_pipeline.py','references/source-context-pipeline.md','references/writer-foundation.md']:
   with self.subTest(path=rel):self.assertEqual((source/rel).read_bytes(),(installed/rel).read_bytes())

if __name__=='__main__':unittest.main()
