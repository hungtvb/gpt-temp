# Security Model

## Trust boundaries

- The user control function requires a valid Supabase user JWT.
- The fetch worker validates that JWT and authorizes every job against the callback function before touching the Internet.
- The connector-native control function uses a high-entropy agent key. Postgres stores only its SHA-256 hash.
- The raw agent key belongs in a protected Vercel environment variable and must never be committed.
- The callback endpoint is public by design, but accepts only a random 256-bit one-time token stored as a SHA-256 hash.
- Storage is private. Uploads use path-scoped signed upload tokens and chunk reads use short-lived signed Storage URLs.

## Connector transfer controls

- The Vercel agent bridge remains behind Deployment Protection.
- Every agent has a dedicated Supabase Auth user and user-scoped job paths.
- Create and transfer operations are idempotent by UUID request IDs.
- Transfer tokens are deterministic HMAC values bound to the agent key, job and request ID.
- Transfer sessions expire after 30 minutes.
- Chunks are limited to 2 MiB and each session has a request ceiling.
- Chunk ranges are validated against the canonical job size before a signed URL is issued.
- The bridge hashes every returned chunk.
- The local assembler verifies chunk hashes, contiguous offsets, total size and the complete artifact hash before writing output.

## SSRF controls

- HTTPS only.
- Exact host and suffix allowlist.
- Credentials in source URLs are rejected.
- Every redirect is revalidated.
- DNS A and AAAA results are checked; private, loopback, link-local, multicast, documentation and reserved ranges are rejected.
- Redirect count is capped.

## Resource controls

- Worker request bodies are capped at 128 KiB.
- Artifact size is capped at 50 MiB by both control and worker.
- Upstream `Content-Length` is checked before body consumption.
- Streaming consumption stops when the byte cap is exceeded.
- SHA-256 can be supplied by the caller and is always calculated by the worker.
- Jobs, callback tokens, binary tokens and transfer sessions expire.
- Cleanup removes the Storage object and job; dependent transfer rows are deleted by cascade.

## Credential rotation

1. Generate a new random 32-byte base64url key.
2. Insert a new active key row containing only `sha256(key)`.
3. Update the protected Vercel secret and deploy.
4. Confirm `?action=setup` succeeds.
5. Disable the old key row and delete or ban its old agent user.

The control function reads the existing agent user's actual email during setup, so rotating a key does not depend on an email derived from the current key-row ID.

## Current limitations

- The worker buffers each fetched artifact before signed upload; the hard cap remains 50 MiB.
- No per-agent rate-limit table yet beyond transfer request ceilings.
- No scheduled garbage collector yet; successful callers should invoke `cleanup`.
- The control plane currently resides in the existing `vote-system` Supabase project. A dedicated infrastructure project is preferred later.
