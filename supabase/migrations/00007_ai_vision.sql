-- Ciphertext only; browser roles have no access, including to their own row.
create table public.user_gemini_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_key text not null check (encrypted_key like 'v1.%'),
  updated_at timestamptz not null default now()
);
alter table public.user_gemini_keys enable row level security;
revoke all on public.user_gemini_keys from anon, authenticated;
grant all on public.user_gemini_keys to service_role;

-- Shared rate limit across serverless instances; contains no images or keys.
create table public.ai_usage_limits (
  user_id uuid references auth.users(id) on delete cascade,
  scope text not null check (scope in ('analysis', 'key-write')),
  window_start timestamptz not null,
  calls integer not null,
  primary key (user_id, scope)
);
alter table public.ai_usage_limits enable row level security;
revoke all on public.ai_usage_limits from anon, authenticated;
grant all on public.ai_usage_limits to service_role;
create function public.consume_ai_quota(p_user_id uuid, p_scope text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer; bucket timestamptz := date_trunc('hour', now());
begin
  insert into public.ai_usage_limits(user_id, scope, window_start, calls)
  values(p_user_id, p_scope, bucket, 1)
  on conflict (user_id, scope) do update
    set window_start = bucket,
        calls = case when public.ai_usage_limits.window_start = bucket
          then public.ai_usage_limits.calls + 1 else 1 end
    where public.ai_usage_limits.window_start <> bucket or public.ai_usage_limits.calls < 30
  returning calls into n;
  return n is not null;
end;
$$;
revoke all on function public.consume_ai_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text) to service_role;

-- One transaction per reviewed photo/manual batch. Retries return the original result.
create table public.item_registration_requests (
  user_id uuid references auth.users(id) on delete cascade,
  request_id uuid not null,
  container_id uuid not null references public.containers(id) on delete cascade,
  payload jsonb not null,
  result jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table public.item_registration_requests enable row level security;
revoke all on public.item_registration_requests from anon, authenticated;

create function public.register_items_once(p_request_id uuid, p_container_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); prior public.item_registration_requests%rowtype;
  created jsonb; entry jsonb;
begin
  if uid is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
  perform 1 from public.containers where id = p_container_id and user_id = uid for key share;
  if not found then raise exception 'Container access denied' using errcode = '42501'; end if;
  if p_request_id is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid items' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Invalid item count' using errcode = '22023'; end if;
  for entry in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(entry->'name') is distinct from 'string'
       or length(btrim(entry->>'name')) not between 1 and 100
       or jsonb_typeof(entry->'quantity') is distinct from 'number'
       or (entry->>'quantity')::numeric not between 1 and 9999
       or (entry->>'quantity')::numeric <> trunc((entry->>'quantity')::numeric)
       or (entry ? 'description' and (jsonb_typeof(entry->'description') is distinct from 'string' or length(entry->>'description') > 1000)) then
      raise exception 'Invalid item' using errcode = '22023';
    end if;
  end loop;
  insert into public.item_registration_requests(user_id, request_id, container_id, payload)
    values(uid, p_request_id, p_container_id, p_items) on conflict do nothing;
  select * into prior from public.item_registration_requests where user_id = uid and request_id = p_request_id for update;
  if prior.container_id <> p_container_id or prior.payload <> p_items then
    raise exception 'Request already used with different items' using errcode = '23505';
  end if;
  if prior.result <> '[]'::jsonb then return prior.result; end if;
  with inserted as (
    insert into public.items(container_id, name, quantity, description)
    select p_container_id, btrim(value->>'name'), (value->>'quantity')::integer, nullif(value->>'description', '')
    from jsonb_array_elements(p_items) returning *
  ) select jsonb_agg(to_jsonb(inserted)) into created from inserted;
  update public.item_registration_requests set result = created where user_id = uid and request_id = p_request_id;
  return created;
end;
$$;
revoke all on function public.register_items_once(uuid, uuid, jsonb) from public, anon;
grant execute on function public.register_items_once(uuid, uuid, jsonb) to authenticated;
