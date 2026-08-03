# Tony Artifact Gateway API Reference

## Production

- Bridge: `https://artifact-gateway-agent-bridge.vercel.app`
- Supabase project: `clxyqwwdqhipkiuyagsj`
- Storage bucket: `artifact-gateway` (private)
- Maximum artifact size: 50 MiB
- Maximum chunk size: 2 MiB
- Transfer-session TTL: 30 minutes

Access the bridge through the authenticated Vercel connector. Do not use a generic unauthenticated web client for protected deployments.

## Actions

### Health

```text
?action=health
```

Expected fields: `service`, `status`, `version`, `project`.

### Setup

```text
?action=setup
```

Expected fields: `ok`, `agent`, `userId`.

### Create

```text
?action=create
  &requestId=<uuid>
  &sourceUrl=<url-encoded-https-url>
  &filename=<safe-name>
  &maxBytes=<positive-integer-at-most-52428800>
  [&expectedSha256=<64-lowercase-hex>]
```

Keep the returned `job.id`. Reusing the same `requestId` returns the same logical job.

### Status

```text
?action=status&jobId=<job-uuid>
```

Terminal states are `completed` and `failed`. A completed job must include `actual_sha256` and `size_bytes`.

### Transfer

```text
?action=transfer&jobId=<job-uuid>&requestId=<new-uuid>
```

Returns `token`, `chunkSize`, `sizeBytes`, `sha256`, and `totalChunks`.

### Chunk

```text
?action=chunk&token=<transfer-token>&offset=<integer>&length=<1..2097152>
```

The response contains:

- `offset`
- decoded `length`
- `totalSize`
- `chunkSha256`
- `fullSha256`
- `dataBase64Parts`

Offsets must be contiguous from zero. The final request length is the remaining byte count, not always the full chunk size.

### Cleanup

```text
?action=cleanup&jobId=<job-uuid>
```

Cleanup is successful when `ok=true`; `removed=false` is acceptable for an already-cleaned job.

## Recovery Matrix

| Failure | Action |
|---|---|
| Bridge health/setup fails | Stop; inspect Vercel deployment and runtime errors |
| Create response lost | Retry with the same create request ID |
| Job remains queued/running | Continue status polling; do not create a duplicate |
| Job failed | Record `error_message`, cleanup, stop |
| Transfer expired | Request a new transfer with a fresh transfer request ID |
| Chunk hash mismatch | Discard all local chunks, cleanup, stop |
| Missing or overlapping offsets | Do not assemble; refetch the exact missing range if the session remains valid |
| Full hash mismatch | Delete assembled file, cleanup, stop |
| Cleanup fails | Report it explicitly and preserve the job ID for manual cleanup |

## Allowlisted Source Families

The deployed worker supports public artifacts from GitHub archive/raw/release hosts, npm registry, PyPI files, Maven Central, Gradle distributions, and Node.js downloads. HTTPS, redirects, DNS results, byte limits, and checksums are revalidated by the worker.
