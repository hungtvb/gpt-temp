import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "sb_publishable_LZFN0q5S4Yj800B-0w9rcA_1YmdDfB2";
const WORKER_URL =
  Deno.env.get("ARTIFACT_GATEWAY_WORKER_URL") ??
  "https://artifact-gateway-worker.vercel.app/api/fetch";
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/artifact-gateway-callback`;
const BUCKET = "artifact-gateway";
const MAX_BYTES = 50 * 1024 * 1024;
const TRANSFER_TTL_MS = 30 * 60 * 1000;
const TRANSFER_CHUNK_SIZE = 2 * 1024 * 1024;
const TRANSFER_MAX_REQUESTS = 128;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  "access-control-allow-headers": "content-type, x-agent-key",
  "access-control-allow-methods": "POST, GET, OPTIONS",
};

type AdminClient = ReturnType<typeof createClient>;
type AgentKeyRow = {
  id: string;
  name: string;
  user_id: string | null;
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

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function hmacToken(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return base64Url(new Uint8Array(signature));
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function sanitizeFilename(value: string): string {
  const clean = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return clean && clean !== "." && clean !== ".." ? clean : "artifact.bin";
}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    EXACT_HOSTS.has(host) ||
    ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

function validateSourceUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 4000) {
    throw new Error("sourceUrl is required");
  }
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS sources are allowed");
  }
  if (url.username || url.password) {
    throw new Error("URL credentials are not allowed");
  }
  if (!isAllowedHost(url.hostname)) {
    throw new Error(`Source host is not allowlisted: ${url.hostname}`);
  }
  return url;
}

async function authenticateAgent(req: Request): Promise<{
  admin: AdminClient;
  key: string;
  row: AgentKeyRow;
}> {
  const key = req.headers.get("x-agent-key") || "";
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(key)) {
    throw new Error("Invalid agent key");
  }

  const keyHash = await sha256(key);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("artifact_gateway_agent_keys")
    .select("id,name,user_id")
    .eq("key_hash", keyHash)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Invalid agent key");
  return { admin, key, row: data as AgentKeyRow };
}

async function derivePassword(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`artifact-gateway-agent-password:${key}`),
  );
  return `${base64Url(new Uint8Array(digest))}Aa1!`;
}

async function createAgentUser(
  admin: AdminClient,
  row: AgentKeyRow,
  password: string,
): Promise<{ userId: string; email: string }> {
  const email = `artifact-gateway-agent-${row.id}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      purpose: "artifact-gateway-agent",
      agent_key_id: row.id,
    },
  });
  if (error || !data.user) {
    throw error ?? new Error("Could not create agent user");
  }

  const { error: updateKeyError } = await admin
    .from("artifact_gateway_agent_keys")
    .update({ user_id: data.user.id })
    .eq("id", row.id);
  if (updateKeyError) throw updateKeyError;
  return { userId: data.user.id, email };
}

async function ensureAgentSession(
  admin: AdminClient,
  key: string,
  row: AgentKeyRow,
): Promise<{ userId: string; accessToken: string }> {
  const password = await derivePassword(key);
  let userId = row.user_id;
  let email: string;

  if (!userId) {
    ({ userId, email } = await createAgentUser(admin, row, password));
  } else {
    const { data: existing, error: getUserError } =
      await admin.auth.admin.getUserById(userId);

    if (getUserError || !existing.user?.email) {
      await admin
        .from("artifact_gateway_agent_keys")
        .update({ user_id: null })
        .eq("id", row.id)
        .eq("user_id", userId);
      ({ userId, email } = await createAgentUser(admin, row, password));
    } else {
      email = existing.user.email;
      const { error: updateUserError } =
        await admin.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: {
            purpose: "artifact-gateway-agent",
            agent_key_id: row.id,
          },
        });
      if (updateUserError) throw updateUserError;
    }
  }

  const auth = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data: signedIn, error: signInError } =
    await auth.auth.signInWithPassword({ email, password });

  if (signInError || !signedIn.session?.access_token) {
    throw signInError ?? new Error("Could not create agent session");
  }
  return { userId, accessToken: signedIn.session.access_token };
}

