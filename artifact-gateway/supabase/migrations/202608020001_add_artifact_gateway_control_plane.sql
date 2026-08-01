create extension if not exists pgcrypto with schema extensions;

create table if not exists public.artifact_gateway_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_url text not null,
  source_host text not null,
  resolved_url text,
  requested_filename text not null,
  storage_bucket text not null default 'artifact-gateway',
  storage_path text not null unique,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','expired')),
  expected_sha256 text check (expected_sha256 is null or expected_sha256 ~ '^[a-fA-F0-9]{64}$'),
  actual_sha256 text check (actual_sha256 is null or actual_sha256 ~ '^[a-fA-F0-9]{64}$'),
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  max_bytes bigint not null default 52428800 check (max_bytes between 1 and 104857600),
  callback_token_hash text not null check (callback_token_hash ~ '^[a-fA-F0-9]{64}$'),
  callback_consumed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists artifact_gateway_jobs_user_created_idx
  on public.artifact_gateway_jobs (user_id, created_at desc);

create index if not exists artifact_gateway_jobs_status_expires_idx
  on public.artifact_gateway_jobs (status, expires_at);

create or replace function public.artifact_gateway_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists artifact_gateway_jobs_touch_updated_at on public.artifact_gateway_jobs;
create trigger artifact_gateway_jobs_touch_updated_at
before update on public.artifact_gateway_jobs
for each row execute function public.artifact_gateway_touch_updated_at();

alter table public.artifact_gateway_jobs enable row level security;

revoke all on table public.artifact_gateway_jobs from anon;
revoke all on table public.artifact_gateway_jobs from authenticated;
grant select, delete on table public.artifact_gateway_jobs to authenticated;

create policy artifact_gateway_jobs_select_own
on public.artifact_gateway_jobs
for select
to authenticated
using (auth.uid() = user_id);

create policy artifact_gateway_jobs_delete_own_finished
on public.artifact_gateway_jobs
for delete
to authenticated
using (auth.uid() = user_id and status in ('completed','failed','expired'));

insert into storage.buckets (id, name, public, file_size_limit)
values ('artifact-gateway', 'artifact-gateway', false, 104857600)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;
