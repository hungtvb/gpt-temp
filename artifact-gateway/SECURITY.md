# Security Model

## Trust boundaries

- The Supabase control function requires a valid Supabase user JWT.
- The Vercel worker validates the JWT against the configured Supabase project before accepting a job.
- The callback endpoint is public by design, but accepts only a random 256-bit one-time callback token stored as a SHA-256 hash.
- Storage is private. Uploads use path-scoped signed upload tokens; downloads use short-lived signed URLs.

## SSRF controls

- HTTPS only.
- Exact host/suffix allowlist.
- Credentials in source URLs are rejected.
- Every redirect is revalidated.
- DNS A/AAAA results are checked and private, loopback, link-local, multicast, documentation and reserved ranges are rejected.
- Redirect count is capped.

## Resource controls

- Request body is capped at 128 KiB.
- Download size is capped at 50 MiB by both control and worker.
- Upstream `Content-Length` is checked before body consumption.
- The body is stopped when the byte cap is exceeded.
- SHA-256 can be supplied by the caller and is always calculated by the worker.
- Jobs and upload tokens expire; artifacts are stored in user/job-specific paths.

## Known v0.1 limitations

- Worker buffers the fetched artifact before signed upload; the current hard cap is intentionally 50 MiB.
- No per-user rate-limit table yet.
- No scheduled garbage collector yet; job expiration metadata exists but cleanup is manual/API-driven.
- Control plane currently resides in the existing `vote-system` Supabase project, isolated by table, bucket and function names. A dedicated infrastructure project is preferred later.
