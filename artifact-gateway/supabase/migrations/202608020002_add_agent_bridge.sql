create table if not exists public.artifact_gateway_download_tokens (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null
    references public.artifact_gateway_jobs(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  token_hash text not null unique
    check (token_hash ~ '^[a-fA-F0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  use_count integer not null default 0
    check (use_count >= 0),
  max_uses integer not null default 2
    check (max_uses between 1 and 16)
);

create index if not exists
  artifact_gateway_download_tokens_expiry_idx
  on public.artifact_gateway_download_tokens (expires_at);

create index if not exists
  artifact_gateway_download_tokens_user_idx
  on public.artifact_gateway_download_tokens (user_id);

alter table public.artifact_gateway_download_tokens
  enable row level security;
revoke all on table public.artifact_gateway_download_tokens
  from anon, authenticated;

create table if not exists public.artifact_gateway_agent_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  key_hash text not null unique
    check (key_hash ~ '^[a-fA-F0-9]{64}$'),
  user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artifact_gateway_agent_keys_user_idx
  on public.artifact_gateway_agent_keys (user_id)
  where user_id is not null;

alter table public.artifact_gateway_agent_keys
  enable row level security;
revoke all on table public.artifact_gateway_agent_keys
  from anon, authenticated;

create table if not exists
  public.artifact_gateway_transfer_sessions (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null
      references public.artifact_gateway_jobs(id) on delete cascade,
    request_key text not null unique,
    token_hash text not null unique
      check (token_hash ~ '^[a-fA-F0-9]{64}$'),
    expires_at timestamptz not null,
    request_count integer not null default 0
      check (request_count >= 0),
    max_requests integer not null default 128
      check (max_requests between 1 and 256),
    chunk_size integer not null default 2097152
      check (chunk_size between 1 and 2097152),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

create index if not exists
  artifact_gateway_transfer_sessions_job_idx
  on public.artifact_gateway_transfer_sessions
    (job_id, created_at desc);

create index if not exists
  artifact_gateway_transfer_sessions_expiry_idx
  on public.artifact_gateway_transfer_sessions (expires_at);

alter table public.artifact_gateway_transfer_sessions
  enable row level security;
revoke all on table public.artifact_gateway_transfer_sessions
  from anon, authenticated;

create unique index if not exists
  artifact_gateway_jobs_agent_request_uidx
  on public.artifact_gateway_jobs
    (user_id, (metadata ->> 'agent_request_id'))
  where metadata ? 'agent_request_id';

drop trigger if exists
  artifact_gateway_agent_keys_touch_updated_at
  on public.artifact_gateway_agent_keys;
create trigger artifact_gateway_agent_keys_touch_updated_at
before update on public.artifact_gateway_agent_keys
for each row
execute function public.artifact_gateway_touch_updated_at();

drop trigger if exists
  artifact_gateway_transfer_sessions_touch_updated_at
  on public.artifact_gateway_transfer_sessions;
create trigger
  artifact_gateway_transfer_sessions_touch_updated_at
before update on public.artifact_gateway_transfer_sessions
for each row
execute function public.artifact_gateway_touch_updated_at();

-- Provision keys out-of-band. Store only SHA-256(key) here:
--
-- insert into public.artifact_gateway_agent_keys
--   (name, key_hash)
-- values
--   ('connector-name', '<64-hex-character-sha256>');
