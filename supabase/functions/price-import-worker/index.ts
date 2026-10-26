import { createClient } from "npm:@supabase/supabase-js@2.99.1";

// DESIGN DRAFT: worker accepts service-only invocation, preferably via
// pg_cron -> pg_net or external scheduler, with dedicated WORKER_TOKEN.
// Strictly NEVER expose SUPABASE_SERVICE_ROLE_KEY to browser.
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const workerToken = Deno.env.get("PRICE_IMPORT_WORKER_TOKEN")!;
const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
type Batch = {
  id: string; storage_bucket: string; storage_path: string;
  source_format: "csv"; size_bytes: number;
  next_byte_offset: number; next_row_number: number;
  header_cells: string[] | null; csv_delimiter: string | null;
  attempts: number; lease_token: string;
};
const json = (x: unknown, code = 200) =>
  new Response(JSON.stringify(x), {
    status: code, headers: { "content-type": "application/json" }
  });
const checked = (x: { error: { message: string } | null; data?: unknown }) => {
  if (x.error) throw Error(x.error.message);
  return x.data;
};

function csvRecord(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let val = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { val += '"'; i++; }
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      out.push(val); val = "";
    } else val += c;
  }
  if (quoted) throw Error("CSV_MULTILINE_NOT_SUPPORTED");
  out.push(val);
  return out;
}
function detectDelimiter(header: string): string {
  const candidates = [",", ";", "\t"];
  return candidates
    .map(d => ({ d, count: csvRecord(header, d).length }))
    .sort((a, b) => b.count - a.count)[0].d;
}
async function getCsvChunk(batch: Batch) {
  // Range fetch. Only complete LF-terminated records are committed.
  // CSV format contract for v1: UTF-8, LF/CRLF, no embedded newlines.
  const from = Number(batch.next_byte_offset);
  const end = Math.min(batch.size_bytes - 1, from + 262143);
  const r = await fetch(
    url + "/storage/v1/object/authenticated/" +
    batch.storage_bucket + "/" +
    batch.storage_path.split("/").map(encodeURIComponent).join("/"),
    { headers: {
      Authorization: "Bearer " + serviceKey,
      apikey: serviceKey,
      Range: "bytes=" + from + "-" + end
    } }
  );
  if (!r.ok || (from > 0 && r.status !== 206))
    throw Error("STORAGE_RANGE_NOT_SUPPORTED: " + r.status);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length !== end - from + 1)
    throw Error("STORAGE_RANGE_SIZE_MISMATCH");
  const isLast = end === batch.size_bytes - 1;
  let consumed = bytes.length;
  if (!isLast) {
    const newline = bytes.lastIndexOf(10);
    if (newline < 0) throw Error("CSV_LINE_EXCEEDS_256K");
    consumed = newline + 1;
  }
  const part = bytes.subarray(0, consumed);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(part);
  const lines = text.split("\n").map(s => s.endsWith("\r") ? s.slice(0, -1) : s);
  if (lines.at(-1) === "") lines.pop();

  let delimiter = batch.csv_delimiter;
  let header = batch.header_cells;
  if (!header) {
    const first = lines.shift()?.replace(/^\uFEFF/, "");
    if (!first) throw Error("CSV_HEADER_MISSING");
    delimiter = detectDelimiter(first);
    header = csvRecord(first, delimiter);
    if (header.length < 2 || header.length > 200) throw Error("INVALID_HEADER");
  }
  const rows = lines.filter(l => l.length > 0).map((line, index) => ({
    row_number: batch.next_row_number + index,
    raw_cells: csvRecord(line, delimiter!)
  }));
  // Atomic commit RPC caps chunks at 250 rows. Never drop remaining lines:
  // conservatively fail and request a smaller byte window if too many rows.
  if (rows.length > 250) throw Error("CSV_CHUNK_EXCEEDS_250_ROWS");
  return {
    rows, header, delimiter,
    nextOffset: from + consumed,
    done: from + consumed === batch.size_bytes
  };
}

async function oneMessage() {
  const msgs = checked(await db.rpc("price_import_poll")) as
    { msg_id: number; read_ct: number; batch_id: string }[] | null;
  const msg = msgs?.[0];
  if (!msg) return { state: "empty" };
  const batches = checked(await db.rpc("price_import_claim", {
    p_batch_id: msg.batch_id,
    p_msg_id: msg.msg_id
  })) as Batch[] | null;
  const batch = batches?.[0];
  if (!batch) {
    const { data } = await db.from("price_import_batches")
      .select("status").eq("id", msg.batch_id).maybeSingle();
    if (data && ["raw_ready", "failed", "cancelled"].includes(data.status)) {
      checked(await db.rpc("price_import_archive", { p_msg_id: msg.msg_id }));
    } else {
      checked(await db.rpc("price_import_defer", {
        p_msg_id: msg.msg_id, p_seconds: 30
      }));
    }
    return { state: "not_claimed" };
  }
  try {
    if (batch.source_format !== "csv") throw Error("CSV_ONLY");
    const chunk = await getCsvChunk(batch);
    checked(await db.rpc("price_import_commit_chunk", {
      p_batch_id: batch.id,
      p_lease_token: batch.lease_token,
      p_msg_id: msg.msg_id,
      p_rows: chunk.rows,
      p_next_byte_offset: chunk.nextOffset,
      p_done: chunk.done,
      p_header_cells: batch.header_cells ? null : chunk.header,
      p_csv_delimiter: batch.csv_delimiter ? null : chunk.delimiter
    }));
    return { state: chunk.done ? "raw_ready" : "chunk_done",
      inserted: chunk.rows.length };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Unknown error";
    const terminal = /^(CSV_MULTILINE|CSV_LINE_EXCEEDS|XLSX_|INVALID_|CSV_HEADER|STORAGE_RANGE_NOT_SUPPORTED|CSV_ONLY)/.test(reason)
      || batch.attempts >= 5;
    checked(await db.rpc("price_import_handle_failure", {
      p_batch_id: batch.id,
      p_lease_token: batch.lease_token,
      p_msg_id: msg.msg_id,
      p_error: reason,
      p_terminal: terminal,
      p_retry_seconds: Math.min(3600, Math.pow(2, batch.attempts) * 15)
    }));
    return { state: terminal ? "failed" : "retry", reason };
  }
}

// No self-reinvocation; scheduler invokes once per tick; each invocation
// handles one bounded chunk. Configure verify_jwt=false only if the
// PRICE_IMPORT_WORKER_TOKEN header is checked as below.
Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!workerToken || req.headers.get("x-worker-token") !== workerToken)
    return json({ error: "unauthorized" }, 401);
  try { return json(await oneMessage()); }
  catch (e) {
    console.error("price-import worker", e);
    return json({ error: "worker unavailable" }, 500);
  }
});
