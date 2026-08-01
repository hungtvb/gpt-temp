#!/usr/bin/env node

const SUPABASE_URL = process.env.SUPABASE_URL;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const API_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !ACCESS_TOKEN || !API_KEY) {
  console.error("Required: SUPABASE_URL, SUPABASE_ACCESS_TOKEN, and SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY");
  process.exit(2);
}

const [command, ...args] = process.argv.slice(2);
const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/artifact-gateway-control`;

const payload = (() => {
  switch (command) {
    case "create": {
      const [sourceUrl, filename, maxBytes, expectedSha256] = args;
      if (!sourceUrl) throw new Error("Usage: client.mjs create <sourceUrl> [filename] [maxBytes] [expectedSha256]");
      return {
        action: "create",
        sourceUrl,
        ...(filename ? { filename } : {}),
        ...(maxBytes ? { maxBytes: Number(maxBytes) } : {}),
        ...(expectedSha256 ? { expectedSha256 } : {}),
      };
    }
    case "status":
      if (!args[0]) throw new Error("Usage: client.mjs status <jobId>");
      return { action: "status", jobId: args[0] };
    case "download-url":
      if (!args[0]) throw new Error("Usage: client.mjs download-url <jobId> [expiresIn]");
      return { action: "download_url", jobId: args[0], ...(args[1] ? { expiresIn: Number(args[1]) } : {}) };
    case "list":
      return { action: "list", ...(args[0] ? { limit: Number(args[0]) } : {}) };
    case "delete":
      if (!args[0]) throw new Error("Usage: client.mjs delete <jobId>");
      return { action: "delete", jobId: args[0] };
    default:
      throw new Error("Commands: create, status, download-url, list, delete");
  }
})();

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    authorization: `Bearer ${ACCESS_TOKEN}`,
    apikey: API_KEY,
    "content-type": "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { raw: text };
}
console.log(JSON.stringify({ httpStatus: response.status, ...body }, null, 2));
if (!response.ok) process.exit(1);
