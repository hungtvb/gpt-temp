# Tony CMS architecture

## Current MVP

The admin interface and delivery API run in one Next.js App Router application. Server Components read through a repository module, server actions handle validated mutations, and Route Handlers expose public delivery endpoints.

```text
Admin Server Components -> CMS repository -> demo in-memory store
Admin forms -> Server Actions -> validation + permission + lifecycle rules
Consumers -> /api/v1/content/:model -> published-only query
```

The demo store is intentional for the first executable slice. Domain rules do not depend on it, so persistence can be replaced by Supabase/PostgreSQL without changing pages or tests.

## Production persistence

Apply the Supabase migration, then implement a Postgres repository behind the same functions in `lib/cms/store.ts`. Authentication should use Supabase Auth. Every server mutation must resolve the actor, workspace membership and project scope before touching content.

## Security invariants

- Workspace and project IDs are mandatory tenant boundaries.
- Authorization is evaluated on the server for every mutation.
- Delivery API returns published entries only.
- API keys store a one-way hash; only the prefix is retained for display.
- Webhooks should be signed with per-endpoint secrets and delivered through an outbox worker.
- Media uploads require MIME, size and extension validation plus private storage by default.