async function triggerWorker(params: {
  admin: AdminClient;
  accessToken: string;
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
  if (!runningJob) return;

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${params.accessToken}`,
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
    const message =
      error instanceof Error ? error.message : "Worker invocation failed";
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

async function findAgentJob(
  admin: AdminClient,
  userId: string,
  jobId: string,
) {
  const { data, error } = await admin
    .from("artifact_gateway_jobs")
    .select(
      "id,user_id,source_url,resolved_url,requested_filename,status," +
        "expected_sha256,actual_sha256,content_type,size_bytes,max_bytes," +
        "storage_path,error_message,metadata,created_at,updated_at," +
        "started_at,completed_at,expires_at",
    )
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method === "GET") {
    return json(200, {
      service: "artifact-gateway-agent-control",
      status: "ok",
      version: "0.3.0",
      project: "clxyqwwdqhipkiuyagsj",
    });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "create";
    const { admin, key, row } = await authenticateAgent(req);
    let userId = row.user_id;
    let accessToken: string | null = null;

    if (action === "setup" || action === "create") {
      const session = await ensureAgentSession(admin, key, row);
      userId = session.userId;
      accessToken = session.accessToken;
    } else if (!userId) {
      return json(409, {
        error: "Agent is not initialized; call setup first",
      });
    }

    if (action === "setup") {
      return json(200, {
        ok: true,
        agent: row.name,
        userId,
      });
    }

    if (action === "create") {
      if (!accessToken || !userId) {
        throw new Error("Agent session was not initialized");
      }
      if (!validUuid(body.requestId)) {
        return json(400, { error: "Valid requestId is required" });
      }
      const source = validateSourceUrl(body.sourceUrl);
      const expectedSha256 =
        body.expectedSha256 == null || body.expectedSha256 === ""
          ? null
          : String(body.expectedSha256).toLowerCase();
      if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
        return json(400, {
          error: "expectedSha256 must be 64 hexadecimal characters",
        });
      }

      const maxBytes = Math.min(
        Number.isInteger(body.maxBytes) ? body.maxBytes : MAX_BYTES,
        MAX_BYTES,
      );
      if (maxBytes < 1) {
        return json(400, { error: "maxBytes must be positive" });
      }

      const { data: existing, error: existingError } = await admin
        .from("artifact_gateway_jobs")
        .select(
          "id,status,source_url,requested_filename,max_bytes,created_at,expires_at",
        )
        .eq("user_id", userId)
        .eq("metadata->>agent_request_id", body.requestId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        return json(200, { job: existing, idempotent: true });
      }

      const filename = sanitizeFilename(
        typeof body.filename === "string" && body.filename
          ? body.filename
          : decodeURIComponent(
              source.pathname.split("/").filter(Boolean).at(-1) ??
                "artifact.bin",
            ),
      );
      const jobId = crypto.randomUUID();
      const callbackToken = base64Url(
        crypto.getRandomValues(new Uint8Array(32)),
      );
      const callbackTokenHash = await sha256(callbackToken);
      const storagePath = `${userId}/${jobId}/${filename}`;

      const { error: insertError } = await admin
        .from("artifact_gateway_jobs")
        .insert({
          id: jobId,
          user_id: userId,
          source_url: source.toString(),
          source_host: source.hostname,
          requested_filename: filename,
          storage_bucket: BUCKET,
          storage_path: storagePath,
          expected_sha256: expectedSha256,
          max_bytes: maxBytes,
          callback_token_hash: callbackTokenHash,
          metadata: {
            worker: "vercel",
            version: "0.3.0",
            agent: row.name,
            agent_request_id: body.requestId,
          },
        });

      if (insertError) {
        const { data: raced } = await admin
          .from("artifact_gateway_jobs")
          .select(
            "id,status,source_url,requested_filename,max_bytes,created_at,expires_at",
          )
          .eq("user_id", userId)
          .eq("metadata->>agent_request_id", body.requestId)
          .maybeSingle();
        if (raced) return json(200, { job: raced, idempotent: true });
        throw insertError;
      }

      const { data: uploadData, error: uploadError } = await admin.storage
        .from(BUCKET)
        .createSignedUploadUrl(storagePath, { upsert: false });
      if (uploadError || !uploadData?.token) {
        await admin.from("artifact_gateway_jobs").delete().eq("id", jobId);
        throw uploadError ??
          new Error("Could not create signed upload token");
      }

      EdgeRuntime.waitUntil(
        triggerWorker({
          admin,
          accessToken,
          jobId,
          userId,
          sourceUrl: source.toString(),
          expectedSha256,
          maxBytes,
          storagePath,
          uploadToken: uploadData.token,
          callbackToken,
        }),
      );

      return json(202, {
        job: {
          id: jobId,
          status: "queued",
          sourceUrl: source.toString(),
          filename,
          maxBytes,
        },
      });
    }

    if (action === "status") {
      if (!validUuid(body.jobId)) {
        return json(400, { error: "Valid jobId is required" });
      }
      const job = await findAgentJob(admin, userId, body.jobId);
      if (!job) return json(404, { error: "Job not found" });
      return json(200, { job });
    }

    if (action === "transfer") {
      if (!validUuid(body.jobId) || !validUuid(body.requestId)) {
        return json(400, {
          error: "Valid jobId and requestId are required",
        });
      }
      const job = await findAgentJob(admin, userId, body.jobId);
      if (!job) return json(404, { error: "Job not found" });
      if (job.status !== "completed") {
        return json(409, {
          error: `Job is ${job.status}, not completed`,
        });
      }
      if (
        !Number.isInteger(job.size_bytes) ||
        job.size_bytes < 1 ||
        !job.actual_sha256
      ) {
        return json(409, {
          error: "Completed job metadata is incomplete",
        });
      }

      const requestKey = `${body.jobId}:${body.requestId}`;
      const token = await hmacToken(
        key,
        `artifact-transfer:${requestKey}`,
      );
      const tokenHash = await sha256(token);
      const expiresAt = new Date(
        Date.now() + TRANSFER_TTL_MS,
      ).toISOString();

      let { data: transfer, error: transferError } = await admin
        .from("artifact_gateway_transfer_sessions")
        .select("id,expires_at,request_count,max_requests,chunk_size")
        .eq("request_key", requestKey)
        .maybeSingle();
      if (transferError) throw transferError;

      if (!transfer) {
        const { data: inserted, error: insertTransferError } = await admin
          .from("artifact_gateway_transfer_sessions")
          .insert({
            job_id: job.id,
            request_key: requestKey,
            token_hash: tokenHash,
            expires_at: expiresAt,
            request_count: 0,
            max_requests: TRANSFER_MAX_REQUESTS,
            chunk_size: TRANSFER_CHUNK_SIZE,
          })
          .select("id,expires_at,request_count,max_requests,chunk_size")
          .single();

        if (insertTransferError) {
          const { data: raced, error: racedError } = await admin
            .from("artifact_gateway_transfer_sessions")
            .select("id,expires_at,request_count,max_requests,chunk_size")
            .eq("request_key", requestKey)
            .single();
          if (racedError) throw racedError;
          transfer = raced;
        } else {
          transfer = inserted;
        }
      }

      return json(200, {
        transfer: {
          token,
          expiresAt: transfer.expires_at,
          chunkSize: transfer.chunk_size,
          maxRequests: transfer.max_requests,
          filename: job.requested_filename,
          sizeBytes: job.size_bytes,
          sha256: job.actual_sha256,
          contentType: job.content_type || "application/octet-stream",
          totalChunks: Math.ceil(
            job.size_bytes / transfer.chunk_size,
          ),
        },
      });
    }

    if (action === "authorize_chunk") {
      const token = typeof body.token === "string" ? body.token : "";
      const offset = Number(body.offset);
      const length = Number(body.length);

      if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) {
        return json(400, { error: "Valid transfer token is required" });
      }
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(length) ||
        length < 1
      ) {
        return json(400, {
          error: "Valid offset and length are required",
        });
      }

      const tokenHash = await sha256(token);
      const { data: transfer, error: transferError } = await admin
        .from("artifact_gateway_transfer_sessions")
        .select(
          "id,job_id,expires_at,request_count,max_requests,chunk_size",
        )
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (transferError) throw transferError;
      if (!transfer) {
        return json(404, { error: "Transfer session not found" });
      }
      if (new Date(transfer.expires_at).getTime() <= Date.now()) {
        return json(410, { error: "Transfer session expired" });
      }
      if (transfer.request_count >= transfer.max_requests) {
        return json(429, { error: "Transfer request limit reached" });
      }
      if (length > transfer.chunk_size) {
        return json(400, {
          error: `length exceeds chunk size ${transfer.chunk_size}`,
        });
      }

      const job = await findAgentJob(
        admin,
        userId,
        transfer.job_id,
      );
      if (!job || job.status !== "completed") {
        return json(409, { error: "Artifact is not available" });
      }

      const totalSize = Number(job.size_bytes);
      if (!Number.isSafeInteger(totalSize) || totalSize < 1) {
        return json(409, { error: "Artifact size is invalid" });
      }
      if (offset >= totalSize || offset + length > totalSize) {
        return json(416, {
          error: "Requested range is outside the artifact",
        });
      }

      const { data: incremented, error: incrementError } = await admin
        .from("artifact_gateway_transfer_sessions")
        .update({ request_count: transfer.request_count + 1 })
        .eq("id", transfer.id)
        .eq("request_count", transfer.request_count)
        .select("id")
        .maybeSingle();
      if (incrementError) throw incrementError;
      if (!incremented) {
        return json(409, {
          error: "Transfer session was used concurrently; retry",
        });
      }

      const { data: signed, error: signedError } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(job.storage_path, 120);
      if (signedError || !signed?.signedUrl) {
        throw signedError ??
          new Error("Could not create signed Storage URL");
      }

      return json(200, {
        chunk: {
          signedUrl: signed.signedUrl,
          offset,
          length,
          endInclusive: offset + length - 1,
          totalSize,
          filename: job.requested_filename,
          fullSha256: job.actual_sha256,
          contentType:
            job.content_type || "application/octet-stream",
        },
      });
    }

    if (action === "cleanup") {
      if (!validUuid(body.jobId)) {
        return json(400, { error: "Valid jobId is required" });
      }
      const job = await findAgentJob(admin, userId, body.jobId);
      if (!job) return json(200, { ok: true, removed: false });

      await admin.storage.from(BUCKET).remove([job.storage_path]);
      const { error: deleteError } = await admin
        .from("artifact_gateway_jobs")
        .delete()
        .eq("id", job.id)
        .eq("user_id", userId);
      if (deleteError) throw deleteError;
      return json(200, { ok: true, removed: true });
    }

    return json(400, { error: `Unsupported action: ${action}` });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown agent-control error";
    const status = message.includes("agent key") ? 401 : 500;
    return json(status, { error: message });
  }
});
