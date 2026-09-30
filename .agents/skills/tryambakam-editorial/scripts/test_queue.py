import importlib.util, tempfile, pathlib, json, datetime, subprocess
s=str(pathlib.Path(__file__).with_name('queue.py'))
spec=importlib.util.spec_from_file_location('queue_gate',s);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
now=datetime.datetime.now(datetime.timezone.utc)
with tempfile.TemporaryDirectory() as tmp:
 root=pathlib.Path(tmp);source=root/'source.md';source.write_text('observed source')
 row={'id':'test-1','platform':'substack','kind':'comment','account':'test-human','destination':'https://example.com/publication','target_url':'https://example.com/post','audience':'public','send_email':False,'body':'A specific contribution.','media':[],'sources':[{'path':str(source),'sha256':m.hashlib.sha256(source.read_bytes()).hexdigest()}],'not_before':(now-datetime.timedelta(minutes=1)).isoformat(),'status':'approved','approved_by':'human-test-fixture','approved_at':(now-datetime.timedelta(minutes=2)).isoformat(),'authorization_receipt':'Synthetic test only: no external authorization or call.'}
 row['payload_sha256']=row['approved_payload_sha256']=m.digest(row)
 assert m.check(row,now) is None
 changed=dict(row,body='Changed');assert m.check(changed,now)=='payload changed after approval'
 source.write_text('changed source');assert m.check(row,now)=='source or asset changed';source.write_text('observed source')
 draft=dict(row,status='draft');assert m.check(draft,now)=='not approved'
 (root/'queue.json').write_text(json.dumps({'version':1,'items':[row]}))
 def call(*args):return subprocess.run(['python3',s,'--state',tmp,*args],capture_output=True,text=True)
 assert call('claim','test-1').returncode==0
 assert call('claim','test-1').returncode!=0
 assert json.loads(call('due').stdout)['due']==[]
 assert call('uncertain','test-1','--reason','synthetic timeout').returncode==0
 assert call('claim','test-1').returncode!=0
 evidence=root/'readback.json';evidence.write_text('{"synthetic":true}')
 assert call('receipt','test-1','--external-id','synthetic-id','--url','https://example.com/readback','--evidence',str(evidence)).returncode==0
 assert json.loads((root/'queue.json').read_text())['items'][0]['status']=='published'
 print('PASS: unchanged approval, edited copy rejected, source drift rejected, draft rejected, duplicate claim rejected, ambiguous write held, receipt transition.')
