// Only local Supabase development. Refuses non-loopback origin.
import { createClient } from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL||'http://127.0.0.1:54321';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!new URL(url).hostname.match(/^(localhost|127\.0\.0\.1)$/) || !key)
  throw Error('Solo se permite Supabase local y SERVICE_ROLE_KEY local');
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const id='44444444-4444-4444-8444-444444444444';
const email='obraflow-local@example.test';
const password='OnlyLocalTest!2026';
const {data:user,error}=await admin.auth.admin.createUser({
 id,email,password,email_confirm:true,user_metadata:{test_user:true}
});
if (error && !/already|registered|exists/i.test(error.message))throw error;
const userId=user.user?.id??id;
const {error:e}=await admin.from('organization_members').upsert({
 organization_id:'11111111-1111-4111-8111-111111111111',
 user_id:userId,role:'owner'
},{onConflict:'organization_id,user_id'});
if(e)throw e;
console.log(JSON.stringify({email,password,organizationId:'11111111-1111-4111-8111-111111111111',supplierId:'33333333-3333-4333-8333-333333333333',userId},null,2));
