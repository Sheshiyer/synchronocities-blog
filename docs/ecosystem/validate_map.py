#!/usr/bin/env python3
"""Validate links, evidence digests and graph connectivity without external access."""
import hashlib,json,pathlib,re
root=pathlib.Path(__file__).resolve().parent
g=json.loads((root/'ecosystem-map.json').read_text());errors=[];checked=0
for p in root.glob('*.md'):
 for dest in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if dest.startswith('https://'):continue
  if not (p.parent/pathlib.Path(dest)).exists():errors.append(str(p.name)+': '+dest)
  checked+=1
for n in g['nodes']:
 for e in n['evidence']:
  ep=root/e['path']
  if not ep.exists() or hashlib.sha256(ep.read_bytes()).hexdigest()!=e['sha256']:errors.append('evidence '+e['path'])
ids={n['id'] for n in g['nodes']};connected={'ecosystem:publishing'}
while True:
 old=len(connected)
 for e in g['edges']:
  if e['source'] in connected:connected.add(e['target'])
  if e['target'] in connected:connected.add(e['source'])
 if len(connected)==old:break
checks={'unique_node_ids':len(ids)==len(g['nodes']),'unique_edge_ids':len({e['id'] for e in g['edges']})==len(g['edges']),'all_edge_endpoints_resolve':all(e['source'] in ids and e['target'] in ids for e in g['edges']),'single_connected_component':connected==ids,'markdown_local_links_checked':checked,'evidence_hashes_checked':sum(len(n['evidence']) for n in g['nodes']),'source_identities':sum(n['type'] in ['editorial-source','work-identity'] for n in g['nodes']),'work_identities':sum(n['type']=='work-identity' for n in g['nodes'])}
for k,v in checks.items():
 if v is False:errors.append(k)
result={'schema':'noesis.ecosystem-map-validation.v1','observedAt':g['observedAt'],'checks':checks,'errors':errors,'limits':['No new account/API probes or source body ingestion; reuses dated evidence','Markdown links were checked locally; external links not re-fetched']}
(root/'VALIDATION.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2));raise SystemExit(bool(errors))
