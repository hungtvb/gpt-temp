import { createHash, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createClient } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "node:http";

const SUPABASE_URL = "https://kapfoxuuuprmuersmoqf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_IBAYWhrjCNzT6SG80M1sRw_tkZo_ZPo";
const MAX_HARD_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const ARTIFACT_BUCKET = "artifact-gateway";
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/artifact-gateway-callback`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

type JobRequest = {
  jobId: string;
  userId: string;
  sourceUrl: string;
  expectedSha256?: string | null;
  maxBytes: number;
  upload: {
    bucket: string;
    path: string;
    token: string;
  };
  callback: {
    url: string;
    token: string;
  };
};

type CallbackPayload = {
  jobId: string;
  callbackToken: string;
  status: "completed" | "failed";
  actualSha256?: string;
  sizeBytes?: number;
  contentType?: string;
  resolvedUrl?: string;
  error?: string;
};

type AuthorizedJob = {
  id: string;
  userId: string;
  sourceUrl: string;
  expectedSha256: string | null;
  maxBytes: number;
  storageBucket: string;
  storagePath: string;
};

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 128 * 1024) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return EXACT_HOSTS.has(host) || ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function normalizeIpv6(address: string): string {
  return address.toLowerCase().split("%")[0];
}

function isPrivateIpv6(address: string): boolean {
  const value = normalizeIpv6(address);
  if (value === "::" || value === "::1") return true;
  if (
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb")
  ) return true;
  if (value.startsWith("ff")) return true;
  if (value.startsWith("2001:db8")) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function validateUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Only HTTPS sources are allowed");
  if (url.username || url.password) throw new Error("URL credentials are not allowed");
  if (!isAllowedHost(url.hostname)) throw new Error(`Source host is not allowlisted: ${url.hostname}`);

  const results = await lookup(url.hostname, { all: true, verbatim: true });
  if (results.length === 0) throw new Error("Source hostname did not resolve");
  if (results.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Source hostname resolves to a private or reserved address");
  }
  return url;
}

async function validateUser(authorization: string | undefined): Promise<{ id: string }> {
  if (!authorization?.startsWith("Bearer ")) throw new Error("Missing bearer token");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      authorization,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Invalid Supabase user token");
  const user = (await response.json()) as { id?: string };
  if (!user.id) throw new Error("Supabase user response did not contain an id");
  return { id: user.id };
}

async function fetchWithValidatedRedirects(sourceUrl: string, maxBytes: number): Promise<{
  bytes: Uint8Array;
  contentType: string;
  resolvedUrl: string;
  sha256: string;
}> {
  let current = await validateUrl(sourceUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        "user-agent": "hungtvb-artifact-gateway/0.1",
        accept: "application/octet-stream,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(45_000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response did not include Location");
      if (redirectCount === MAX_REDIRECTS) throw new Error("Too many redirects");
      current = await validateUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);

    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(`Upstream Content-Length exceeds maxBytes (${declaredLength} > ${maxBytes})`);
    }
    if (!response.body) throw new Error("Upstream response has no body");

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    const hash = createHash("sha256");
    let total = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("size limit exceeded");
        throw new Error(`Downloaded content exceeds maxBytes (${maxBytes})`);
      }
      hash.update(value);
      chunks.push(value);
    }

    if (total === 0) throw new Error("Downloaded content is empty");
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      bytes,
      contentType: response.headers.get("content-type")?.split(";")[0] || "application/octet-stream",
      resolvedUrl: current.toString(),
      sha256: hash.digest("hex"),
    };
  }

  throw new Error("Redirect loop terminated unexpectedly");
}

function equalHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left.toLowerCase(), "hex"), Buffer.from(right.toLowerCase(), "hex"));
}

async function sendCallback(payload: CallbackPayload): Promise<void> {
  const response = await fetch(CALLBACK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Callback failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
}

async function authorizeJob(body: JobRequest): Promise<AuthorizedJob> {
  const response = await fetch(CALLBACK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "authorize",
      jobId: body.jobId,
      userId: body.userId,
      callbackToken: body.callback.token,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Job authorization failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  const payload = JSON.parse(text) as { job?: AuthorizedJob };
  if (!payload.job) throw new Error("Job authorization response is incomplete");
  return payload.job;
}

function assertAuthorizedRequest(body: JobRequest, job: AuthorizedJob): void {
  if (job.id !== body.jobId || job.userId !== body.userId) throw new Error("Authorized job identity mismatch");
  if (job.sourceUrl !== body.sourceUrl) throw new Error("Authorized source URL mismatch");
  if (job.maxBytes !== body.maxBytes) throw new Error("Authorized maxBytes mismatch");
  if (job.storageBucket !== body.upload.bucket || job.storagePath !== body.upload.path) {
    throw new Error("Authorized upload destination mismatch");
  }
  const requestedHash = body.expectedSha256?.toLowerCase() || null;
  const authorizedHash = job.expectedSha256?.toLowerCase() || null;
  if (requestedHash !== authorizedHash) throw new Error("Authorized checksum mismatch");
}

function assertJobRequest(value: unknown): asserts value is JobRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid request body");
  const body = value as Partial<JobRequest>;
  if (!body.jobId || !body.userId || !body.sourceUrl) throw new Error("Missing job identifiers or sourceUrl");
  if (!UUID_PATTERN.test(body.jobId) || !UUID_PATTERN.test(body.userId)) throw new Error("Invalid jobId or userId");
  if (body.sourceUrl.length > 4000) throw new Error("sourceUrl is too long");
  if (!body.upload?.bucket || !body.upload.path || !body.upload.token) throw new Error("Missing signed upload parameters");
  if (body.upload.bucket !== ARTIFACT_BUCKET) throw new Error("Invalid upload bucket");
  if (
    !body.upload.path.startsWith(`${body.userId}/${body.jobId}/`) ||
    body.upload.path.includes("..") ||
    body.upload.path.length > 1024
  ) throw new Error("Invalid upload path");
  if (body.upload.token.length < 20 || body.upload.token.length > 4096) throw new Error("Invalid upload token");
  if (!body.callback?.url || !body.callback.token) throw new Error("Missing callback parameters");
  if (body.callback.url !== CALLBACK_URL) throw new Error("Invalid callback URL");
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(body.callback.token)) throw new Error("Invalid callback token");
  if (!Number.isInteger(body.maxBytes) || Number(body.maxBytes) < 1 || Number(body.maxBytes) > MAX_HARD_BYTES) {
    throw new Error(`maxBytes must be between 1 and ${MAX_HARD_BYTES}`);
  }
  if (body.expectedSha256 && !/^[a-f0-9]{64}$/i.test(body.expectedSha256)) {
    throw new Error("expectedSha256 must be 64 hexadecimal characters");
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "GET") {
    json(res, 200, { service: "artifact-gateway-worker", status: "ok", version: "0.1.0" });
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  let body: JobRequest | undefined;
  try {
    const user = await validateUser(req.headers.authorization);
    const parsed = await readJson(req);
    assertJobRequest(parsed);
    body = parsed;
    if (body.userId !== user.id) throw new Error("Job user does not match bearer token");

    const authorizedJob = await authorizeJob(body);
    assertAuthorizedRequest(body, authorizedJob);

    const downloaded = await fetchWithValidatedRedirects(
      authorizedJob.sourceUrl,
      Math.min(authorizedJob.maxBytes, MAX_HARD_BYTES),
    );
    if (authorizedJob.expectedSha256 && !equalHex(authorizedJob.expectedSha256, downloaded.sha256)) {
      throw new Error(`SHA-256 mismatch: expected ${authorizedJob.expectedSha256}, got ${downloaded.sha256}`);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error: uploadError } = await supabase.storage
      .from(body.upload.bucket)
      .uploadToSignedUrl(body.upload.path, body.upload.token, downloaded.bytes, {
        contentType: downloaded.contentType,
        upsert: false,
      });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    await sendCallback({
      jobId: body.jobId,
      callbackToken: body.callback.token,
      status: "completed",
      actualSha256: downloaded.sha256,
      sizeBytes: downloaded.bytes.byteLength,
      contentType: downloaded.contentType,
      resolvedUrl: downloaded.resolvedUrl,
    });

    json(res, 200, {
      ok: true,
      jobId: body.jobId,
      sha256: downloaded.sha256,
      sizeBytes: downloaded.bytes.byteLength,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    if (body?.callback?.url && body.callback.token && body.jobId) {
      try {
        await sendCallback({
          jobId: body.jobId,
          callbackToken: body.callback.token,
          status: "failed",
          error: message.slice(0, 2000),
        });
      } catch {
        // Avoid leaking callback details or replacing the primary error.
      }
    }
    json(res, message.includes("token") ? 401 : 400, { ok: false, error: message });
  }
}
