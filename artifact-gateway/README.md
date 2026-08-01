# Artifact Gateway

Hybrid ingress gateway for network-restricted CAAS sessions.

```text
restricted container
  -> Supabase control plane
  -> Vercel Internet fetch worker
  -> private Supabase Storage
  -> short-lived signed download URL
  -> /mnt/data
```

## Deployed services

- Worker: `https://artifact-gateway-worker.vercel.app/api/fetch`
- Control: `https://kapfoxuuuprmuersmoqf.supabase.co/functions/v1/artifact-gateway-control`
- Callback: `https://kapfoxuuuprmuersmoqf.supabase.co/functions/v1/artifact-gateway-callback`
- Private bucket: `artifact-gateway`

## Supported sources

The current allowlist covers GitHub archives/releases/raw files, npm registry tarballs, PyPI files, Maven Central, Gradle distributions and Node.js downloads. The worker validates every redirect and rejects private/reserved IP destinations.

## API actions

All control calls are `POST` requests and require a Supabase user access token plus the project's publishable/anon API key.

### Create

```json
{
  "action": "create",
  "sourceUrl": "https://codeload.github.com/owner/repo/zip/refs/heads/main",
  "filename": "repo-main.zip",
  "maxBytes": 52428800,
  "expectedSha256": null
}
```

Returns `202` with a job id. The Vercel worker runs asynchronously and reports completion through the one-time callback.

### Status

```json
{ "action": "status", "jobId": "..." }
```

### Signed download URL

```json
{ "action": "download_url", "jobId": "...", "expiresIn": 900 }
```

### List / delete

```json
{ "action": "list", "limit": 20 }
{ "action": "delete", "jobId": "..." }
```

## CLI helper

```bash
export SUPABASE_URL="https://kapfoxuuuprmuersmoqf.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="<publishable key>"
export SUPABASE_ACCESS_TOKEN="<signed-in user access token>"

node scripts/client.mjs create \
  "https://codeload.github.com/owner/repo/zip/refs/heads/main" \
  "repo-main.zip"

node scripts/client.mjs status <job-id>
node scripts/client.mjs download-url <job-id>
```

The restricted container still cannot `curl` arbitrary Internet URLs. Use the returned signed URL through an available file/download broker and verify the reported SHA-256 after materialization.

## Verification performed

An end-to-end smoke test downloaded a public GitHub README through Vercel, uploaded it into private Supabase Storage, consumed the callback, generated a signed URL, downloaded the object and verified identical SHA-256 and byte size. The temporary test user, job and object were deleted afterward.

## Layout

```text
artifact-gateway/
├── vercel/
│   ├── api/fetch.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── vercel.json
├── supabase/
│   ├── functions/
│   │   ├── artifact-gateway-control/index.ts
│   │   └── artifact-gateway-callback/index.ts
│   └── migrations/
├── scripts/client.mjs
├── SECURITY.md
└── README.md
```
