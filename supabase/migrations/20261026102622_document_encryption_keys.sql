-- ─────────────────────────────────────────────────────────────────────────────
-- document_encryption_keys: Stores system encryption keys for applicant files
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Applicants encrypt files client-side with the RSA-OAEP public key.
-- Authorized HR staff (Super Admin, RSP, and active Interviewers) retrieve
-- the private key via get_document_decryption_key() to decrypt files in memory.
-- Unauthenticated users, PM, L&D, and general employees are denied access.

create table if not exists public.document_encryption_keys (
  id          uuid        primary key default gen_random_uuid(),
  key_name    text        not null unique,
  public_key  text        not null,
  private_key text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.document_encryption_keys enable row level security;

-- Direct table access is restricted to postgres / service_role only.
-- Authenticated users must invoke get_document_decryption_key().
revoke all on public.document_encryption_keys from anon, authenticated, public;

-- Seed default active key pair
insert into public.document_encryption_keys (key_name, public_key, private_key)
values (
  'default',
  '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'
)
on conflict (key_name) do update
set public_key = excluded.public_key,
    private_key = excluded.private_key,
    updated_at = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- get_document_decryption_key: Secure RPC to retrieve the private key
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_document_decryption_key()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid;
  caller_email text;
  caller_role text;
  has_access boolean := false;
  priv_key text;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Authentication required to access document decryption key'
      using errcode = '42501';
  end if;

  caller_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  -- 1. Check if caller has an authorized admin role (Super Admin or RSP)
  select upper(role) into caller_role
  from public.user_roles
  where user_id = caller_id
    and is_active = true
  limit 1;

  if caller_role in ('ADMIN', 'SUPERADMIN', 'SUPER-ADMIN', 'RSP') then
    has_access := true;
  end if;

  -- 2. Check if caller is an active interviewer in raters
  if not has_access and caller_email <> '' then
    if exists (
      select 1
      from public.raters
      where lower(trim(email)) = caller_email
        and is_active = true
    ) then
      has_access := true;
    end if;
  end if;

  if not has_access then
    raise exception 'Insufficient permissions to access document decryption key'
      using errcode = '42501';
  end if;

  select private_key into priv_key
  from public.document_encryption_keys
  where key_name = 'default'
  limit 1;

  return priv_key;
end;
$$;

revoke all on function public.get_document_decryption_key() from public, anon;
grant execute on function public.get_document_decryption_key() to authenticated;
