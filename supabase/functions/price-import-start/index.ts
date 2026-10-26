import { createClient } from "npm:@supabase/supabase-js@2.99.1";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" }
  });

// Invoked by an authenticated uploader after an immutable private Storage upload.
// Enqueueing is transactional within the SQL RPC.
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = req.headers.get("authorization");
  if (!token || !token.startsWith("Bearer "))
    return json({ error: "authentication required" }, 401);

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: token } },
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: user, error: authError } = await client.auth.getUser();
  if (authError || !user.user) return json({ error: "invalid token" }, 401);

  let body: { organizationId?: string; storagePath?: string };
  try { body = await req.json(); }
  catch { return json({ error: "invalid json" }, 400); }
  if (!body.organizationId || !body.storagePath)
    return json({ error: "missing fields" }, 400);

  const prefix = body.organizationId + "/";
  if (!body.storagePath.startsWith(prefix) ||
      !/^[a-f0-9-]{36}\/[A-Za-z0-9._-]+\.csv$/.test(
        body.storagePath.slice(prefix.length)
      ))
    return json({ error: "invalid path" }, 400);

  const { data: info, error: infoError } = await client.storage
    .from("price_imports").info(body.storagePath);
  if (infoError || !info || info.contentType !== "text/csv") {
    return json({ error: "only text/csv is accepted" }, 415);
  }\n
  // DB confirms membership, object identity, byte size, immutable path,
  // and creates the batch + durable queue message in one transaction.
  const { data: batchId, error } = await client.rpc("enqueue_price_import", {
    p_organization_id: body.organizationId,
    p_storage_path: body.storagePath
  });
  if (error) return json({ error: error.message }, 400);
  return json({ batchId, status: "queued" }, 202);
});
