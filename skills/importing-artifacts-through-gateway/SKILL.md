---
name: importing-artifacts-through-gateway
description: Use when a sandbox, CAAS session, or coding agent cannot download a public GitHub, npm, PyPI, Maven, Gradle, or Node artifact directly, or needs a checksum-verified file placed in /mnt/data through the Tony artifact gateway.
---

# Importing Artifacts Through Gateway

## Overview

Use the protected Vercel connector bridge to move an allowlisted public artifact into `/mnt/data`. Treat completion as valid only after byte count, per-chunk hashes, full SHA-256, file integrity, and remote cleanup all pass.

## Preconditions

- Use this only for public HTTPS artifacts up to 50 MiB from an allowlisted host.
- Use the Vercel connector against `artifact-gateway-agent-bridge.vercel.app`.
- Never request, print, store, or expose `ARTIFACT_GATEWAY_AGENT_KEY`.
- Do not use this for an already-mounted conversation file; access that file directly.

## Workflow

1. Call `?action=health`, then `?action=setup`. Stop on any non-200 response.
2. Generate a fresh UUID and call `create` with encoded `sourceUrl`, safe `filename`, `maxBytes`, and optional `expectedSha256`.
3. Poll `status` until `completed` or `failed`. Do not claim success while queued or running.
4. Generate another UUID and call `transfer`.
5. Fetch every byte range with `chunk`. Use `min(chunkSize, totalSize-offset)` and save each JSON response locally.
6. Run `scripts/assemble_chunks.py ... --output /mnt/data/<filename>`.
7. Run `scripts/verify_artifact.py` with the reported SHA-256 and size. Perform format-specific integrity checks when applicable.
8. Call `cleanup` whether verification succeeds or fails after a job was created.
9. Report job ID, output path, byte size, SHA-256, integrity result, cleanup result, and any remaining limitation.

See `references/gateway-api.md` for exact actions and recovery rules.

## Failure Rules

- A failed checksum or missing byte range means discard the local output and cleanup remotely.
- Never retry `create` with a new request ID until checking the original job; create is idempotent only per request ID.
- Never reuse transfer tokens between jobs.
- Never reveal transfer tokens or signed Storage URLs in the final response.
- If the source is private, over 50 MiB, or not allowlisted, stop and explain the constraint instead of weakening security.
