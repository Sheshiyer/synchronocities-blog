import asyncio,json,os,tempfile,sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
RUNTIME=str(Path(__file__).resolve().parents[1])
async def main():
 with tempfile.TemporaryDirectory() as t:
  env=dict(os.environ,PYTHONPATH=RUNTIME,CEOS_STATE_ROOT=t)
  cfg=StdioServerParameters(command=sys.executable,args=['-m','ceos.mcp'],env=env,cwd=RUNTIME)
  async with stdio_client(cfg) as (read,write):
   async with ClientSession(read,write) as s:
    init=await s.initialize();listed=await s.list_tools()
    assert not any('approve' in x.name for x in listed.tools)
    created=await s.call_tool('job.create',{'job_id':'sdk-probe','scope':'synthetic SDK interoperability','event_id':'create'})
    assert not created.isError,created
    args={'job_id':'sdk-probe','kind':'plan','body':'Synthetic setup plan; no publication.','event_id':'plan-save'}
    first=await s.call_tool('artifact.save',args);second=await s.call_tool('artifact.save',args)
    assert not first.isError and not second.isError,(first,second)
    assert first.content==second.content,'replay result changed'
    recovered=await s.call_tool('artifact.read',{'job_id':'sdk-probe','kind':'plan'});assert not recovered.isError and 'Synthetic setup plan' in str(recovered.content)
    inspected=await s.call_tool('job.inspect',{'job_id':'sdk-probe'});assert not inspected.isError
    from mcp.shared.exceptions import McpError
    try:
     await s.call_tool('operator.approve',{'job_id':'sdk-probe'})
     approval_rejected=False
    except McpError:
     approval_rejected=True
    summary={'protocol':init.protocolVersion,'server':init.serverInfo.name,'tools':[x.name for x in listed.tools],'create_pass':True,'artifact_read_pass':True,'identical_event_replay_pass':True,'approval_call_rejected':approval_rejected,'client':'official Python mcp1.26.0','state':'temporary synthetic, no production mutation'}
    print(json.dumps(summary,indent=2))
    assert approval_rejected
asyncio.run(main())
