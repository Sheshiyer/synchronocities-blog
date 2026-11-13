#!/usr/bin/env python3
"""Existing-ledger native IAB handoff and attributable operator readback. No network."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
import calendar_runner as c

q = c.queue

def row_at(root, item_id):
    rows = c.load(Path(root) / 'queue.json', {'items': []})['items']
    row = next((x for x in rows if x['id'] == item_id), None)
    if row is None: raise ValueError('unknown queue ID')
    return row, rows

def fresh(row, blog_root=None):
    if row.get('payload_version') != 2 or row.get('platform') not in ('x', 'reddit'):
        raise ValueError('v2 X or Reddit native item required')
    problem = q.v2_problem(row)
    if problem: raise ValueError(problem)
    review = row.get('writer_review', {})
    if review.get('payload_sha256') != q.digest(row) or review.get('source_coverage') is not True or review.get('verdict') != 'ready-for-human-review' or not review.get('reviewer') or review.get('unresolved_findings') != []:
        raise ValueError('current complete exact-copy writer review required')
    blog=Path(blog_root).resolve() if blog_root else c.WRITER_CONTRACT_PATH.parents[2]
    contract=blog/'docs/editorial/WRITER-CONTRACT.md'
    if c.pipeline.sha(contract.read_bytes())!=row['writer_policy']['contract_sha256']:raise ValueError('selected writer contract changed')
    c.pipeline.validate_packet(row, blog, contract)
    for item in row.get('upstream_writer_review',{}).get('source_coverage',[]):
        path=Path(item['path'])
        if not path.is_absolute():path=Path(row['upstream_review_base'])/path
        if not path.is_file() or c.pipeline.sha(path.read_bytes())!=item.get('sha256'):
            raise ValueError('upstream reviewed source changed')

def preview(root, item_id):
    row, _ = row_at(root, item_id)
    fresh(row)
    return {'status': 'needs-human-approval' if row.get('status') == 'draft' else 'preview-only',
            'id': item_id, 'payload_sha256': q.digest(row),
            'exact_payload': {k: row.get(k) for k in q.V2_PAYLOAD if k not in ('context_bundle','asset_manifest','upstream_writer_review','upstream_review_base')},
            'context_sha256': c.pipeline.digest(row['context_bundle']), 'assets_sha256': c.pipeline.digest(row['asset_manifest']),
            'external_action': False, 'instruction': 'Refresh native account, destination, duplicate history and exact attachment before one approved claim.'}

def native_cadence(rows,row,now):
    target=q.instant(row['scheduled_for']) if row.get('delivery_mode')=='schedule' else now
    day=target.astimezone(c.PARIS).date()
    occupied=0
    for prior in rows:
        if prior.get('status')=='published':stamp=prior.get('published_at')
        elif prior.get('status') in ('scheduled','publishing','reconcile'):stamp=prior.get('scheduled_for') or prior.get('not_before')
        else:continue
        if stamp and q.instant(stamp).astimezone(c.PARIS).date()==day:occupied+=1
    return 'two-item daily ceiling (including scheduled reservations)' if occupied>=2 else c.cadence(rows,row,target)

def claim(root, item_id):
    with c.lock(root, 'execution.lock') as state:
        row, rows = row_at(state, item_id)
        fresh(row)
        now = dt.datetime.now(c.UTC)
        problem = q.check(row, now, intent=q.intent_for(row)) or native_cadence(rows, row, now)
        if problem: raise ValueError(problem)
        c.transition(state, 'claim', item_id, intent=q.intent_for(row))
        result = preview(state, item_id)
        result.update(status='claimed-native-handoff', instruction='One native IAB operation only. No automatic submission or transport switch; uncertain effect requires reconciliation.')
        return result

def convert_reviewed(review_path, assignment_path, settings_path, output, review_base, binding_path=None, blog_root=None):
    """Map an actual public-copy review; never invent missing source/semantic coverage."""
    output = Path(output)
    if output.exists(): raise ValueError('new versioned packet output required')
    original = c.load(Path(review_path), {})
    review = original.get('writer_review', original)
    assignment = c.load(Path(assignment_path), {})
    settings = c.load(Path(settings_path), {})
    if any(k in settings for k in ('approved_by','approved_at','authorization_receipt','approved_payload_sha256','writer_review','body','title')):
        raise ValueError('settings cannot replace public copy or supply approval')
    public = review.get('publicCopy')
    if not isinstance(public, dict) or c.pipeline.digest(public) != review.get('public_copy_sha256') or review.get('whole_output_read') is not True or not review.get('reviewer') or review.get('verdict') not in ('ready-for-human-review','SUITABLE_FOR_EXACT_HUMAN_REVIEW_AFTER_SURGICAL_CORRECTIONS') or review.get('human_approval') is not False or review.get('publication_authority') is not False:
        raise ValueError('exact reviewed public copy without publication approval required')
    policy = q.current_writer_policy()
    if (review.get('contract_id'),review.get('canonical_skill_version'),review.get('contract_sha256')) != (policy['contract'],policy['skill_version'],policy['contract_sha256']):
        raise ValueError('upstream writer policy is stale')
    if review.get('canonical_skill_sha256')!=c.pipeline.sha((c.pipeline.WRITER_ROOT/'SKILL.md').read_bytes()):
        raise ValueError('upstream canonical skill changed')
    coverage = review.get('source_coverage')
    if not isinstance(coverage, list) or not coverage: raise ValueError('actual source coverage records required')
    for item in coverage:
        path=Path(item['path']);path=path if path.is_absolute() else Path(review_base)/path
        if not item.get('coverage') or not path.is_file() or c.pipeline.sha(path.read_bytes()) != item.get('sha256'):
            raise ValueError('upstream coverage source changed')
    assets=assignment['asset_manifest']
    if settings.get('post_format')=='link':assets={**assets,'assets':[]}
    row={**settings,'payload_version':2,'status':'draft','transport':'native-iab','writer_policy':policy,
         'body':public.get('text') if settings.get('platform')=='x' else public.get('body'),
         'title':public.get('title'),'link_url':public.get('url'),
         'context_bundle':assignment['context_bundle'],'asset_manifest':assets,
         'media':[{'path':a['path'],'sha256':a['sha256']} for a in assets['assets']],
         'sources':[{'path':s['path'],'sha256':s['sha256']} for s in assignment['context_bundle']['sources']],
         'upstream_writer_review':review,'upstream_review_base':str(Path(review_base).resolve())}
    proofs={**policy,'context_sha256':c.pipeline.digest(row['context_bundle']),'assets_sha256':c.pipeline.digest(row['asset_manifest']),
            'payload_sha256':q.digest(row),'public_copy_sha256':review['public_copy_sha256']}
    row['writer_review']={**proofs,'source_coverage':False,'semantic_review':False,'verdict':'held-for-binding-review',
                          'reviewer':None,'unresolved_findings':['Named review of the exact new context/asset/settings binding is required; upstream coverage is retained, not converted into an attestation.']}
    blog=Path(blog_root).resolve() if blog_root else c.WRITER_CONTRACT_PATH.parents[2]
    contract=blog/'docs/editorial/WRITER-CONTRACT.md'
    if c.pipeline.sha(contract.read_bytes())!=policy['contract_sha256']:raise ValueError('selected writer contract changed')
    # Mechanical source/asset checks do not clear findings or attest semantic reading.
    c.pipeline.validate_packet(row,blog,contract,bindings_only=True)
    if binding_path:
        binding=c.load(Path(binding_path),{})
        if any(binding.get(k)!=v for k,v in proofs.items()) or binding.get('source_coverage') is not True or binding.get('semantic_review') is not True or not binding.get('reviewer') or binding.get('verdict')!='ready-for-human-review' or binding.get('unresolved_findings')!=[]:
            raise ValueError('complete current binding review required')
        row['writer_review']=binding
        fresh(row,blog)
    else:
        problem=q.v2_problem(row)
        if problem:raise ValueError(problem)
    c.atomic(output,row)
    return {'id':row['id'],'status':row['writer_review']['verdict'],'output':str(output),'proofs':proofs,'approval':False,'enqueued':False}

def artifact_proof(observation):
    artifacts = observation.get('artifacts')
    if not isinstance(artifacts, list) or not 1 <= len(artifacts) <= 8:
        raise ValueError('bounded native readback artifacts required')
    for artifact in artifacts:
        if not isinstance(artifact, dict): raise ValueError('invalid native artifact record')
        path = Path(artifact.get('path', ''))
        if artifact.get('kind') not in ('snapshot', 'screenshot') or not path.is_absolute() or path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= 8_000_000:
            raise ValueError('invalid native readback artifact')
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != artifact.get('sha256'):
            raise ValueError('native readback artifact changed')
        if artifact['kind'] == 'screenshot' and not data.startswith((b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff')):
            raise ValueError('readback screenshot is not PNG or JPEG')
        if artifact['kind'] == 'snapshot':
            text = data.decode('utf-8')
            if len(text.strip()) < 20 or '"synthetic":true' in text.replace(' ', ''):
                raise ValueError('empty or synthetic native snapshot')

def observation_problem(row, observation, now):
    if not isinstance(observation, dict): raise ValueError('native observation object required')
    if observation.get('schema') != 'editorial.native-iab-observation.v1' or observation.get('source') != 'native-iab-readback' or observation.get('synthetic') is not False or not isinstance(observation.get('operator'), str) or not observation['operator'].strip():
        raise ValueError('attributable non-synthetic operator observation required')
    observed = q.instant(observation['observed_at'])
    if observed > now + dt.timedelta(minutes=1) or now - observed > dt.timedelta(minutes=15) or observed < q.instant(row['claimed_at']):
        raise ValueError('fresh post-claim native observation required')
    if observation.get('payload_sha256') != q.digest(row): raise ValueError('observed payload mismatch')
    for key in ('account', 'destination', 'title', 'body', 'media', 'link_url', 'post_format'):
        if observation.get(key) != row.get(key): raise ValueError('native readback mismatch: ' + key)
    state = observation.get('state')
    if state not in ('scheduled', 'published'): raise ValueError('unknown native delivery state')
    if state == 'scheduled' and (row.get('claimed_intent') != 'native-schedule' or q.instant(observation['scheduled_for']) != q.instant(row['scheduled_for'])):
        raise ValueError('scheduled time or claimed intent mismatch')
    if state == 'published' and row.get('delivery_mode') == 'schedule' and now < q.instant(row['scheduled_for']):
        raise ValueError('scheduled item is not yet publishable')
    native_id = observation.get('native_id')
    link = observation.get('public_url' if state == 'published' else 'view_url', '')
    parsed = urlsplit(link)
    hosts = ('x.com', 'www.x.com', 'twitter.com', 'www.twitter.com') if row['platform'] == 'x' else ('reddit.com', 'www.reddit.com')
    if parsed.scheme != 'https' or parsed.hostname not in hosts or parsed.username or parsed.password:
        raise ValueError('matching platform URL required')
    if state == 'scheduled' and 'native_id' in observation and native_id is None:
        reason = observation.get('native_id_unavailable_reason')
        if (observation.get('identity_kind') != 'exact-payload-time-and-native-readback'
                or not isinstance(reason, str) or not reason.strip() or len(reason) > 1000):
            raise ValueError('explicit unknown native ID identity and reason required')
        if row['platform'] != 'x' or parsed.path.rstrip('/') not in ('/compose/post/unsent/scheduled', '/settings/scheduled_tweets'):
            raise ValueError('native scheduled view required for unknown ID')
    elif not isinstance(native_id, str) or not native_id.strip() or len(native_id) > 160:
        raise ValueError('native ID required')
    if state == 'published':
        parts = parsed.path.strip('/').split('/')
        marker = 'status' if row['platform'] == 'x' else 'comments'
        if marker not in parts or parts.index(marker) + 1 >= len(parts) or parts[parts.index(marker) + 1] != native_id:
            raise ValueError('public URL does not bind native ID')
        if row['platform'] == 'x' and parsed.path.split('/')[1].casefold() != row['account'].removeprefix('@').casefold():
            raise ValueError('public URL account mismatch')
        if row['platform'] == 'reddit':
            prefix = urlsplit(row['destination']).path.rstrip('/') + '/comments/'
            profile_alias = '/r/u_' + row['account'].removeprefix('u/') + '/comments/'
            if not parsed.path.casefold().startswith(prefix.casefold()) and not (row['kind'] == 'profile-post' and parsed.path.casefold().startswith(profile_alias.casefold())):
                raise ValueError('public Reddit destination mismatch')
    artifact_proof(observation)
    return state, link

def observe(root, item_id, evidence):
    """Adopt operator-observed readback, never claim cryptographic platform verification."""
    path = Path(evidence).resolve()
    with c.lock(root, 'queue.lock') as state:
        data = c.load(state / 'queue.json', {'items': []})
        row = next((x for x in data['items'] if x['id'] == item_id), None)
        if row is None or row.get('status') not in ('publishing', 'scheduled', 'reconcile'):
            raise ValueError('claimed or scheduled native item required')
        try:
            if not path.is_file() or path.stat().st_size > 1_000_000: raise ValueError('bounded observation file required')
            fresh(row)
            if row.get('approved_payload_sha256') != q.digest(row) or not all(row.get(k) for k in ('approved_by', 'approved_at', 'authorization_receipt')):
                raise ValueError('exact human approval changed')
            raw = path.read_bytes()
            observation = json.loads(raw)
            delivery, link = observation_problem(row, observation, dt.datetime.now(c.UTC))
        except (ValueError, KeyError, TypeError, OSError):
            row.update(status='reconcile', reason='Native effect/readback unresolved; do not resubmit or switch transport.')
            c.atomic(state / 'queue.json', data)
            return {'id': item_id, 'status': 'reconcile', 'external_action': False}
        record = {'schema': 'editorial.native-operator-receipt.v1', 'id': item_id,
                  'trust': 'operator-observed; not independently authenticated', 'operator': observation['operator'],
                  'observation_path': str(path), 'observation_sha256': hashlib.sha256(raw).hexdigest(),
                  'payload_sha256': q.digest(row), 'state': delivery, 'native_id': observation['native_id'],
                  'observed_at': observation['observed_at'], 'artifacts': observation['artifacts']}
        if delivery == 'scheduled':
            record.update(view_url=link, scheduled_for=observation['scheduled_for'])
        if delivery == 'scheduled' and observation['native_id'] is None:
            record.update(identity_kind=observation['identity_kind'],
                          native_id_unavailable_reason=observation['native_id_unavailable_reason'])
        receipt = state / 'receipts' / (hashlib.sha256((item_id + delivery).encode()).hexdigest() + '.json')
        c.atomic(receipt, record)
        row.update(status=delivery, external_id=observation['native_id'], readback_evidence=str(receipt), delivery_trust=record['trust'])
        if delivery == 'scheduled':
            row['scheduled_view_url'] = link
            if observation['native_id'] is None:
                row.update(identity_kind=record['identity_kind'], native_id_unavailable_reason=record['native_id_unavailable_reason'])
        else:
            row.update(public_url=link, published_at=observation['observed_at'])
            row.pop('native_id_unavailable_reason', None)
            row.pop('identity_kind', None)
        c.atomic(state / 'queue.json', data)
        return {'id': item_id, 'status': delivery, 'trust': record['trust'], 'external_action': False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', default='~/.codex/editorial/tryambakam')
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('preview', 'claim', 'observe'):
        command = commands.add_parser(name); command.add_argument('id')
        if name == 'observe': command.add_argument('--evidence', required=True)
    command=commands.add_parser('convert-reviewed')
    for name in ('review','assignment','settings','output','review-base','blog-root'):command.add_argument('--'+name,required=True)
    command.add_argument('--binding-review')
    args = parser.parse_args(); root = Path(args.state).expanduser()
    try:
        if args.command=='convert-reviewed':result=convert_reviewed(args.review,args.assignment,args.settings,args.output,args.review_base,args.binding_review,args.blog_root)
        else:result = observe(root, args.id, args.evidence) if args.command == 'observe' else globals()[args.command](root, args.id)
    except (ValueError, KeyError, OSError): parser.exit(2, 'Native handoff held; review exact approval, current sources and readback.\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
