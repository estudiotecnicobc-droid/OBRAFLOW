import { createClient } from '@supabase/supabase-js';
import { readFileSync, statSync } from 'node:fs';
import { resolve,basename } from 'node:path';

const url=process.env.SUPABASE_URL||'http://127.0.0.1:54321';
const anon=process.env.SUPABASE_ANON_KEY;
const filename=resolve(process.argv[2]||'./mock_prices_100k.csv');
if (!['localhost','127.0.0.1'].includes(new URL(url).hostname) || !anon)
  throw Error('Solo Supabase local, con SUPABASE_ANON_KEY local');
const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const email='obraflow-local@example.test',password='OnlyLocalTest!2026';
const {data:session,error:loginError}=await client.auth.signInWithPassword({email,password});
if(loginError||!session.session)throw loginError??Error('No session');
const org='11111111-1111-4111-8111-111111111111';
const uploadId=crypto.randomUUID();
const path=`${org}/${uploadId}/${basename(filename).replace(/[^A-Za-z0-9._-]/g,'_')}`;
if(!path.endsWith('.csv'))throw Error('Archivo debe ser CSV');
const file=readFileSync(filename);
if(file.byteLength>100*1024*1024)throw Error('CSV excede 100MB');
const {error:uploadError}=await client.storage.from('price_imports').upload(path,file,{upsert:false,contentType:'text/csv'});
if(uploadError)throw uploadError;
const {data:batch,error:enqueueError}=await client.functions.invoke('price-import-start',{
 body:{organizationId:org,storagePath:path}
});
if(enqueueError)throw enqueueError;
console.log(JSON.stringify({storagePath:path,batch,fileBytes:statSync(filename).size},null,2));
