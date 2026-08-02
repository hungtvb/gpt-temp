import { createHash } from "node:crypto";

const CONTROL_URL =
  process.env.ARTIFACT_GATEWAY_CONTROL_URL ??
  "https://clxyqwwdqhipkiuyagsj.supabase.co/functions/v1/artifact-gateway-agent-control";
const AGENT_KEY = process.env.ARTIFACT_GATEWAY_AGENT_KEY;
const MAX_CHUNK_SIZE = 2 * 1024 * 1024;

if (!AGENT_KEY) {
  throw new Error("ARTIFACT_GATEWAY_AGENT_KEY is required");
}

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.send(JSON.stringify(payload));
}

function queryValue(url, name) {
  const value = url.searchParams.get(name);
  return value == null ? undefined : value;
}

async function callControl(body) {
  const response = await fetch(CONTROL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-key": AGENT_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`Agent control returned ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const url = new URL(
    req.url,
    "https://artifact-gateway-agent-bridge.vercel.app",
  );
  const action = queryValue(url, "action") || "health";

  try {
    if (action === "health") {
      return sendJson(res, 200, {
        service: "artifact-gateway-agent-bridge",
        status: "ok",
        version: "0.3.0",
        project: "clxyqwwdqhipkiuyagsj",
      });
    }

    if (action === "setup") {
      return sendJson(res, 200, await callControl({ action: "setup" }));
    }

    if (action === "create") {
      const maxBytesRaw = queryValue(url, "maxBytes");
      return sendJson(
        res,
        200,
        await callControl({
          action: "create",
          requestId: queryValue(url, "requestId"),
          sourceUrl: queryValue(url, "sourceUrl"),
          filename: queryValue(url, "filename"),
          expectedSha256: queryValue(url, "expectedSha256"),
          maxBytes: maxBytesRaw == null ? undefined : Number(maxBytesRaw),
        }),
      );
    }

    if (action === "status") {
      return sendJson(
        res,
        200,
        await callControl({
          action: "status",
          jobId: queryValue(url, "jobId"),
        }),
      );
    }

    if (action === "transfer") {
      return sendJson(
        res,
        200,
        await callControl({
          action: "transfer",
          jobId: queryValue(url, "jobId"),
          requestId: queryValue(url, "requestId"),
        }),
      );
    }

    if (action === "chunk") {
      const token = queryValue(url, "token");
      const offset = Number(queryValue(url, "offset"));
      const length = Number(queryValue(url, "length"));

      if (
        !Number.isInteger(length) ||
        length < 1 ||
        length > MAX_CHUNK_SIZE
      ) {
        return sendJson(res, 400, {
          error: `length must be between 1 and ${MAX_CHUNK_SIZE}`,
        });
      }

      const authorized = await callControl({
        action: "authorize_chunk",
        token,
        offset,
        length,
      });
      const chunk = authorized.chunk;

      const upstream = await fetch(chunk.signedUrl, {
        headers: {
          range: `bytes=${chunk.offset}-${chunk.endInclusive}`,
        },
        signal: AbortSignal.timeout(90_000),
      });
      if (!upstream.ok) {
        throw new Error(`Storage returned ${upstream.status}`);
      }

      let bytes = Buffer.from(await upstream.arrayBuffer());
      if (
        upstream.status === 200 &&
        bytes.length === chunk.totalSize
      ) {
        bytes = bytes.subarray(
          chunk.offset,
          chunk.offset + chunk.length,
        );
      }

      if (bytes.length !== chunk.length) {
        throw new Error(
          `Chunk length mismatch: expected ${chunk.length}, got ${bytes.length}`,
        );
      }

      const encoded = bytes.toString("base64");
      const dataBase64Parts = [];
      for (let i = 0; i < encoded.length; i += 64) {
        dataBase64Parts.push(encoded.slice(i, i + 64));
      }

      return sendJson(res, 200, {
        chunk: {
          offset: chunk.offset,
          length: bytes.length,
          totalSize: chunk.totalSize,
          chunkSha256: createHash("sha256")
            .update(bytes)
            .digest("hex"),
          fullSha256: chunk.fullSha256,
          filename: chunk.filename,
          contentType: chunk.contentType,
          dataBase64Parts,
        },
      });
    }

    if (action === "cleanup") {
      return sendJson(
        res,
        200,
        await callControl({
          action: "cleanup",
          jobId: queryValue(url, "jobId"),
        }),
      );
    }

    return sendJson(res, 400, {
      error: `Unsupported action: ${action}`,
    });
  } catch (error) {
    const status = Number.isInteger(error?.status)
      ? error.status
      : 500;
    return sendJson(res, status, {
      error: error instanceof Error ? error.message : String(error),
      detail: error?.payload,
    });
  }
}
