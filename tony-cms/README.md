# Tony CMS

Developer-first headless CMS MVP built with Next.js App Router, TypeScript and explicit domain rules.

## Included

- Responsive admin dashboard
- Content model overview
- Entry list and server-side editor
- Draft, publish and unpublish lifecycle
- Role-based permission model
- Public published-content API
- Media, API key, webhook, team, audit and settings surfaces
- Seeded demo data
- Supabase/PostgreSQL migration
- Unit tests for schema, RBAC, lifecycle and delivery filtering

## Run locally from this branch

```bash
npm install
npm run dev
```

Open `http://localhost:3000/admin`. The demo does not require environment variables. The checksummed release ZIP produced by CI includes the verified `package-lock.json` and supports `npm ci`.

## Verify

```bash
npm run verify
```

## API

```text
GET /api/health
GET /api/v1/content/articles
GET /api/v1/content/articles?locale=vi&limit=10
```

Only published content is returned.

## Production environment

The next phase replaces the demo store with Supabase/PostgreSQL and Supabase Auth. Apply `supabase/migrations/202608030001_tony_cms.sql`, then configure:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Never expose the service-role key to browser code.
