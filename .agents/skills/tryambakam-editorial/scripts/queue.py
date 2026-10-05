#!/usr/bin/env python3
"""Local publication gate. Never performs network calls or grants human approval."""
import argparse, datetime as dt, fcntl, hashlib, json, os, tempfile
from pathlib import Path

PAYLOAD = ('platform', 'kind', 'account', 'destination', 'target_url', 'audience', 'send_email', 'body', 'media', 'sources')
KINDS = {'substack': {'essay', 'note', 'comment'}, 'x': {'post', 'article', 'reply'}}

def digest(row):
    return hashlib.sha256(json.dumps({k: row.get(k) for k in PAYLOAD}, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()

def instant(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('timestamps must have an explicit timezone')
    return parsed

def check(row, now):
    if row.get('status') != 'approved':
        return 'not approved'
    for field in ('approved_by', 'approved_at', 'authorization_receipt', 'approved_payload_sha256'):
        if not row.get(field):
            return 'missing ' + field
    h = digest(row)
    if row.get('payload_sha256') != h or row['approved_payload_sha256'] != h:
        return 'payload changed after approval'
    if instant(row['approved_at']) > now:
        return 'approval in future'
    if instant(row['not_before']) > now:
        return 'not due'
    if row.get('kind') not in KINDS.get(row.get('platform'), set()):
        return 'unsupported channel kind'
    for field in ('account', 'destination', 'audience', 'body', 'sources'):
        if not row.get(field):
            return 'missing ' + field
    if not row['destination'].startswith('https://'):
        return 'destination must be HTTPS'
    if row['kind'] in ('comment', 'reply') and not str(row.get('target_url', '')).startswith('https://'):
        return 'exact conversation target required'
    if type(row.get('send_email')) is not bool:
        return 'email delivery must be explicit'
    if row['send_email'] and (row['platform'], row['kind']) != ('substack', 'essay'):
        return 'email delivery only valid for essay'
    for asset in row.get('media', []) + row['sources']:
        path = Path(asset['path'])
        if not path.is_absolute() or not path.is_file():
            return 'missing source or asset'
        if hashlib.sha256(path.read_bytes()).hexdigest() != asset['sha256']:
            return 'source or asset changed'
    return None

def run(args):
    state = Path(args.state).expanduser(); state.mkdir(parents=True, exist_ok=True)
    with (state / 'queue.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = state / 'queue.json'
        data = json.loads(path.read_text()) if path.exists() else {'version': 1, 'items': []}
        rows = data['items']; now = dt.datetime.now(dt.timezone.utc)
        assert len({r['id'] for r in rows}) == len(rows), 'duplicate IDs'
        if args.command == 'due':
            # Existing publishing rows may represent an unrecorded public write: stop, reconcile.
            pending = [r['id'] for r in rows if r.get('status') in ('publishing', 'reconcile')]
            if pending:
                print(json.dumps({'held_for_reconciliation': pending, 'due': []})); return
            due = [r for r in rows if check(r, now) is None]
            due.sort(key=lambda r: (instant(r['not_before']), r['id']))
            print(json.dumps({'due': due}, ensure_ascii=False, indent=2)); return
        row = next((r for r in rows if r['id'] == args.id), None)
        if row is None:
            raise ValueError('unknown queue ID')
        if args.command == 'claim':
            if any(r.get('status') in ('publishing', 'reconcile') for r in rows):
                raise ValueError('outstanding write requires reconciliation')
            reason = check(row, now)
            if reason:
                raise ValueError(reason)
            for prior in rows:
                if prior is not row and prior.get('status') == 'published':
                    if prior.get('payload_sha256') == row['payload_sha256']:
                        raise ValueError('same payload already published')
                    if row['kind'] in ('comment', 'reply') and (prior.get('account'), prior.get('target_url')) == (row['account'], row.get('target_url')):
                        raise ValueError('already contributed to this conversation; manual review required')
            row.update(status='publishing', claimed_at=now.isoformat())
        elif args.command == 'uncertain':
            if row.get('status') != 'publishing':
                raise ValueError('only claimed writes can become uncertain')
            row.update(status='reconcile', reason=args.reason)
        elif args.command == 'receipt':
            if row.get('status') not in ('publishing', 'reconcile'):
                raise ValueError('receipt requires claimed or reconciliation state')
            if not args.url.startswith('https://') or not Path(args.evidence).is_file():
                raise ValueError('verified URL and local readback evidence required')
            row.update(status='published', external_id=args.external_id, public_url=args.url, published_at=now.isoformat(), readback_evidence=str(Path(args.evidence).resolve()))
        fd, temporary = tempfile.mkstemp(dir=state, prefix='.queue-')
        try:
            with os.fdopen(fd, 'w') as out:
                json.dump(data, out, indent=2, ensure_ascii=False); out.write('\n'); out.flush(); os.fsync(out.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
        print(json.dumps({'id': row['id'], 'status': row['status']}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', default='~/.codex/editorial/tryambakam')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('due')
    for name in ('claim', 'uncertain', 'receipt'):
        child = sub.add_parser(name); child.add_argument('id')
        if name == 'uncertain': child.add_argument('--reason', required=True)
        if name == 'receipt':
            child.add_argument('--external-id', required=True); child.add_argument('--url', required=True); child.add_argument('--evidence', required=True)
    try: run(parser.parse_args())
    except (ValueError, KeyError, AssertionError) as error: parser.exit(2, str(error) + '\n')
