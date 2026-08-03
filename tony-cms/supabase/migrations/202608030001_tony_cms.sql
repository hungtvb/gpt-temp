create extension if not exists pgcrypto;

create table if not exists public.cms_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.cms_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.cms_workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  default_locale text not null default 'en',
  created_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists public.cms_models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cms_projects(id) on delete cascade,
  name text not null,
  slug text not null,
  schema jsonb not null default '{"fields":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

create table if not exists public.cms_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cms_projects(id) on delete cascade,
  model_id uuid not null references public.cms_models(id) on delete cascade,
  locale text not null,
  status text not null check (status in ('draft', 'published', 'archived')) default 'draft',
  version integer not null default 1,
  data jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cms_entries_delivery_idx on public.cms_entries(project_id, model_id, status, locale, published_at desc);

create table if not exists public.cms_memberships (
  workspace_id uuid not null references public.cms_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'author', 'viewer')),
  primary key (workspace_id, user_id)
);

create table if not exists public.cms_api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cms_projects(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['content:read'],
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.cms_audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.cms_workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.cms_workspaces enable row level security;
alter table public.cms_projects enable row level security;
alter table public.cms_models enable row level security;
alter table public.cms_entries enable row level security;
alter table public.cms_memberships enable row level security;
alter table public.cms_api_keys enable row level security;
alter table public.cms_audit_events enable row level security;
