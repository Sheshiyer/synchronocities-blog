import datetime as dt, json, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import calendar_runner as c

class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        self.source = self.root / 'source.md'; self.source.write_text('source')
        self.row = dict(id='trial', platform='x', kind='post', account='@tester', destination='https://x.com/tester', target_url=None, audience='public', send_email=False, body='Exact text', media=[], sources=[{'path':str(self.source), 'sha256':c.hashlib.sha256(b'source').hexdigest()}], status='approved', approved_by='human', approved_at='2020-01-01T00:00:00+00:00', authorization_receipt='human exact item', not_before='2020-01-01T00:00:00+00:00')
        self.row['payload_sha256']=self.row['approved_payload_sha256']=c.queue.digest(self.row)
        self.state=self.root/'private'; self.save()
    def tearDown(self): self.tmp.cleanup()
    def save(self): c.atomic(self.state/'queue.json', {'version':1,'items':[self.row]})
    def status(self): return c.load(self.state/'queue.json',{})['items'][0]['status']
    def fake(self, mismatch=False, timeout=False, handle='tester'):
        def run(args, **kw):
            self.assertNotIn('--auth-token', args)
            cmd=args[4]
            if cmd=='whoami': out=f'user: @{handle} (Test)\nuser_id: 42\nengine: graphql\n'
            elif cmd=='tweet':
                if timeout: raise subprocess.TimeoutExpired(args,25)
                out='url: https://x.com/tester/status/123'
            else: out=json.dumps({'id':'123','text':'wrong' if mismatch else 'Exact text','author':{'username':'tester','name':'Test'},'authorId':'42'})
            return subprocess.CompletedProcess(args,0,out,'')
        return run
    def test_dry_run_no_claim(self):
        self.assertEqual(c.publish(self.state,'trial')['status'],'dry-run'); self.assertEqual(self.status(),'approved')
    def test_unapproved_changed_and_source_drift(self):
        for mutate in [lambda: self.row.update(status='draft'),lambda:self.row.update(body='Changed')]:
            mutate(); self.save(); self.assertEqual(c.publish(self.state,'trial')['status'],'held')
        self.row['body']='Exact text';self.row['status']='approved';self.save();self.source.write_text('drift')
        self.assertEqual(c.publish(self.state,'trial')['status'],'held')
    def test_unsupported_no_claim(self):
        self.row['kind']='article';self.row['payload_sha256']=self.row['approved_payload_sha256']=c.queue.digest(self.row);self.save()
        self.assertEqual(c.publish(self.state,'trial')['status'],'held');self.assertEqual(self.status(),'approved')
    @patch.object(c,'credentials',return_value={})
    def test_identity_mismatch(self,_):
        self.assertEqual(c.publish(self.state,'trial',True,self.fake(handle='other'))['status'],'held');self.assertEqual(self.status(),'approved')
    @patch.object(c,'credentials',return_value={})
    def test_verified_success(self,_):
        self.assertEqual(c.publish(self.state,'trial',True,self.fake())['status'],'published');self.assertEqual(self.status(),'published')
    @patch.object(c,'credentials',return_value={})
    def test_timeout_reconcile(self,_):
        self.assertEqual(c.publish(self.state,'trial',True,self.fake(timeout=True))['status'],'reconcile');self.assertEqual(self.status(),'reconcile')
    @patch.object(c,'credentials',return_value={})
    def test_readback_reconcile(self,_):
        self.assertEqual(c.publish(self.state,'trial',True,self.fake(mismatch=True))['status'],'reconcile')
    def test_calendar_dst(self):
        blog=Path(__file__).resolve().parents[4]
        a=c.plan('2026-10-01',blog);self.assertEqual(a['weeks'],26);self.assertTrue(a['article'].startswith('2026-10-08T10:00:00+02:00'));self.assertTrue(a['sources'])
        self.assertTrue(c.plan('2026-10-29',blog)['article'].endswith('+01:00'))
    def test_discovery_dedup_lock_and_replay(self):
        fixture=self.root/'fixture.json';c.atomic(fixture,[{'id':'123','text':'external'}]); now=dt.datetime.now(c.UTC)
        self.assertEqual(c.discover(self.state,fixture,now=now)['created'],['x:123'])
        self.assertEqual(c.discover(self.state,fixture,now=now+dt.timedelta(hours=1))['created'],[])
        folder=self.state/'discovery-fixture';(folder/'state.json').unlink()
        self.assertEqual(c.discover(self.state,fixture,now=now)['created'],[])
        self.assertEqual(len(list((folder/'packets').glob('*.json'))),1)
        with c.lock(folder,'poll.lock'):
            with self.assertRaises(ValueError):c.discover(self.state,fixture,now=now)
    def test_enqueue_protected_and_cadence(self):
        packet=self.root/'draft.json';draft=dict(self.row,status='draft')
        for field in ['approved_by','approved_at','authorization_receipt','approved_payload_sha256']:draft.pop(field,None)
        c.atomic(packet,draft)
        with self.assertRaises(ValueError):c.enqueue(self.state,packet)
        now=dt.datetime.now(c.UTC);prior=dict(self.row,status='published',kind='reply',published_at=now.isoformat())
        self.assertEqual(c.cadence([prior],dict(self.row,kind='reply'),now),'one X reply per day')
        self.assertEqual(c.cadence([prior,prior],self.row,now),'two-item daily ceiling')
    @patch.object(c,'credentials',return_value={})
    def test_approval_changes_during_identity_no_send(self,_):
        original=self.fake()
        def changing(args, **kw):
            result=original(args,**kw)
            if args[4]=='whoami': self.row['body']='Edited';self.save()
            return result
        with self.assertRaises(ValueError):c.publish(self.state,'trial',True,changing)
        self.assertEqual(self.status(),'approved')
    def test_draft_enqueue_and_article_cadence(self):
        (self.state/'queue.json').unlink()
        draft=dict(self.row,status='draft')
        for key in ['approved_by','approved_at','authorization_receipt','approved_payload_sha256']:draft.pop(key,None)
        path=self.root/'draft.json';c.atomic(path,draft)
        self.assertEqual(c.enqueue(self.state,path)['status'],'draft')
        now=dt.datetime.now(c.UTC)
        prior=dict(self.row,status='published',kind='article',published_at=(now-dt.timedelta(days=6)).isoformat())
        self.assertEqual(c.cadence([prior],dict(self.row,kind='article'),now),'one article per platform per seven days')
    def test_crash_after_packet_before_state_replays(self):
        fixture=self.root/'fixture.json';c.atomic(fixture,[{'id':'321','text':'external'}]);real=c.atomic
        def crash(path,value):
            if path.name=='state.json':raise OSError('synthetic crash')
            return real(path,value)
        with patch.object(c,'atomic',side_effect=crash):
            with self.assertRaises(OSError):c.discover(self.state,fixture)
        self.assertTrue((self.state/'discovery-fixture/packets/321.json').is_file())
        self.assertEqual(c.discover(self.state,fixture)['created'],[])
        self.assertIn('x:321',c.load(self.state/'discovery-fixture/state.json',{})['seen'])
    @patch.object(c,'credentials',return_value={})
    def test_revoked_claim_no_send(self,_):
        original=c.transition
        def revoke(root,command,id,**kw):
            original(root,command,id,**kw)
            if command=='claim':
                data=c.load(Path(root)/'queue.json',{});data['items'][0]['status']='draft';c.atomic(Path(root)/'queue.json',data)
        calls=[];fake=self.fake()
        def tracked(args,**kw):calls.append(args[4]);return fake(args,**kw)
        with patch.object(c,'transition',side_effect=revoke):
            self.assertEqual(c.publish(self.state,'trial',True,tracked)['status'],'held')
        self.assertEqual(calls,['whoami']);self.assertEqual(self.status(),'draft')
    def test_identity_parser_rejects_profile(self):
        with self.assertRaises(ValueError):c.identity('@tester public profile')
if __name__=='__main__':unittest.main()
