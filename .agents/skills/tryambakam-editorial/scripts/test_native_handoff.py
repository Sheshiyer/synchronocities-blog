"""Synthetic disposable contracts only: no account, approval or platform effect is real."""
import copy
import datetime as dt
import json
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import calendar_runner as c
import native_handoff as n
import test_context_pipeline as fixtures

q = c.queue

class NativeTests(unittest.TestCase):
    bundle = fixtures.ContextTests.bundle
    packet = fixtures.ContextTests.packet

    def setUp(self):
        fixtures.ContextTests.setUp(self)
        self.now = dt.datetime.now(c.UTC)
        self.policy = dict(contract=c.WRITER_CONTRACT_ID, skill_version=c.WRITER_SKILL_VERSION,
                           contract_sha256=c.hashlib.sha256(self.contract.read_bytes()).hexdigest(),
                           package_sha256=c.pipeline.package_hash(self.writer))
        self.addCleanup(patch.stopall)
        patch.object(q, 'current_writer_policy', return_value=self.policy).start()
        self.row = self.packet()
        self.row.update(payload_version=2, title=None, transport='native-iab', delivery_mode='publish',
                        post_format='text',link_url=None,
                        timezone='UTC', scheduled_for=(self.now-dt.timedelta(minutes=3)).isoformat(),
                        not_before=(self.now-dt.timedelta(minutes=2)).isoformat(), writer_policy=self.policy)
        self.state = self.root/'state'
        self.snapshot = self.root/'fixture-snapshot.txt'
        self.snapshot.write_text('Synthetic TEST-ONLY native UI readback; no real publication or human approval.')
        self.seal()

    def tearDown(self): fixtures.ContextTests.tearDown(self)

    def seal(self):
        self.row['writer_review']['payload_sha256'] = q.digest(self.row)
        self.row.update(status='approved', approved_by='synthetic-human-fixture',
                        approved_at=(self.now-dt.timedelta(minutes=5)).isoformat(),
                        authorization_receipt='SYNTHETIC TEST ONLY; no external authorization')
        self.row['payload_sha256'] = self.row['approved_payload_sha256'] = q.digest(self.row)
        c.atomic(self.state/'queue.json', {'version':1, 'items':[self.row]})

    def read(self): return c.load(self.state/'queue.json', {})['items'][0]

    def observation(self, state='published'):
        row = self.read()
        # Simulate the production operator-observation schema entirely in a temporary fixture.
        return dict(schema='editorial.native-iab-observation.v1', source='native-iab-readback',
                    synthetic=False, operator='synthetic-test-operator', observed_at=dt.datetime.now(c.UTC).isoformat(),
                    payload_sha256=q.digest(row), state=state, native_id='123456',
                    public_url='https://x.com/tester/status/123456', view_url='https://x.com/settings/scheduled_tweets',
                    scheduled_for=row['scheduled_for'],
                    artifacts=[{'kind':'snapshot','path':str(self.snapshot),'sha256':c.hashlib.sha256(self.snapshot.read_bytes()).hexdigest()}],
                    **{k:row.get(k) for k in ('account','destination','title','body','media','link_url','post_format')})

    def observe(self, observation):
        path=self.root/'fixture-observation.json'; c.atomic(path, observation)
        return n.observe(self.state, self.row['id'], path)

    def test_legacy_digest_is_fixed(self):
        row=dict(platform='x',kind='post',account='@fixture',destination='https://x.com/fixture',target_url=None,
                 audience='public',send_email=False,body='Legacy fixture',media=[],sources=[])
        self.assertEqual(q.digest(row), 'ded0a0831a9fbbb454f341a4031d666a3970d05d3cd7ed2e11f3fa541702a0dd')
        self.assertEqual(q.digest({**row,'title':'not in legacy approval','not_before':'changed'}),q.digest(row))

    def test_v2_changed_fields_invalidate_approval(self):
        self.assertIsNone(q.check(self.row,self.now,intent='native-publish'))
        changes={'title':'changed','scheduled_for':self.now.isoformat(),'not_before':self.now.isoformat(),
                 'timezone':'Asia/Kolkata','account':'@other','destination':'https://x.com/other',
                 'media':[{'path':'/tmp/not-real','sha256':'0'*64}], 'sources':[], 'target_url':'https://x.com/other/status/2',
                 'writer_policy':{**self.policy,'contract_sha256':'0'*64}}
        for key,value in changes.items():
            with self.subTest(key=key): self.assertEqual(q.check({**self.row,key:value},self.now,intent='native-publish'),'payload changed after approval')
        with self.assertRaisesRegex(ValueError,'version'): q.digest({**self.row,'payload_version':99})
        for value in (None,123):
            with self.assertRaises(ValueError):q.instant(value)

    def test_draft_review_is_not_human_approval(self):
        self.row['status']='draft'; c.atomic(self.state/'queue.json', {'items':[self.row]})
        self.assertEqual(n.preview(self.state,self.row['id'])['status'],'needs-human-approval')
        with self.assertRaisesRegex(ValueError,'not approved'):n.claim(self.state,self.row['id'])

    def test_native_schedule_and_due_time_are_distinct(self):
        self.row.update(delivery_mode='schedule',scheduled_for=(self.now+dt.timedelta(days=2)).isoformat())
        self.seal(); self.assertIsNone(q.check(self.row,self.now,intent='native-schedule'))
        self.assertEqual(n.claim(self.state,self.row['id'])['status'],'claimed-native-handoff')
        observed=self.observation('scheduled')
        observed['scheduled_for']=q.instant(self.row['scheduled_for']).astimezone(dt.timezone(dt.timedelta(hours=5,minutes=30))).isoformat()
        self.assertEqual(self.observe(observed)['status'],'scheduled')
        self.assertNotIn('published_at',self.read())
        with self.assertRaises(ValueError): n.claim(self.state,self.row['id'])
        future=self.now+dt.timedelta(days=3)
        class Clock(dt.datetime):
            @classmethod
            def now(cls,tz=None):return future.astimezone(tz or c.UTC)
        observed=self.observation('published');observed['observed_at']=future.isoformat()
        with patch.object(n,'dt',types.SimpleNamespace(datetime=Clock,timedelta=dt.timedelta)):
            self.assertEqual(self.observe(observed)['status'],'published')

    def unknown_id_schedule(self):
        self.row.update(delivery_mode='schedule',scheduled_for=(self.now+dt.timedelta(days=2)).isoformat())
        self.seal(); n.claim(self.state,self.row['id'])
        observed=self.observation('scheduled')
        observed.update(native_id=None, view_url='https://x.com/compose/post/unsent/scheduled',
                        identity_kind='exact-payload-time-and-native-readback',
                        native_id_unavailable_reason='Native scheduled list and edit view expose no scheduled post ID.')
        # Disposable UI-shaped snapshot, not a claim of any real native effect.
        self.snapshot.write_text('Scheduled posts | @tester | '+self.row['scheduled_for']+' | '+self.row['body'])
        observed['artifacts'][0]['sha256']=c.hashlib.sha256(self.snapshot.read_bytes()).hexdigest()
        return observed

    def test_scheduled_unknown_native_id_preserves_unknown_identity(self):
        observed=self.unknown_id_schedule()
        observed['scheduled_for']=q.instant(self.row['scheduled_for']).astimezone(dt.timezone(dt.timedelta(hours=5,minutes=30))).isoformat()
        self.assertEqual(self.observe(observed)['status'],'scheduled')
        row=self.read(); receipt=c.load(Path(row['readback_evidence']),{})
        self.assertIsNone(row['external_id']); self.assertIsNone(receipt['native_id'])
        self.assertEqual(row['identity_kind'],'exact-payload-time-and-native-readback')
        self.assertEqual(receipt['native_id_unavailable_reason'],observed['native_id_unavailable_reason'])
        self.assertEqual(receipt['view_url'],observed['view_url'])
        self.assertEqual(q.instant(receipt['scheduled_for']),q.instant(self.row['scheduled_for']))
        self.assertNotIn('published_at',row)
        with self.assertRaises(ValueError):n.claim(self.state,self.row['id'])

    def test_unknown_id_schedule_requires_identity_reason_time_and_scheduled_view(self):
        for field,value in [('identity_kind',None),('native_id_unavailable_reason',''),
                            ('scheduled_for',(self.now+dt.timedelta(days=3)).isoformat()),
                            ('view_url','https://x.com/tester')]:
            with self.subTest(field=field):
                observed=self.unknown_id_schedule(); observed[field]=value
                self.assertEqual(self.observe(observed)['status'],'reconcile')
        observed=self.unknown_id_schedule();observed.pop('native_id')
        self.assertEqual(self.observe(observed)['status'],'reconcile')

    def test_published_readback_still_requires_native_id(self):
        n.claim(self.state,self.row['id']); observed=self.observation()
        observed.update(native_id=None,identity_kind='exact-payload-time-and-native-readback',
                        native_id_unavailable_reason='No ID exposed')
        self.assertEqual(self.observe(observed)['status'],'reconcile')

    def test_reddit_title_destination_and_unavailable_schedule(self):
        self.row.update(platform='reddit',kind='profile-post',account='u/tester',destination='https://www.reddit.com/user/tester')
        self.seal();self.assertEqual(q.check(self.row,self.now,intent='native-publish'),'Reddit title required')
        self.row.update(title='A synthetic test title',not_before=(self.now+dt.timedelta(days=1)).isoformat(),scheduled_for=(self.now+dt.timedelta(days=1)).isoformat());self.seal()
        self.assertEqual(q.check(self.row,self.now,intent='native-publish'),'not due')
        self.row['delivery_mode']='schedule';self.seal()
        self.assertIn('not verified',q.check(self.row,self.now,intent='native-schedule'))
        self.row.update(delivery_mode='publish',kind='community-post');self.seal()
        self.assertIn('destination',q.check(self.row,self.now,intent='native-publish'))

    def test_unresolved_review_and_file_drift_hold_claim(self):
        self.row['writer_review']['semantic_review']=False;self.seal()
        with self.assertRaisesRegex(ValueError,'semantic'):n.claim(self.state,self.row['id'])
        self.row['writer_review']['semantic_review']=True;self.seal();Path(self.row['sources'][0]['path']).write_text('drift')
        with self.assertRaisesRegex(ValueError,'changed'):n.claim(self.state,self.row['id'])

    def test_fake_or_mismatched_readback_reconciles(self):
        for field,value in [('synthetic',True),('body','wrong'),('artifacts',[]),('native_id','123')]:
            with self.subTest(field=field):
                self.seal();n.claim(self.state,self.row['id']);observed=self.observation();observed[field]=value
                self.assertEqual(self.observe(observed)['status'],'reconcile')
                with self.assertRaises(ValueError):n.claim(self.state,self.row['id'])
        self.seal();n.claim(self.state,self.row['id']);empty=self.root/'empty.json';empty.write_text('{"synthetic":true}')
        with self.assertRaisesRegex(ValueError,'v2 requires'):
            c.transition(self.state,'receipt',self.row['id'],external_id='fake',url='https://example.com',evidence=str(empty))

    def test_one_claim_and_duplicate_published_payload(self):
        n.claim(self.state,self.row['id'])
        with self.assertRaises(ValueError):n.claim(self.state,self.row['id'])
        self.assertEqual(self.observe(self.observation())['status'],'published')
        prior=self.read();duplicate=copy.deepcopy(self.row);duplicate['id']='duplicate'
        c.atomic(self.state/'queue.json',{'items':[prior,duplicate]})
        with self.assertRaisesRegex(ValueError,'already delivered'):n.claim(self.state,'duplicate')

    def test_legacy_scheduled_or_published_content_not_resubmitted_as_v2(self):
        for status in ('scheduled','published'):
            prior=copy.deepcopy(self.row)
            for key in q.V2_PAYLOAD[len(q.PAYLOAD):]:prior.pop(key,None)
            prior.update(id='legacy',status=status,published_at=self.now.isoformat())
            prior['payload_sha256']=q.digest(prior)
            self.seal();c.atomic(self.state/'queue.json',{'items':[prior,self.row]})
            with self.assertRaisesRegex(ValueError,'already delivered'):n.claim(self.state,self.row['id'])

    def test_semantic_duplicate_ignores_media_path_and_identity_case(self):
        prior={**self.row,'id':'scheduled-copy','status':'scheduled','account':'@TESTER','destination':'https://www.x.com/TESTER/',
               'body':'  '+self.row['body']+'\n','media':[{'path':'/old-location/video.mp4','sha256':'a'*64}]}
        changed={**self.row,'media':[{'path':'/new-location/video.mp4','sha256':'a'*64}]}
        self.assertEqual(q.native_content_identity(prior),q.native_content_identity(changed))
        self.assertEqual(q.native_content_identity(prior),q.native_content_identity({**changed,'destination':'https://twitter.com/tester'}))
        self.assertNotEqual(q.native_content_identity(prior),q.native_content_identity({**changed,'media':[{'path':'/new-location/video.mp4','sha256':'b'*64}]}))

    def test_legacy_cli_cannot_duplicate_native_schedule(self):
        prior={**self.row,'id':'native-prior','status':'scheduled'}
        legacy=copy.deepcopy(self.row)
        for key in q.V2_PAYLOAD[len(q.PAYLOAD):]:legacy.pop(key,None)
        legacy.update(id='legacy-next',destination='https://twitter.com/TESTER',not_before=self.row['not_before'])
        legacy['payload_sha256']=legacy['approved_payload_sha256']=q.digest(legacy)
        c.atomic(self.state/'queue.json',{'items':[prior,legacy]})
        with self.assertRaisesRegex(ValueError,'already delivered'):c.transition(self.state,'claim','legacy-next')

    def test_future_schedules_reserve_daily_ceiling(self):
        future=self.now+dt.timedelta(days=2)
        self.row.update(delivery_mode='schedule',scheduled_for=future.isoformat());self.seal()
        reservations=[dict(id='prior'+str(i),status='scheduled',scheduled_for=(future+dt.timedelta(minutes=i)).isoformat()) for i in range(2)]
        c.atomic(self.state/'queue.json',{'items':reservations+[self.row]})
        with self.assertRaisesRegex(ValueError,'daily ceiling'):n.claim(self.state,self.row['id'])
        self.assertEqual(n.row_at(self.state,self.row['id'])[0]['status'],'approved')
        today=[dict(status='published',published_at=self.now.isoformat()) for _ in range(2)]
        self.assertIsNone(n.native_cadence(today,self.row,self.now))

    def test_exact_public_file_authorization_and_product_assignment(self):
        source=self.root/'public-product.md';source.write_text('Public product evidence.\nExcluded remainder.')
        grant=dict(id='product:fixture',kind='evidence',path=str(source),sha256=c.pipeline.sha(source.read_bytes()),start_byte=0,end_byte=24,
                   public_source_url='https://example.com/pinned-public-source',work_id='sapling:fixture',access='publication-eligible',reviewed=True,
                   reviewer='fixture-agent',authorization_scope='Synthetic selected context only')
        catalog=self.editorial/'social-launches-2026-11-02/product-evidence-allowlist.json';catalog.parent.mkdir();catalog.write_text(json.dumps({'records':[grant]}))
        item={**grant,'product_authorization_id':grant['id']}
        actual=c.pipeline.product_source(self.blog,item,self.observed);self.assertEqual(actual['passages'][0]['text'],'Public product evidence.')
        for changed in [{**item,'path':'/etc/hosts'},{**item,'end_byte':30}]:
            with self.assertRaises(ValueError):c.pipeline.product_source(self.blog,changed,self.observed)
        result=c.pipeline.prepare_product(self.blog,'2026-11-03',grant['id'],self.observed,self.contract,writer_root=self.writer)
        self.assertEqual(result['source_id'],'product:fixture');self.assertIsNone(result['authoring']['body']);self.assertFalse(result['authoring']['publication_approval'])
        self.assertTrue(result['id'].startswith('product-assignment:'))
        real=source.read_bytes();source.unlink();source.symlink_to(self.posts/'a.md')
        with self.assertRaises(ValueError):c.pipeline.product_source(self.blog,item,self.observed)
        source.unlink();source.write_bytes(real+b'changed')
        with self.assertRaisesRegex(ValueError,'changed'):c.pipeline.product_source(self.blog,item,self.observed)

    def test_review_conversion_keeps_copy_and_holds_missing_binding_review(self):
        public={'text':'Unchanged synthetic public copy.'}
        review=dict(contract_id=c.WRITER_CONTRACT_ID,canonical_skill_version=c.WRITER_SKILL_VERSION,
                    contract_sha256=self.policy['contract_sha256'],canonical_skill_sha256=c.pipeline.sha((self.writer/'SKILL.md').read_bytes()),
                    publicCopy=public,public_copy_sha256=c.pipeline.digest(public),whole_output_read=True,
                    reviewer='synthetic-upstream-reviewer',verdict='ready-for-human-review',
                    human_approval=False,publication_authority=False,
                    source_coverage=[dict(path=str(self.contract),sha256=c.pipeline.sha(self.contract.read_bytes()),coverage='Synthetic fixture read')])
        assignment={'context_bundle':self.row['context_bundle'],'asset_manifest':self.row['asset_manifest']}
        settings={k:self.row.get(k) for k in q.V2_PAYLOAD if k not in ('body','title','media','sources','writer_policy','transport','payload_version')}
        settings['id']='converted'
        paths=[self.root/name for name in ['review.json','assignment.json','settings.json']]
        for path,data in zip(paths,[review,assignment,settings]):c.atomic(path,data)
        output=self.root/'converted.json'
        result=n.convert_reviewed(*paths,output,self.root,blog_root=self.blog)
        row=c.load(output,{})
        self.assertEqual(row['body'],public['text']);self.assertFalse(row['writer_review']['source_coverage'])
        self.assertEqual(result['status'],'held-for-binding-review');self.assertNotIn('approved_by',row)
        with self.assertRaisesRegex(ValueError,'unresolved|incomplete'):c.enqueue(self.state,output)
        binding={**result['proofs'],'source_coverage':True,'semantic_review':True,'reviewer':'synthetic-fixture-reviewer',
                 'verdict':'ready-for-human-review','unresolved_findings':[]}
        binding_path=self.root/'binding.json';c.atomic(binding_path,binding)
        ready=self.root/'ready.json'
        self.assertEqual(n.convert_reviewed(*paths,ready,self.root,binding_path,self.blog)['status'],'ready-for-human-review')
        self.assertEqual(c.enqueue(self.root/'new-state',ready)['status'],'draft')
        review['publicCopy']['text']='changed';c.atomic(paths[0],review)
        with self.assertRaisesRegex(ValueError,'public copy'):n.convert_reviewed(*paths,self.root/'bad.json',self.root,blog_root=self.blog)

if __name__=='__main__':unittest.main()
