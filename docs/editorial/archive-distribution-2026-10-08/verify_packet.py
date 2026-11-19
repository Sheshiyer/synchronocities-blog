"""Check this local packet without network or public mutations."""
from pathlib import Path
import csv,hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parent
c=json.loads((O/'catalogue.json').read_text());plan=json.loads((O/'series-plan.json').read_text())
hash_bytes=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
checks={}
checks['127_unique_sources']=len(c['posts'])==127==len({p['slug'] for p in c['posts']})
checks['all_current_source_hashes_match']=all(hash_bytes(ROOT/p['source_path'])==p['source_sha256'] for p in c['posts'])
checks['all_current_files_catalogued']={p.stem for p in (ROOT/'src/content/posts').glob('*.md')}=={p['slug'] for p in c['posts']}
checks['queue_unchanged']=hash_bytes(Path.home()/'.codex/editorial/tryambakam/queue.json')==c['queue_sha256']
rows=list(csv.DictReader((O/'catalogue.csv').open()));checks['csv_matches_current_catalogue']=len(rows)==127 and all(r['source_sha256']==p['source_sha256'] and r['substack_status']==p['substack_status'] for r,p in zip(rows,c['posts']))
checks['24_valid_episode_source_pairs']=len(plan['episodes'])==24 and all(s in {p['slug'] for p in c['posts']} for e in plan['episodes'] for s in e['source_slugs'])
checks['episode_hashes_match']=all(e['source_hashes'][s]==next(p['source_sha256'] for p in c['posts'] if p['slug']==s) for e in plan['episodes'] for s in e['source_slugs'])
posts=json.loads((O/'drafts/x-thread.json').read_text())['posts'];counts=[len(re.sub(r'https?://\S+','x'*23,p)) for p in posts]
checks['six_x_posts_within_280']=len(posts)==6 and all(n<=280 for n in counts)
checks['reddit_link_free']='https://' not in (O/'drafts/reddit-discussion.md').read_text()
blog_urls={p['blog_url'] for p in c['posts']};urls=set()
for f in (O/'drafts').glob('*.md'):urls.update(re.findall(r'https://[^\s)]+',f.read_text()))
for p in posts:urls.update(re.findall(r'https://[^\s)]+',p))
checks['draft_links_are_catalogued_sources']=urls<=blog_urls
checks['companion_urls_remain_pending']=all(e['substack_companion_url'] is None for e in json.loads((O/'bridge-manifest.json').read_text())['bridges'])
f=ROOT/'docs/editorial/cross-brand-2026-10-08/TODAY.md'
checks['existing_daily_draft_matches_HEAD']=f.read_bytes()==subprocess.check_output(['git','show','HEAD:docs/editorial/cross-brand-2026-10-08/TODAY.md'],cwd=ROOT)
word_counts={f.name:len(re.findall(r'\b[\w’-]+\b',f.read_text())) for f in (O/'drafts').glob('*.md')}
checks['complete_manuscript_lengths']=900<=word_counts['substack-companion.md']<=1300 and 500<=word_counts['x-article.md']<=800 and 300<=word_counts['reddit-discussion.md']<=450
result={'date':'2026-10-08','scope':'local draft preparation; no publication or traffic outcomes claimed','checks':checks,'word_counts':word_counts,'x_weighted_characters':counts,'draft_source_urls':sorted(urls),'draft_hashes':{f.name:hash_bytes(f) for f in (O/'drafts').iterdir()},'native_substack_observation':{'published':10,'scheduled':1,'drafts':3,'notes_not_audited':True},'review':'Owner read all manuscripts; hypothetical examples explicitly marked; no new external quotations, clinical timing/outcome claims, product deployment claims or invented autobiography. Revision-window term remains proposed.','limitations':['X/Reddit historical coverage unknown','Other23concepts require source close-read and targeted claim review','Human author voice/canon acceptance pending','X Articles account eligibility and Reddit exact community unselected','No referral results measured'],'external_mutations':[],'pass':all(checks.values())}
(O/'VERIFICATION.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'pass':result['pass'],'checks':checks,'words':word_counts,'x_lengths':counts},indent=2));assert result['pass']
