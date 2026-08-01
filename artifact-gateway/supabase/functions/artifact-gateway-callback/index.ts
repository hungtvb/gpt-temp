import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "artifact-gateway";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function respond(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  let diff = 0;
  for (let i = 0; i < 64; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { error: "Method not allowed" });

  try {
    const body = await req.json();
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const callbackToken = typeof body.callbackToken === "string" ? body.callbackToken : "";
    const status = body.status === "completed" || body.status === "failed" ? body.status : "";
    if (!jobId || !callbackToken || !status) return respond(400, { error: "Invalid callback payload" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: job, error: readError } = await admin
      .from("artifact_gateway_jobs")
      .select("id,status,callback_token_hash,callback_consumed_at,expected_sha256,storage_path,expires_at")
      .eq("id", jobId)
      .maybeSingle();
    if (readError) throw readError;
    if (!job) return respond(404, { error: "Job not found" });
    if (job.callback_consumed_at) return respond(409, { error: "Callback token already consumed" });
    if (new Date(job.expires_at).getTime() <= Date.now()) return respond(410, { error: "Job expired" });

    const tokenHash = await sha256(callbackToken);
    if (!safeEqualHex(tokenHash, job.callback_token_hash)) return respond(401, { error: "Invalid callback token" });

    let finalStatus: "completed" | "failed" = status;
    let errorMessage = typeof body.error === "string" ? body.error.slice(0, 2000) : null;
    const actualSha256 = typeof body.actualSha256 === "string" && /^[a-f0-9]{64}$/i.test(body.actualSha256)
      ? body.actualSha256.toLowerCase()
      : null;

    if (finalStatus === "completed") {
      if (!actualSha256 || !Number.isInteger(body.sizeBytes) || body.sizeBytes < 1) {
        finalStatus = "failed";
        errorMessage = "Worker completion payload was incomplete";
      } else if (job.expected_sha256 && !safeEqualHex(job.expected_sha256.toLowerCase(), actualSha256)) {
        finalStatus = "failed";
        errorMessage = `SHA-256 mismatch: expected ${job.expected_sha256}, got ${actualSha256}`;
      }
    }

    const { data: updatedJob, error: updateError } = await admin
      .from("artifact_gateway_jobs")
      .update({
        status: finalStatus,
        actual_sha256: actualSha256,
        size_bytes: Number.isInteger(body.sizeBytes) ? body.sizeBytes : null,
        content_type: typeof body.contentType === "string" ? body.contentType.slice(0, 255) : null,
        resolved_url: typeof body.resolvedUrl === "string" ? body.resolvedUrl.slice(0, 4000) : null,
        error_message: errorMessage,
        callback_consumed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .is("callback_consumed_at", null)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updatedJob) return respond(409, { error: "Callback token already consumed" });

    if (finalStatus === "failed") {
      await admin.storage.from(BUCKET).remove([job.storage_path]);
    }

    return respond(200, { ok: true, jobId, status: finalStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown callback error";
    return respond(500, { error: message });
  }
});
