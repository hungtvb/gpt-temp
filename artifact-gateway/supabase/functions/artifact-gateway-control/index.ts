import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "artifact-gateway";
const WORKER_URL = "https://artifact-gateway-worker.vercel.app/api/fetch";
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/artifact-gateway-callback`;
const MAX_BYTES = 50 * 1024 * 1024;

const EXACT_HOSTS = new Set([
  "github.com",
  "api.github.com",
  "codeload.github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "registry.npmjs.org",
  "files.pythonhosted.org",
  "pypi.org",
  "repo1.maven.org",
  "repo.maven.apache.org",
  "services.gradle.org",
  "downloads.gradle.org",
  "nodejs.org",
]);
const ALLOWED_SUFFIXES = [
  ".githubusercontent.com",
  ".github.com",
  ".npmjs.org",
  ".pythonhosted.org",
  ".maven.org",
  ".gradle.org",
  ".nodejs.org",
];

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

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return EXACT_HOSTS.has(host) || ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function validateSourceUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 4000) throw new Error("sourceUrl is required");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Only HTTPS sources are allowed");
  if (url.username || url.password) throw new Error("URL credentials are not allowed");
  if (!isAllowedHost(url.hostname)) throw new Error(`Source host is not allowlisted: ${url.hostname}`);
  return url;
}

function sanitizeFilename(value: string): string {
  const clean = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return clean && clean !== "." && clean !== ".." ? clean : "artifact.bin";
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function getUser(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Missing bearer token");
  const jwt = authorization.slice("Bearer ".length);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new Error("Invalid user token");
  return { user: data.user, authorization, admin };
}

async function triggerWorker(params: {
  authorization: string;
  admin: ReturnType<typeof createClient>;
  jobId: string;
  userId: string;
  sourceUrl: string;
  expectedSha256: string | null;
  maxBytes: number;
  storagePath: string;
  uploadToken: string;
  callbackToken: string;
}) {
  const { data: runningJob, error: runningError } = await params.admin
    .from("artifact_gateway_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", params.jobId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (runningError) throw runningError;
  if (!runningJob) throw new Error("Job could not transition to running");

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        authorization: params.authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jobId: params.jobId,
        userId: params.userId,
        sourceUrl: params.sourceUrl,
        expectedSha256: params.expectedSha256,
        maxBytes: params.maxBytes,
        upload: {
          bucket: BUCKET,
          path: params.storagePath,
          token: params.uploadToken,
        },
        callback: {
          url: CALLBACK_URL,
          token: params.callbackToken,
        },
      }),
      signal: AbortSignal.timeout(65_000),
    });
    if (!response.ok) {
      const message = (await response.text()).slice(0, 1500);
      throw new Error(`Worker returned HTTP ${response.status}: ${message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker invocation failed";
    const { data: failedJob } = await params.admin
      .from("artifact_gateway_jobs")
      .update({
        status: "failed",
        error_message: message.slice(0, 2000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", params.jobId)
      .in("status", ["queued", "running"])
      .select("id")
      .maybeSingle();
    if (failedJob) {
      await params.admin.storage.from(BUCKET).remove([params.storagePath]);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { error: "Method not allowed" });

  try {
    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "create";
    const { user, authorization, admin } = await getUser(req);

    if (action === "create") {
      const source = validateSourceUrl(body.sourceUrl);
      const expectedSha256 = body.expectedSha256 == null || body.expectedSha256 === ""
        ? null
        : String(body.expectedSha256).toLowerCase();
      if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
        return respond(400, { error: "expectedSha256 must be 64 hexadecimal characters" });
      }
      const maxBytes = Math.min(Number.isInteger(body.maxBytes) ? body.maxBytes : MAX_BYTES, MAX_BYTES);
      if (maxBytes < 1) return respond(400, { error: "maxBytes must be positive" });

      const requestedFilename = sanitizeFilename(
        typeof body.filename === "string" && body.filename
          ? body.filename
          : decodeURIComponent(source.pathname.split("/").filter(Boolean).at(-1) || "artifact.bin"),
      );
      const jobId = crypto.randomUUID();
      const callbackBytes = crypto.getRandomValues(new Uint8Array(32));
      const callbackToken = base64Url(callbackBytes);
      const callbackTokenHash = await sha256(callbackToken);
      const storagePath = `${user.id}/${jobId}/${requestedFilename}`;

      const { error: insertError } = await admin.from("artifact_gateway_jobs").insert({
        id: jobId,
        user_id: user.id,
        source_url: source.toString(),
        source_host: source.hostname,
        requested_filename: requestedFilename,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        expected_sha256: expectedSha256,
        max_bytes: maxBytes,
        callback_token_hash: callbackTokenHash,
        metadata: { worker: "vercel", version: "0.1.0" },
      });
      if (insertError) throw insertError;

      const { data: uploadData, error: uploadError } = await admin.storage
        .from(BUCKET)
        .createSignedUploadUrl(storagePath, { upsert: false });
      if (uploadError || !uploadData?.token) {
        await admin.from("artifact_gateway_jobs").delete().eq("id", jobId);
        throw uploadError ?? new Error("Could not create signed upload token");
      }

      EdgeRuntime.waitUntil(triggerWorker({
        authorization,
        admin,
        jobId,
        userId: user.id,
        sourceUrl: source.toString(),
        expectedSha256,
        maxBytes,
        storagePath,
        uploadToken: uploadData.token,
        callbackToken,
      }));

      return respond(202, {
        job: {
          id: jobId,
          status: "queued",
          sourceUrl: source.toString(),
          filename: requestedFilename,
          maxBytes,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    }

    if (action === "status") {
      if (typeof body.jobId !== "string") return respond(400, { error: "jobId is required" });
      const { data, error } = await admin
        .from("artifact_gateway_jobs")
        .select("id,source_url,resolved_url,requested_filename,status,expected_sha256,actual_sha256,content_type,size_bytes,max_bytes,error_message,created_at,updated_at,started_at,completed_at,expires_at")
        .eq("id", body.jobId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return respond(404, { error: "Job not found" });
      return respond(200, { job: data });
    }

    if (action === "list") {
      const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
      const { data, error } = await admin
        .from("artifact_gateway_jobs")
        .select("id,source_url,requested_filename,status,actual_sha256,size_bytes,error_message,created_at,completed_at,expires_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return respond(200, { jobs: data });
    }

    if (action === "download_url") {
      if (typeof body.jobId !== "string") return respond(400, { error: "jobId is required" });
      const { data: job, error } = await admin
        .from("artifact_gateway_jobs")
        .select("id,status,storage_path,requested_filename,actual_sha256,size_bytes,content_type")
        .eq("id", body.jobId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!job) return respond(404, { error: "Job not found" });
      if (job.status !== "completed") return respond(409, { error: `Job is ${job.status}, not completed` });
      const expiresIn = Math.min(Math.max(Number(body.expiresIn) || 900, 60), 3600);
      const { data: signed, error: signedError } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(job.storage_path, expiresIn, { download: job.requested_filename });
      if (signedError || !signed?.signedUrl) throw signedError ?? new Error("Could not create signed download URL");
      return respond(200, {
        download: {
          url: signed.signedUrl,
          expiresIn,
          filename: job.requested_filename,
          sha256: job.actual_sha256,
          sizeBytes: job.size_bytes,
          contentType: job.content_type,
        },
      });
    }

    if (action === "delete") {
      if (typeof body.jobId !== "string") return respond(400, { error: "jobId is required" });
      const { data: job, error } = await admin
        .from("artifact_gateway_jobs")
        .select("id,status,storage_path")
        .eq("id", body.jobId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!job) return respond(404, { error: "Job not found" });
      if (!["completed", "failed", "expired"].includes(job.status)) {
        return respond(409, { error: "Only finished jobs can be deleted" });
      }
      await admin.storage.from(BUCKET).remove([job.storage_path]);
      const { error: deleteError } = await admin.from("artifact_gateway_jobs").delete().eq("id", job.id);
      if (deleteError) throw deleteError;
      return respond(200, { ok: true });
    }

    return respond(400, { error: `Unsupported action: ${action}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown control-plane error";
    const status = message.includes("token") ? 401 : 400;
    return respond(status, { error: message });
  }
});
