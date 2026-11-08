-- Provider-bound ciphertext is readable only through authenticated server code.
-- Gemini rows remain in the existing table during the compatibility period.
create table public.user_ai_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'gemini')),
  encrypted_key text not null check (encrypted_key like 'v1.%'),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.user_ai_credentials enable row level security;
revoke all on public.user_ai_credentials from public, anon, authenticated;
grant all on public.user_ai_credentials to service_role;

-- The legacy endpoint remains writable while a trigger keeps the unified read
-- path in sync, including deletion. The AAD is unchanged so no plaintext is needed.
insert into public.user_ai_credentials(user_id, provider, encrypted_key, updated_at)
  select user_id, 'gemini', encrypted_key, updated_at from public.user_gemini_keys;
create function public.sync_legacy_gemini_credential()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.user_ai_credentials where user_id = old.user_id and provider = 'gemini';
    return old;
  end if;
  insert into public.user_ai_credentials(user_id, provider, encrypted_key, updated_at)
    values(new.user_id, 'gemini', new.encrypted_key, new.updated_at)
  on conflict (user_id, provider) do update
    set encrypted_key = excluded.encrypted_key, updated_at = excluded.updated_at;
  return new;
end;
$$;
revoke all on function public.sync_legacy_gemini_credential() from public, anon, authenticated;
create trigger sync_gemini_credential
  after insert or update or delete on public.user_gemini_keys
  for each row execute function public.sync_legacy_gemini_credential();

-- Text, voice sessions and tool calls have independent limits.
alter table public.ai_usage_limits drop constraint ai_usage_limits_scope_check;
alter table public.ai_usage_limits add constraint ai_usage_limits_scope_check
  check (scope in ('analysis', 'key-write', 'chat', 'realtime', 'tool'));
create or replace function public.consume_ai_quota(p_user_id uuid, p_scope text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer; bucket timestamptz := date_trunc('hour', now());
  call_limit integer := case when p_scope = 'tool' then 120 else 30 end;
begin
  insert into public.ai_usage_limits(user_id, scope, window_start, calls)
  values(p_user_id, p_scope, bucket, 1)
  on conflict (user_id, scope) do update
    set window_start = bucket,
        calls = case when public.ai_usage_limits.window_start = bucket
          then public.ai_usage_limits.calls + 1 else 1 end
    where public.ai_usage_limits.window_start <> bucket or public.ai_usage_limits.calls < call_limit
  returning calls into n;
  return n is not null;
end;
$$;
revoke all on function public.consume_ai_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text) to service_role;
