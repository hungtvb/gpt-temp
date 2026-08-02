# Artifact Gateway

Hybrid ingress gateway for network-restricted CAAS sessions.

## Preferred connector-native path

```text
restricted CAAS session
  -> authenticated Vercel connector
  -> protected agent bridge
  -> Supabase agent control
  -> Vercel Internet fetch worker
  -> private Supabase Storage
  -> authorized 2 MiB byte ranges
  -> base64 text parts
  -> local assembly + SHA-256 verification
```

This path does not require GitHub Actions, `web.run`, `container.download`, a temporary PR, a temporary user, or a helper deployment per job. See [`AGENT-BRIDGE.md`](AGENT-BRIDGE.md).

## Deployed services

- Fetch worker: `https://artifact-gateway-worker.vercel.app/api/fetch`
- Agent bridge: `https://artifact-gateway-agent-bridge.vercel.app`
- User control: `https://kapfoxuuuprmuersmoqf.supabase.co/functions/v1/artifact-gateway-control`
- Agent control: `https://kapfoxuuuprmuersmoqf.supabase.co/functions/v1/artifact-gateway-agent-control`
- Callback: `https://kapfoxuuuprmuersmoqf.supabase.co/functions/v1/artifact-gateway-callback`
- Direct binary function: `https://kapfoxuuuprmuersmoqf.supabase.co/functions/v1/artifact-gateway-download`
- Private bucket: `artifact-gateway`

## Supported sources

The allowlist covers GitHub archives/releases/raw files, npm registry tarballs, PyPI files, Maven Central, Gradle distributions and Node.js downloads. The worker validates every redirect and rejects private or reserved IP destinations.

## Connector actions

The protected bridge exposes idempotent query actions:

```text
?action=create&requestId=<uuid>&sourceUrl=<url>&filename=<name>&maxBytes=<bytes>
?action=status&jobId=<uuid>
?action=transfer&jobId=<uuid>&requestId=<uuid>
?action=chunk&token=<token>&offset=<number>&length=<number>
?action=cleanup&jobId=<uuid>
```

Chunk responses contain 64-character base64 parts plus chunk and full SHA-256 values. Assemble them with:

```bash
python scripts/assemble_chunks.py chunk-*.json \
  --output /mnt/data/artifact.zip
```

## User JWT API

The original control API remains available for normal Supabase users. All calls are `POST` requests with a valid user access token.

```json
{
  "action": "create",
  "sourceUrl": "https://codeload.github.com/owner/repo/zip/refs/heads/main",
  "filename": "repo-main.zip",
  "maxBytes": 52428800,
  "expectedSha256": null
}
```

Other actions are `status`, `download_url`, `list` and `delete`. The direct download function can convert a completed user job into a short-lived, usage-limited binary URL.

## Verification

The connector-native path was tested end to end with the public `octocat/Hello-World` ZIP:

- Internet fetch completed through the worker.
- Private Storage upload and callback completed.
- One authenticated range chunk was returned as base64 text parts.
- Local assembly produced exactly 351 bytes.
- SHA-256 matched `acd2fd3563d8de4b46dae1edeb96607b3d105a0a3be894e90aa5472353a93233`.
- ZIP integrity passed and the README contained `Hello World!`.
- The remote job, object and transfer session were removed afterward.

## Layout

```text
artifact-gateway/
├── vercel/                         # Internet fetch worker
├── vercel-agent-bridge/            # protected connector API
├── supabase/
│   ├── functions/
│   │   ├── artifact-gateway-control/
│   │   ├── artifact-gateway-agent-control/
│   │   ├── artifact-gateway-callback/
│   │   └── artifact-gateway-download/
│   └── migrations/
├── scripts/
│   ├── client.mjs
│   └── assemble_chunks.py
├── AGENT-BRIDGE.md
├── SECURITY.md
└── README.md
```
