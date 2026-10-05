#!/usr/bin/env python3
"""Bounded editorial preparation and exact-item, approval-gated X execution."""
import argparse, contextlib, datetime as dt, fcntl, hashlib, importlib.util, io, json, os, re, shutil, subprocess, tempfile
from pathlib import Path
from zoneinfo import ZoneInfo
spec = importlib.util.spec_from_file_location('editorial_queue', Path(__file__).with_name('queue.py'))
queue = importlib.util.module_from_spec(spec); spec.loader.exec_module(queue)
UTC = dt.timezone.utc
PARIS = ZoneInfo('Europe/Paris')
REF = Path(__file__).resolve().parents[1] / 'references'

def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, tmp = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump(value, out, ensure_ascii=False, indent=2); out.flush(); os.fsync(out.fileno())
        os.replace(tmp, path)
        d = os.open(path.parent, os.O_RDONLY); os.fsync(d); os.close(d)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

@contextlib.contextmanager
def lock(root, name):
    root = Path(root).expanduser().resolve()
    if any((p / '.git').exists() for p in (root, *root.parents)):
        raise ValueError('private state must be outside Git')
    root.mkdir(parents=True, exist_ok=True, mode=0o700); os.chmod(root, 0o700)
    with (root / name).open('a') as f:
        os.chmod(f.name, 0o600)
        try: fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: raise ValueError('another run holds the lock')
        yield root

def load(path, default):
    if not path.exists(): return default
    if path.stat().st_size > 2_000_000: raise ValueError('input too large')
    return json.loads(path.read_text())

def plan(day, blog):
    date = dt.date.fromisoformat(day) if day else dt.datetime.now(PARIS).date()
    rows = []
    for line in (REF / 'baseline-calendar.md').read_text().splitlines():
        cells = [c.strip() for c in line.split('|')]
        if len(cells) < 7 or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', cells[1]): continue
        when = dt.date.fromisoformat(cells[1]); slugs = re.findall(r'`([^`]+)`', cells[3])
        dates = re.findall(r'\d{4}-\d{2}-\d{2}', cells[5])
        rows.append((when, cells, slugs, dates))
    if len(rows) != 26: raise ValueError('baseline must contain 26 article weeks')
    selected = next((r for r in rows if r[0] + dt.timedelta(days=2) >= date), None)
    if not selected: return {'status': 'calendar exhausted', 'weeks': len(rows)}
    when, cells, slugs, dates = selected
    sources = []
    for slug in slugs:
        if not re.fullmatch(r'[a-z0-9-]+', slug): continue
        found = list((Path(blog) / 'src/content/posts').glob(slug + '.md'))
        if found: sources.append({'path': str(found[0].resolve()), 'sha256': hashlib.sha256(found[0].read_bytes()).hexdigest(), 'slug': slug})
    def at(d, hour): return dt.datetime.combine(d, dt.time(hour), PARIS).isoformat()
    return {'status': 'draft preparation only', 'weeks': 26, 'series': cells[2], 'title_source': cells[3], 'editorial_action': cells[4], 'sources': sources, 'article': at(when, 10), 'notes': [at(dt.date.fromisoformat(d), 10) for d in dates], 'x_proposed_slots': [at(when - dt.timedelta(days=1), 12), at(when + dt.timedelta(days=1), 12)], 'gates': ['Full source reread and recorded source hashes required', 'Review signed-in Published and existing drafts for overlap', 'Complete original adaptation and exact individual approval required', 'Missing or conditional manuscript source holds drafting']}

def credentials():
    env = os.environ.copy()
    if not (env.get('AUTH_TOKEN') and env.get('CT0')):
        path = Path.home() / '.config/bird/config.json5'
        if path.exists():
            text = path.read_text()
            for field, key in [('auth_token', 'AUTH_TOKEN'), ('ct0', 'CT0')]:
                m = re.search(r'(?:["\']?' + field + r'["\']?)\s*:\s*(["\'])([^\r\n]*?)\1', text)
                if m and not env.get(key): env[key] = m[2]
    if not (env.get('AUTH_TOKEN') and env.get('CT0')): raise ValueError('protected Bird credentials unavailable')
    env['NO_COLOR'] = '1'; return env

def bird(args, runner=subprocess.run):
    try:
        result = runner(['bird', '--plain', '--timeout', '15000', *args], capture_output=True, text=True, timeout=25, env=credentials())
        if result.returncode or len(result.stdout) > 2_000_000: raise ValueError('Bird request failed')
        return result.stdout
    except (subprocess.TimeoutExpired, OSError): raise ValueError('Bird request timed out or unavailable')

def identity(text):
    # Bird 0.8.0 plain whoami prints user: @handle (name), user_id: ID.
    handle = re.search(r'^user:\s*@([A-Za-z0-9_]{1,15})\s+\(', text, re.M)
    uid = re.search(r'^user_id:\s*(\d+)\s*$', text, re.M)
    if not handle or not uid: raise ValueError('identity output unverified')
    return '@' + handle[1], uid[1]

