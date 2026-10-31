// Local only: repeatedly triggers bounded Worker invocations.
const base=process.env.SUPABASE_URL||'http://127.0.0.1:54321';
const token=process.env.PRICE_IMPORT_WORKER_TOKEN||'local-price-worker-only';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname))
  throw Error('Only loopback permitted');
const max=Number(process.argv[2]||1000);
for(let i=0;i<max;i++){
  const r=await fetch(base+'/functions/v1/price-import-worker',{method:'POST',
    headers:{'x-worker-token':token}});
  const body=await r.json().catch(()=>({error:r.status}));
  if(!r.ok)throw Error(JSON.stringify(body));
  if(i%25===0||body.state==='raw_ready')console.log(i+1,JSON.stringify(body));
  if(body.state==='raw_ready')break;
  if(body.state==='empty'||body.state==='not_claimed'||body.state==='retry')
    await new Promise(done=>setTimeout(done,500));
}
