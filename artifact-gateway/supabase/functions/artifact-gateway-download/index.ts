import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "artifact-gateway";
const TOKEN_TTL_SECONDS = 15 * 60;
const TOKEN_MAX_USES = 2;
const SELF_URL =
  `${SUPABASE_URL}/functions/v1/artifact-gateway-download`;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, GET, OPTIONS",
};

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string): Promise<string> {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  );
}

function validToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{40,128}$/.test(value)
  );
}

function safeFilename(value: string): string {
  const clean = value.replace(/[\r\n"\\/]+/g, "-").slice(0, 180);
  return clean || "artifact.bin";
}

async function createToken(req: Request): Promise<Response> {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(401, { error: "Missing bearer token" });
  }

  const body = await req.json();
  if (!validUuid(body.jobId)) {
    return json(400, { error: "Valid jobId is required" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = authorization.slice("Bearer ".length);
  const { data: authData, error: authError } =
    await admin.auth.getUser(jwt);
  if (authError || !authData.user) {
    return json(401, { error: "Invalid user token" });
  }

  const { data: job, error: jobError } = await admin
    .from("artifact_gateway_jobs")
    .select(
      "id,user_id,status,storage_path,requested_filename," +
        "actual_sha256,size_bytes,content_type,expires_at",
    )
    .eq("id", body.jobId)
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (jobError) throw jobError;
  if (!job) return json(404, { error: "Job not found" });
  if (job.status !== "completed") {
    return json(409, {
      error: `Job is ${job.status}, not completed`,
    });
  }
  if (new Date(job.expires_at).getTime() <= Date.now()) {
    return json(410, { error: "Job expired" });
  }

  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const expiresAt = new Date(
    Date.now() + TOKEN_TTL_SECONDS * 1000,
  ).toISOString();

  const { error: insertError } = await admin
    .from("artifact_gateway_download_tokens")
    .insert({
      job_id: job.id,
      user_id: job.user_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      use_count: 0,
      max_uses: TOKEN_MAX_USES,
    });
  if (insertError) throw insertError;

  return json(200, {
    download: {
      url: `${SELF_URL}?token=${encodeURIComponent(token)}`,
      expiresAt,
      allowedUses: TOKEN_MAX_USES,
      filename: job.requested_filename,
      sha256: job.actual_sha256,
      sizeBytes: job.size_bytes,
      contentType: job.content_type || "application/octet-stream",
    },
  });
}

async function streamArtifact(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token");
  if (!validToken(token)) {
    return json(400, { error: "Valid token is required" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tokenHash = await sha256(token);
  const { data: tokenRow, error: tokenError } = await admin
    .from("artifact_gateway_download_tokens")
    .select(
      "id,job_id,user_id,expires_at,consumed_at,use_count,max_uses",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError) throw tokenError;
  if (!tokenRow) {
    return json(404, { error: "Download token not found" });
  }
  if (
    tokenRow.consumed_at ||
    tokenRow.use_count >= tokenRow.max_uses
  ) {
    return json(409, { error: "Download token exhausted" });
  }
  if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    return json(410, { error: "Download token expired" });
  }

  const { data: job, error: jobError } = await admin
    .from("artifact_gateway_jobs")
    .select(
      "id,status,storage_path,requested_filename,actual_sha256," +
        "size_bytes,content_type,expires_at",
    )
    .eq("id", tokenRow.job_id)
    .eq("user_id", tokenRow.user_id)
    .maybeSingle();

  if (jobError) throw jobError;
  if (!job || job.status !== "completed") {
    return json(409, { error: "Artifact is not available" });
  }
  if (new Date(job.expires_at).getTime() <= Date.now()) {
    return json(410, { error: "Artifact expired" });
  }

  const { data: blob, error: downloadError } =
    await admin.storage.from(BUCKET).download(job.storage_path);
  if (downloadError || !blob) {
    throw downloadError ??
      new Error("Could not read artifact from Storage");
  }
  if (
    job.size_bytes != null &&
    blob.size !== Number(job.size_bytes)
  ) {
    throw new Error(
      `Stored artifact size mismatch: expected ${job.size_bytes}, got ${blob.size}`,
    );
  }

  const nextUseCount = tokenRow.use_count + 1;
  const consumedAt =
    nextUseCount >= tokenRow.max_uses
      ? new Date().toISOString()
      : null;

  const { data: consumed, error: consumeError } = await admin
    .from("artifact_gateway_download_tokens")
    .update({
      use_count: nextUseCount,
      consumed_at: consumedAt,
    })
    .eq("id", tokenRow.id)
    .eq("use_count", tokenRow.use_count)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  if (consumeError) throw consumeError;
  if (!consumed) {
    return json(409, {
      error: "Download token was used concurrently",
    });
  }

  const filename = safeFilename(job.requested_filename);
  return new Response(blob.stream(), {
    status: 200,
    headers: {
      "content-type":
        job.content_type || blob.type || "application/octet-stream",
      "content-length": String(blob.size),
      "content-disposition":
        `attachment; filename="${filename}"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "x-artifact-sha256": job.actual_sha256 || "",
      "x-artifact-use": String(nextUseCount),
      "x-artifact-max-uses": String(tokenRow.max_uses),
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method === "POST") return await createToken(req);
    if (req.method === "GET") return await streamArtifact(req);
    return json(405, { error: "Method not allowed" });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown download gateway error";
    return json(500, { error: message });
  }
});