def discover(root, fixture=None, live=False, now=None, runner=subprocess.run):
    now = now or dt.datetime.now(UTC)
    with lock(Path(root) / ('discovery-live' if live else 'discovery-fixture'), 'poll.lock') as state:
        data = load(state / 'state.json', {'seen': [], 'next_poll': '1970-01-01T00:00:00+00:00'})
        if queue.instant(data['next_poll']) > now: return {'status': 'backoff', 'next_poll': data['next_poll']}
        try:
            if live:
                items = []
                config = load(REF / 'watchlist.json', {})
                for topic in config['families'][:7]:
                    if topic.get('enabled'): items.extend(json.loads(bird(['search', topic['query'], '-n', '3', '--json'], runner)))
            else: items = load(Path(fixture), [])
            if not isinstance(items, list) or len(items) > 100: raise ValueError('bounded list required')
            created = []
            for item in items:
                pid = str(item.get('id', ''))
                if not re.fullmatch(r'\d{1,30}', pid): continue
                key = 'x:' + pid
                if key in data['seen']: continue
                packet = {'id': key, 'status': 'research_candidate', 'target_url': 'https://x.com/i/status/' + pid, 'text': str(item.get('text', ''))[:20000], 'author': item.get('author', {}), 'created_at': item.get('createdAt'), 'gates': ['External context incomplete; full source and thread review required', 'No response prose or approval generated'], 'fixture': not live}
                packet_path = state / 'packets' / (pid + '.json')
                existed = packet_path.exists()
                atomic(packet_path, packet)
                if len(data['seen']) >= 10000: raise ValueError('dedup capacity requires reviewed archival')
                data['seen'].append(key)
                if not existed: created.append(key)
            data['next_poll'] = (now + dt.timedelta(minutes=30)).isoformat()
            atomic(state / 'state.json', data)
            return {'created': created, 'next_poll': data['next_poll'], 'listener': False}
        except Exception:
            data['next_poll'] = (now + dt.timedelta(hours=1)).isoformat(); atomic(state / 'state.json', data)
            raise ValueError('discovery failed; retry after backoff')

def enqueue(root, packet):
    row = load(Path(packet), {})
    if row.get('status') != 'draft' or not row.get('id') or not row.get('body') or not row.get('sources'): raise ValueError('complete draft payload required')
    for field in ('approved_by', 'approved_at', 'authorization_receipt', 'approved_payload_sha256'):
        if row.get(field): raise ValueError('draft cannot carry approval')
    probe = dict(row, status='approved', approved_by='validation', approved_at='1970-01-01T00:00:00+00:00', authorization_receipt='validation')
    probe['payload_sha256'] = probe['approved_payload_sha256'] = queue.digest(row)
    reason = queue.check(probe, dt.datetime.max.replace(tzinfo=UTC))
    if reason: raise ValueError(reason)
    with lock(root, 'queue.lock') as state:
        data = load(state / 'queue.json', {'version': 1, 'items': []})
        old = next((r for r in data['items'] if r['id'] == row['id']), None)
        if old and old.get('status') != 'draft': raise ValueError('cannot overwrite protected queue row')
        row['payload_sha256'] = queue.digest(row)
        if old: old.clear(); old.update(row)
        else: data['items'].append(row)
        atomic(state / 'queue.json', data)
    return {'id': row['id'], 'status': 'draft'}

def cadence(rows, row, now):
    published = [r for r in rows if r.get('status') == 'published']
    today = now.astimezone(PARIS).date()
    if sum(queue.instant(r['published_at']).astimezone(PARIS).date() == today for r in published) >= 2: return 'two-item daily ceiling'
    for r in published:
        if r.get('platform') != row.get('platform'): continue
        since = now - queue.instant(r['published_at'])
        if row['kind'] == 'reply' and r.get('kind') == 'reply' and queue.instant(r['published_at']).astimezone(PARIS).date() == today: return 'one X reply per day'
        if row['kind'] in ('article', 'essay') and r.get('kind') in ('article', 'essay') and since < dt.timedelta(days=7): return 'one article per platform per seven days'
    return None

def transition(root, command, id, **kw):
    with contextlib.redirect_stdout(io.StringIO()): queue.run(argparse.Namespace(state=str(root), command=command, id=id, **kw))

