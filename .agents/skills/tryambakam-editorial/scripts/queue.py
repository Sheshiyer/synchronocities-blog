#!/usr/bin/env python3
"""Local publication gate. Never performs network calls or grants human approval."""
import argparse, datetime as dt, fcntl, hashlib, json, os, tempfile
from pathlib import Path
from zoneinfo import ZoneInfo

PAYLOAD = ('platform', 'kind', 'account', 'destination', 'target_url', 'audience', 'send_email', 'body', 'media', 'sources')
KINDS = {'substack': {'essay', 'note', 'comment'}, 'x': {'post', 'article', 'reply'}}
V2_KINDS = {**KINDS, 'reddit': {'profile-post', 'community-post'}}
V2_PAYLOAD = PAYLOAD + ('payload_version', 'title', 'link_url', 'post_format', 'not_before', 'scheduled_for', 'timezone', 'delivery_mode', 'transport', 'writer_policy', 'context_bundle', 'asset_manifest', 'upstream_writer_review', 'upstream_review_base')
POLICY_KEYS = ('contract', 'skill_version', 'contract_sha256', 'package_sha256')
CONTRACT_PATH = None  # Optional fixture override; the existing calendar owns the contract path.

def current_writer_policy():
    import context_pipeline as pipeline
    from calendar_runner import WRITER_CONTRACT_PATH
    contract_path = CONTRACT_PATH or WRITER_CONTRACT_PATH
    return dict(contract=pipeline.CONTRACT_ID, skill_version=pipeline.SKILL_VERSION,
                contract_sha256=hashlib.sha256(contract_path.read_bytes()).hexdigest(),
                package_sha256=pipeline.package_hash())

def intent_for(row):
    return 'native-' + row.get('delivery_mode', '') if row.get('payload_version') == 2 else 'publish'

def native_content_identity(row):
    from urllib.parse import urlsplit
    url=urlsplit(str(row.get('destination') or ''))
    host=(url.hostname or '').removeprefix('www.').casefold()
    if host=='twitter.com':host='x.com'
    destination=host+url.path.rstrip('/').casefold()
    account=str(row.get('account') or '').casefold().removeprefix('@').removeprefix('u/')
    media=tuple(sorted(str(x.get('sha256','')).casefold() for x in row.get('media',[]) if isinstance(x,dict)))
    return (str(row.get('platform','')).casefold(),account,destination,
            ' '.join(str(row.get('title') or '').split()),' '.join(str(row.get('body') or '').split()),media,row.get('link_url'))

def v2_problem(row):
    if any(not isinstance(row.get(k), str) or not row[k].strip() for k in ('account', 'destination', 'body', 'not_before', 'scheduled_for', 'timezone')):
        return 'complete native text, account, destination and timing required'
    if row.get('transport') != 'native-iab' or row.get('delivery_mode') not in ('publish', 'schedule'):
        return 'explicit native transport and delivery mode required'
    if row.get('platform') not in ('x', 'reddit'):
        return 'unsupported v2 native platform'
    if row.get('post_format') not in ('text', 'video', 'link'):
        return 'explicit native post format required'
    if row['post_format'] == 'video' and not row.get('media'):
        return 'native video attachment required'
    if row['post_format'] == 'link' and (row.get('platform') != 'reddit' or not isinstance(row.get('link_url'), str) or not row['link_url'].startswith('https://') or row.get('media')):
        return 'Reddit link post requires exact HTTPS link without video'
    if row['post_format'] != 'link' and row.get('link_url') is not None:
        return 'link URL requires link post format'
    if row['delivery_mode'] == 'schedule' and row['platform'] != 'x':
        return 'native scheduling capability not verified for this platform'
    try: policy = current_writer_policy()
    except (OSError, ValueError): return 'current writer policy unavailable'
    if row.get('writer_policy') != policy:
        return 'current writer policy changed'
    if not isinstance(row.get('writer_review'), dict): return 'writer review required'
    if row['writer_policy'] != {k: row.get('writer_review', {}).get(k) for k in POLICY_KEYS}:
        return 'writer review policy mismatch'
    if row['platform'] == 'x':
        from urllib.parse import urlsplit
        url = urlsplit(row.get('destination', ''))
        if url.scheme != 'https' or url.hostname not in ('x.com', 'www.x.com', 'twitter.com', 'www.twitter.com') or url.query or url.fragment or url.path.strip('/').casefold() != row.get('account', '').removeprefix('@').casefold():
            return 'X destination account mismatch'
    if row.get('platform') == 'reddit':
        if not isinstance(row.get('title'), str) or not row['title'].strip() or len(row['title']) > 300:
            return 'Reddit title required'
        from urllib.parse import urlsplit
        url = urlsplit(row.get('destination', ''))
        if url.scheme != 'https' or url.hostname not in ('www.reddit.com', 'reddit.com') or url.query or url.fragment:
            return 'invalid Reddit destination'
        parts = url.path.strip('/').split('/')
        expected = 'user' if row.get('kind') == 'profile-post' else 'r'
        if len(parts) != 2 or parts[0] != expected or not parts[1] or (expected == 'user' and parts[1].casefold() != row.get('account', '').removeprefix('u/').casefold()):
            return 'Reddit destination kind or account mismatch'
    try:
        zone = ZoneInfo(row['timezone'])
        earliest = instant(row['not_before'])
        if earliest.utcoffset() != earliest.astimezone(zone).utcoffset():
            return 'not_before timezone offset mismatch'
        scheduled = instant(row['scheduled_for'])
        if scheduled.utcoffset() != scheduled.astimezone(zone).utcoffset():
            return 'invalid scheduled time or timezone'
        if row['delivery_mode'] == 'publish' and earliest < scheduled:
            return 'due-time submission cannot precede desired publication time'
        if row['delivery_mode'] == 'schedule' and scheduled < earliest:
            return 'native schedule precedes earliest submission time'
    except (ValueError, KeyError, TypeError):
        return 'explicit valid time and timezone required'
    return None

