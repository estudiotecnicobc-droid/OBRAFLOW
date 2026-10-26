import { parse } from "jsr:@std/csv@1.0.6/parse";
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
  // @std/csv implements RFC 4180 quote escaping. A chunk contains
  // one physical line per record: multiline quoted fields are rejected.
  if (line.includes("\n") || line.includes("\r"))
    throw Error("CSV_MULTILINE_NOT_SUPPORTED");
  const records = parse(line, { separator: delimiter, skipFirstRow: false });
  if (records.length !== 1) throw Error("INVALID_CSV_RECORD");
  return records[0];
}
function detectDelimiter(header: string): string {
  const possible = [",", ";", "\t"];
  const parsed = possible.flatMap(separator => {
    try { return [{ separator, cells: csvRecord(header,separator) }]; }
    catch { return []; }
  }).sort((a,b)=>b.cells.length-a.cells.length);
  if (!parsed.length || parsed[0].cells.length < 2)
    throw Error("CSV_HEADER_INVALID");
  return parsed[0].separator;
}
// Each RPC commit accepts <= 250 rows; allow smaller chunks for tighter
// Edge resource budgets. Never permit an environment variable to exceed SQL.
function boundedInt(name: string, fallback: number, min: number, max: number) {
  const value = Number(Deno.env.get(name) ?? fallback);
  return Number.isSafeInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
const MAX_ROWS = boundedInt("PRICE_IMPORT_CHUNK_ROWS", 250, 1, 250);
const MAX_RANGE_BYTES = boundedInt("PRICE_IMPORT_RANGE_BYTES", 262144, 16384, 262144);

// Streaming network response: buffer ONLY the requested byte range, never
// Storage's whole CSV. Explicitly reject servers that ignore Range for large
// files to avoid accidental 100 MB response allocations.
async function readBoundedRange(response: Response, expected: number) {
  if (!response.body) throw Error("STORAGE_EMPTY_RESPONSE");
  const reader = response.body.getReader();
  const pieces: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < expected) {
      const { value, done } = await reader.read();
      if (done) throw Error("STORAGE_RANGE_TRUNCATED");
      if (!value) continue;
      total += value.byteLength;
      if (total > expected) throw Error("STORAGE_RANGE_OVERSIZED");
      pieces.push(value);
    }
  } finally {
    // Stop promptly once the requested range has arrived.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(expected);
  let cursor = 0;
  for (const piece of pieces) {
    bytes.set(piece, cursor);
    cursor += piece.byteLength;
  }
  return bytes;
}

export async function getCsvChunk(batch: Batch) {
  // One invocation = one small contiguous slice of a UTF-8/LF CSV.
  // The client must normalize CSV to UTF-8 and forbid newlines in fields.
  const from = Number(batch.next_byte_offset);
  if (!Number.isSafeInteger(from) || from < 0 || from >= batch.size_bytes)
    throw Error("INVALID_CSV_CURSOR");
  const to = Math.min(batch.size_bytes - 1, from + MAX_RANGE_BYTES - 1);
  const expected = to - from + 1;
  const response = await fetch(
    url + "/storage/v1/object/authenticated/" +
    batch.storage_bucket + "/" +
    batch.storage_path.split("/").map(encodeURIComponent).join("/"),
    { headers: {
      Authorization: "Bearer " + serviceKey,
      apikey: serviceKey,
      Range: "bytes=" + from + "-" + to
    } }
  );

  if (!response.ok) throw Error("STORAGE_READ_FAILED_" + response.status);
  if (response.headers.get("content-encoding") &&
      response.headers.get("content-encoding") !== "identity")
    throw Error("STORAGE_COMPRESSED_RANGE_UNSUPPORTED");

  if (response.status === 206) {
    const range = response.headers.get("content-range") ?? "";
    const parts = /^bytes ([0-9]+)-([0-9]+)\/([0-9]+)$/.exec(range);
    if (!parts || Number(parts[1]) !== from ||
        Number(parts[2]) !== to || Number(parts[3]) !== batch.size_bytes)
      throw Error("STORAGE_CONTENT_RANGE_MISMATCH");
  } else if (response.status !== 200 || from !== 0 ||
             expected !== batch.size_bytes) {
    await response.body?.cancel().catch(() => undefined);
    throw Error("STORAGE_RANGE_NOT_SUPPORTED");
  }

  const bytes = await readBoundedRange(response, expected);
  const isLastWindow = to === batch.size_bytes - 1;
  let lastBoundary = 0;
  let lineStart = 0;
  let seenRows = 0;
  let awaitingHeader = batch.header_cells === null;

  // Scan byte positions (not decoded-character indexes): checkpoints must
  // remain accurate with accents and other multibyte UTF-8 content.
  for (let pos = 0; pos < bytes.length; pos++) {
    if (bytes[pos] !== 10) continue; // LF; optional CR before LF.
    const empty = pos === lineStart ||
      (pos === lineStart + 1 && bytes[lineStart] === 13);
    if (!empty) {
      if (awaitingHeader) awaitingHeader = false;
      else seenRows++;
    }
    lastBoundary = pos + 1;
    lineStart = pos + 1;
    if (seenRows >= MAX_ROWS) break;
  }

  // A final CSV record may legitimately omit its trailing newline.
  if (isLastWindow && seenRows < MAX_ROWS && lineStart < bytes.length) {
    const empty = (bytes.length === lineStart + 1 &&
                   bytes[lineStart] === 13);
    if (!empty) {
      if (awaitingHeader) awaitingHeader = false;
      else seenRows++;
    }
    lastBoundary = bytes.length;
  }
  if (lastBoundary === 0) throw Error("CSV_LINE_EXCEEDS_RANGE_LIMIT");

  // Decode at a full line boundary, so UTF-8 codepoints aren't split.
  const text = new TextDecoder("utf-8", { fatal: true })
    .decode(bytes.subarray(0, lastBoundary));
  const lines = text.split("\n").map(line =>
    line.endsWith("\r") ? line.slice(0, -1) : line
  );
  if (lines.at(-1) === "") lines.pop();

  let header = batch.header_cells;
  let delimiter = batch.csv_delimiter;
  if (header === null) {
    const headerLine = lines.shift()?.replace(/^\uFEFF/, "");
    if (!headerLine) throw Error("CSV_HEADER_MISSING");
    delimiter = detectDelimiter(headerLine);
    header = csvRecord(headerLine, delimiter);
    if (header.length < 2 || header.length > 200)
      throw Error("INVALID_HEADER");
  }
  if (!delimiter) throw Error("CSV_DELIMITER_MISSING");

  const rows = lines.filter(line => line.length > 0).map((line, index) => {
    const raw_cells = csvRecord(line, delimiter);
    if (raw_cells.length > 200 ||
        raw_cells.some(cell => cell.length > 16384))
      throw Error("CSV_CELL_LIMIT_EXCEEDED");
    return { row_number: batch.next_row_number + index, raw_cells };
  });
  if (rows.length > MAX_ROWS) throw Error("CSV_ROWS_OUT_OF_BOUNDS");

  const nextOffset = from + lastBoundary;
  return {
    rows, header, delimiter, nextOffset,
    done: nextOffset === batch.size_bytes
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
    const terminal = /^(CSV_MULTILINE|CSV_LINE_EXCEEDS|CSV_LINE_EXCEEDS_RANGE_LIMIT|XLSX_|INVALID_|CSV_HEADER|STORAGE_RANGE_NOT_SUPPORTED|CSV_ONLY)/.test(reason)
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