def publish(root, id, submit=False, runner=subprocess.run):
    with lock(root, 'execution.lock') as state:
        data = load(state / 'queue.json', {'items': []}); row = next((r for r in data['items'] if r['id'] == id), None)
        if row is None: raise ValueError('unknown queue ID')
        now = dt.datetime.now(UTC)
        reason = queue.check(row, now) or cadence(data['items'], row, now)
        if reason: return {'status': 'held', 'reason': reason}
        if row['platform'] == 'substack': return {'status': 'held', 'reason': 'IAB handoff: refresh signed-in Published/Drafts, verify account, target, audience and email; preview exact approved item before claiming'}
        if row['platform'] != 'x' or row['kind'] not in ('post', 'reply') or row.get('media') or row['send_email']: return {'status': 'held', 'reason': 'unsupported publishing capability'}
        if len(row['body']) > 280: return {'status': 'held', 'reason': 'short X text exceeds conservative limit'}
        if row['kind'] == 'reply' and not re.fullmatch(r'https://(?:x\.com|twitter\.com)/(?:[A-Za-z0-9_]+|i)/status/\d+', row['target_url']): return {'status': 'held', 'reason': 'invalid exact X target'}
        if not submit: return {'status': 'dry-run', 'id': id, 'claim': False, 'needs': 'fresh authenticated identity and exact readback'}
        handle, uid = identity(bird(['whoami'], runner))
        if handle.lower() != row['account'].lower(): return {'status': 'held', 'reason': 'identity mismatch'}
        if row['kind'] == 'reply':
            target = json.loads(bird(['read', row['target_url'], '--json'], runner))
            if str(target.get('id')) != row['target_url'].rsplit('/', 1)[1]: return {'status': 'held', 'reason': 'target readback mismatch'}
        transition(state, 'claim', id)
        try:
            claimed = next(r for r in load(state / 'queue.json', {})['items'] if r['id'] == id)
            if claimed.get('status') != 'publishing': raise ValueError('claim revoked')
            if queue.digest(claimed) != queue.digest(row): raise ValueError('claimed payload changed')
            if queue.check(dict(claimed, status='approved'), dt.datetime.now(UTC)): raise ValueError('claimed source or authorization changed')
            args = ['tweet', row['body']] if row['kind'] == 'post' else ['reply', row['target_url'], row['body']]
            output = bird(args, runner)
            links = re.findall(r'https://(?:x\.com|twitter\.com)/[A-Za-z0-9_]+/status/(\d+)', output)
            if len(set(links)) != 1: raise ValueError('create result ambiguous')
            pid = links[0]; read = json.loads(bird(['read', pid, '--json'], runner))
            author = read.get('author', {})
            if str(read.get('id')) != pid or read.get('text') != row['body'] or '@' + author.get('username', '').lower() != handle.lower() or str(read.get('authorId')) != uid: raise ValueError('readback mismatch')
            if row['kind'] == 'reply' and str(read.get('inReplyToStatusId')) != row['target_url'].rsplit('/', 1)[1]: raise ValueError('reply target mismatch')
            evidence = state / 'receipts' / (pid + '.json')
            atomic(evidence, {'id': pid, 'author': handle, 'author_id': uid, 'payload_sha256': queue.digest(row), 'body': row['body'], 'target_url': row.get('target_url'), 'verified_at': dt.datetime.now(UTC).isoformat()})
            transition(state, 'receipt', id, external_id=pid, url='https://x.com/' + handle[1:] + '/status/' + pid, evidence=str(evidence))
            return {'status': 'published', 'id': id}
        except Exception:
            current = next(r for r in load(state / 'queue.json', {})['items'] if r['id'] == id)
            if current.get('status') == 'publishing':
                transition(state, 'uncertain', id, reason='create or readback unverified; manual reconciliation required; do not retry')
            else:
                return {'status': 'held', 'id': id, 'reason': 'claim revoked; operator review required'}
            return {'status': 'reconcile', 'id': id}

def main():
    p = argparse.ArgumentParser(description=__doc__); p.add_argument('--state', default='~/.codex/editorial/tryambakam'); sub = p.add_subparsers(dest='command', required=True)
    s = sub.add_parser('plan'); s.add_argument('--date'); s.add_argument('--blog-root', required=True)
    s = sub.add_parser('discover'); g = s.add_mutually_exclusive_group(required=True); g.add_argument('--fixture'); g.add_argument('--live', action='store_true')
    s = sub.add_parser('enqueue-draft'); s.add_argument('--packet', required=True)
    s = sub.add_parser('doctor'); s.add_argument('--live', action='store_true')
    s = sub.add_parser('publish'); s.add_argument('id'); g = s.add_mutually_exclusive_group(); g.add_argument('--submit', action='store_true'); g.add_argument('--dry-run', action='store_true')
    a = p.parse_args()
    try:
        if a.command == 'plan': result = plan(a.date, a.blog_root)
        elif a.command == 'discover': result = discover(a.state, a.fixture, a.live)
        elif a.command == 'enqueue-draft': result = enqueue(a.state, a.packet)
        elif a.command == 'publish': result = publish(a.state, a.id, a.submit)
        else:
            result = {'commands': {c: bool(shutil.which(c)) for c in ['bird', 'glam', 'reddit-cli']}, 'identity': 'not probed', 'publishing': 'exact approval and identity required'}
            if a.live: result['identity'] = identity(bird(['whoami']))[0]
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception: p.exit(2, 'Operation held or failed; inspect non-secret gates and reconcile claimed writes.\n')
if __name__ == '__main__': main()