def digest(row):
    version = row.get('payload_version', 1)
    if type(version) is not int or version not in (1, 2):
        raise ValueError('unsupported payload version')
    keys = V2_PAYLOAD if version == 2 else PAYLOAD
    return hashlib.sha256(json.dumps({k: row.get(k) for k in keys}, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=version == 1).encode()).hexdigest()

def instant(value):
    if not isinstance(value, str):
        raise ValueError('timestamps must be strings with an explicit timezone')
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('timestamps must have an explicit timezone')
    return parsed

def check(row, now, intent='publish', check_due=True):
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
    if row.get('payload_version') == 2:
        problem = v2_problem(row)
        if problem:
            return problem
        if intent != intent_for(row):
            return 'explicit native handoff intent required'
        if intent == 'native-schedule' and instant(row['scheduled_for']) <= now:
            return 'scheduled time must be in the future'
    if check_due and instant(row['not_before']) > now:
        return 'not due'
    kinds = V2_KINDS if row.get('payload_version') == 2 else KINDS
    if row.get('kind') not in kinds.get(row.get('platform'), set()):
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
            due = [r for r in rows if check(r, now, intent=intent_for(r)) is None]
            due.sort(key=lambda r: (instant(r['not_before']), r['id']))
            print(json.dumps({'due': due}, ensure_ascii=False, indent=2)); return
        row = next((r for r in rows if r['id'] == args.id), None)
        if row is None:
            raise ValueError('unknown queue ID')
        if args.command == 'claim':
            if any(r.get('status') in ('publishing', 'reconcile') for r in rows):
                raise ValueError('outstanding write requires reconciliation')
            intent = getattr(args, 'intent', 'publish')
            reason = check(row, now, intent=intent)
            if reason:
                raise ValueError(reason)
            for prior in rows:
                if (row.get('payload_version') == 2 or prior.get('payload_version') == 2) and prior is not row and prior.get('status') in ('scheduled', 'published') and native_content_identity(prior)==native_content_identity(row):
                    raise ValueError('same native content already delivered or scheduled; reconcile instead of resubmitting')
                if prior is not row and prior.get('status') == 'published':
                    if prior.get('payload_sha256') == row['payload_sha256']:
                        raise ValueError('same payload already published')
                    if row['kind'] in ('comment', 'reply') and (prior.get('account'), prior.get('target_url')) == (row['account'], row.get('target_url')):
                        raise ValueError('already contributed to this conversation; manual review required')
            row.update(status='publishing', claimed_at=now.isoformat())
            if row.get('payload_version') == 2:
                row['claimed_intent'] = intent
        elif args.command == 'uncertain':
            if row.get('status') != 'publishing':
                raise ValueError('only claimed writes can become uncertain')
            row.update(status='reconcile', reason=args.reason)
        elif args.command == 'receipt':
            if row.get('payload_version') == 2:
                raise ValueError('v2 requires attributable native readback adoption')
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
        if name == 'claim': child.add_argument('--intent', choices=('publish', 'native-publish', 'native-schedule'), default='publish')
        if name == 'uncertain': child.add_argument('--reason', required=True)
        if name == 'receipt':
            child.add_argument('--external-id', required=True); child.add_argument('--url', required=True); child.add_argument('--evidence', required=True)
    try: run(parser.parse_args())
    except (ValueError, KeyError, AssertionError) as error: parser.exit(2, str(error) + '\n')
