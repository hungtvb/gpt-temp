# Connector-native artifact bridge

This path moves public artifacts into a network-restricted CAAS session without GitHub Actions, `web.run`, `container.download`, or per-job helper deployments.

```text
Authenticated Vercel connector
  -> protected Vercel agent bridge
  -> dedicated Supabase agent control
  -> Vercel fetch worker
  -> private Supabase Storage
  -> authorized byte ranges
  -> base64 text chunks
  -> local assembly + SHA-256 verification
```

## Production target

- Supabase project: `artifact-gateway`
- Project ref: `clxyqwwdqhipkiuyagsj`
- Region: Singapore (`ap-southeast-1`)
- Agent control: `https://clxyqwwdqhipkiuyagsj.supabase.co/functions/v1/artifact-gateway-agent-control`

## Why chunks are text encoded

The connector represents ordinary HTTP responses as text. Returning raw ZIP bytes can corrupt values above `0x7f`. The bridge therefore reads an authorized range, hashes it, and returns base64 split into fixed 64-character parts.

Each response contains `offset`, decoded byte `length`, `totalSize`, `chunkSha256`, `fullSha256`, and `dataBase64Parts`.

The local assembler validates every chunk, enforces contiguous offsets, checks the final size, and verifies the complete SHA-256 before writing the artifact.

## Setup

1. Apply `202608020001_add_artifact_gateway_control_plane.sql`.
2. Apply `202608020002_add_agent_bridge.sql`.
3. Apply `202608020003_index_download_token_job_id.sql`.
4. Generate a random 32-byte base64url secret.
5. Insert only `sha256(secret)` into `artifact_gateway_agent_keys`.
6. Deploy `artifact-gateway-agent-control` with custom key authentication.
7. Configure `ARTIFACT_GATEWAY_AGENT_KEY` and `ARTIFACT_GATEWAY_CONTROL_URL` as protected Vercel secrets.
8. Deploy `vercel-agent-bridge` with Deployment Protection enabled.
9. Call `?action=setup` once through the authenticated Vercel connector.

Never commit the raw agent key.

## Job sequence

Use fresh UUIDs for `requestId`.

```text
?action=create
  &requestId=<uuid>
  &sourceUrl=<encoded https URL>
  &filename=<safe name>
  &maxBytes=<limit>

?action=status&jobId=<job uuid>

?action=transfer
  &jobId=<job uuid>
  &requestId=<new uuid>

?action=chunk
  &token=<transfer token>
  &offset=<byte offset>
  &length=<at most 2097152>

?action=cleanup&jobId=<job uuid>
```

`create` and `transfer` are idempotent for their request IDs.

## Assembly

```bash
python artifact-gateway/scripts/assemble_chunks.py \
  chunk-0000.json chunk-0001.json \
  --output /mnt/data/artifact.zip
```

For a 50 MiB artifact and 2 MiB chunks, at most 25 chunk calls are needed.

## Security

- Agent keys are stored only as SHA-256 hashes in Postgres.
- The raw key belongs in a protected Vercel environment variable.
- Service-role-only tables have RLS enabled and no client grants.
- Source hosts remain allowlisted and are revalidated by the fetch worker.
- Each job is scoped to one dedicated Supabase Auth agent user.
- Transfer sessions expire after 30 minutes and have a request ceiling.
- Every chunk and the final artifact are SHA-256 verified.
- `cleanup` removes the Storage object, job, and transfer sessions by cascade.
