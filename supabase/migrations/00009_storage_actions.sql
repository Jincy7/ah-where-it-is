-- One reviewed action and one transaction for direct, text and voice workflows.
alter table public.locations add column version bigint not null default 1;
alter table public.containers add column version bigint not null default 1;
alter table public.containers add column contents_version bigint not null default 1;
alter table public.items add column version bigint not null default 1;

-- Serialize writes for the same authenticated owner before row locks are taken.
-- This avoids item->container legacy trigger locks racing a container->item approval.
create function public.lock_storage_writer() returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 7913)); end if;
  return null;
end;
$$;
create trigger lock_storage_locations before insert or update or delete on public.locations for each statement execute function public.lock_storage_writer();
create trigger lock_storage_containers before insert or update or delete on public.containers for each statement execute function public.lock_storage_writer();
create trigger lock_storage_items before insert or update or delete on public.items for each statement execute function public.lock_storage_writer();

create function public.bump_storage_version() returns trigger language plpgsql set search_path = '' as $$
begin new.version := old.version + 1; return new; end;
$$;
create trigger version_locations before update on public.locations for each row execute function public.bump_storage_version();
create trigger version_containers before update on public.containers for each row execute function public.bump_storage_version();
create trigger version_items before update on public.items for each row execute function public.bump_storage_version();

-- Every writer, including old forms and direct authenticated DB writes, invalidates a contents preview.
create function public.bump_container_contents() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    update public.containers set contents_version = contents_version + 1 where id = old.container_id;
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.container_id <> old.container_id) then
    update public.containers set contents_version = contents_version + 1 where id = new.container_id;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger contents_items after insert or update or delete on public.items for each row execute function public.bump_container_contents();

-- A foreign key alone does not prove that the location belongs to the container owner.
create function public.check_container_location_owner() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.location_id is not null and not exists (select 1 from public.locations where id = new.location_id and user_id = new.user_id) then
    raise exception 'Location access denied' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger owner_container_location before insert or update of location_id, user_id on public.containers for each row execute function public.check_container_location_owner();

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null unique,
  status text not null default 'pending' check (status in ('pending','uploaded','attached')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.item_media (
  item_id uuid not null references public.items(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete restrict,
  primary key (item_id, media_id)
);
alter table public.containers add column cover_media_id uuid references public.media_assets(id) on delete restrict;
alter table public.media_assets enable row level security;
alter table public.item_media enable row level security;
revoke all on public.media_assets, public.item_media from anon, authenticated;
grant select on public.media_assets, public.item_media to authenticated;
grant all on public.media_assets, public.item_media to service_role;
create policy media_read_own on public.media_assets for select to authenticated using (user_id = auth.uid());
create policy item_media_read_own on public.item_media for select to authenticated using (exists (
  select 1 from public.items i join public.containers c on c.id = i.container_id where i.id = item_id and c.user_id = auth.uid()
));
create function public.check_container_media_owner() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.cover_media_id is not null and not exists (select 1 from public.media_assets where id = new.cover_media_id and user_id = new.user_id and status in ('uploaded','attached')) then
    raise exception 'Media access denied' using errcode = '42501';
  end if;
  if new.cover_media_id is not null then update public.media_assets set status = 'attached', updated_at = now() where id = new.cover_media_id; end if;
  return new;
end;
$$;
create trigger owner_container_media before insert or update of cover_media_id, user_id on public.containers for each row execute function public.check_container_media_owner();
create function public.touch_detached_media() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'item_media' then
    update public.media_assets set updated_at = now() where id = old.media_id;
  elsif old.cover_media_id is not null then
    update public.media_assets set updated_at = now() where id = old.cover_media_id;
  end if;
  return old;
end;
$$;
create trigger detached_item_media after delete on public.item_media for each row execute function public.touch_detached_media();
create trigger detached_container_media after delete or update of cover_media_id on public.containers for each row execute function public.touch_detached_media();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('item-images','item-images',false,5242880,array['image/jpeg']) on conflict(id) do nothing;
create policy item_images_read_own on storage.objects for select to authenticated using (
  bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text
);

create table public.storage_actions (
  action_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  type text not null check(type in ('register_items','update_item','move_item','delete_item','create_container','update_container','delete_container','create_location','update_location','delete_location')),
  payload jsonb not null,
  expected_versions jsonb not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key uuid not null,
  preview jsonb not null,
  status text not null default 'prepared' check(status in ('prepared','completed','cancelled')),
  receipt jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);
alter table public.storage_actions enable row level security;
revoke all on public.storage_actions from anon,authenticated;
grant all on public.storage_actions to service_role;
create index storage_actions_user on public.storage_actions(user_id,created_at desc);

create function public.confirm_storage_action(p_action_id uuid,p_revision integer,p_payload_hash text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); a public.storage_actions%rowtype; p jsonb; e record;
  actual bigint; entity uuid; result jsonb; row_json jsonb; entry jsonb; media uuid; new_item public.items%rowtype;
  target uuid; source uuid; owner uuid;
begin
  if uid is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 7913));
  select * into a from public.storage_actions where action_id = p_action_id and user_id = uid for update;
  if not found then raise exception 'Action not found' using errcode = 'PT404'; end if;
  if a.revision is distinct from p_revision or a.payload_hash is distinct from p_payload_hash or a.idempotency_key is distinct from p_idempotency_key then
    raise exception 'Action revision changed' using errcode = 'PT409';
  end if;
  if a.status = 'completed' then return to_jsonb(a); end if;
  if a.status <> 'prepared' then raise exception 'Action cancelled' using errcode = 'PT409'; end if;
  if a.created_at < now() - interval '24 hours' then raise exception 'Action expired' using errcode = 'PT409'; end if;
  -- Acquire all previewed row locks and compare versions in this transaction.
  for e in select key,value from jsonb_each_text(a.expected_versions) order by key loop
    entity := split_part(e.key,':',2)::uuid;
    actual := null;
    case split_part(e.key,':',1)
      when 'items' then
        select i.version into actual from public.items i join public.containers c on c.id = i.container_id where i.id = entity and c.user_id = uid for update of i;
      when 'containers' then
        select version into actual from public.containers where id = entity and user_id = uid for update;
      when 'contents' then
        select contents_version into actual from public.containers where id = entity and user_id = uid for update;
      when 'locations' then
        select version into actual from public.locations where id = entity and user_id = uid for update;
      else raise exception 'Invalid version key' using errcode = '22023';
    end case;
    if actual is null or actual <> e.value::bigint then raise exception 'Storage changed; review again' using errcode = 'PT409'; end if;
  end loop;
  p := a.payload;
  case a.type
    when 'register_items' then
      target := (p->>'container_id')::uuid;
      perform 1 from public.containers where id = target and user_id = uid for update;
      if not found then raise exception 'Container access denied' using errcode = '42501'; end if;
      if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 100 then raise exception 'Invalid items' using errcode = '22023'; end if;
      result := '[]'::jsonb;
      for entry in select value from jsonb_array_elements(p->'items') loop
        if length(btrim(entry->>'name')) not between 1 and 100 or jsonb_typeof(entry->'quantity') is distinct from 'number' or (entry->>'quantity')::numeric not between 1 and 9999 or (entry->>'quantity')::numeric <> trunc((entry->>'quantity')::numeric) then raise exception 'Invalid item' using errcode = '22023'; end if;
        insert into public.items(container_id,name,quantity,description) values(target,btrim(entry->>'name'),(entry->>'quantity')::integer,nullif(entry->>'description','')) returning * into new_item;
        for media in select value::text::uuid from jsonb_array_elements_text(coalesce(entry->'media_ids','[]'::jsonb)) loop
          perform 1 from public.media_assets where id = media and user_id = uid and status in ('uploaded','attached') for update;
          if not found then raise exception 'Media access denied' using errcode = '42501'; end if;
          insert into public.item_media(item_id,media_id) values(new_item.id,media) on conflict do nothing;
          update public.media_assets set status = 'attached',updated_at = now() where id = media;
        end loop;
        result := result || jsonb_build_array(to_jsonb(new_item));
      end loop;
    when 'update_item','move_item','delete_item' then
      entity := (p->>'item_id')::uuid;
      select i.container_id into source from public.items i join public.containers c on c.id = i.container_id where i.id = entity and c.user_id = uid for update of i;
      if not found then raise exception 'Item access denied' using errcode = '42501'; end if;
      if a.type = 'update_item' then
        update public.items set name = p->>'name',quantity = (p->>'quantity')::integer,description = nullif(p->>'description','') where id = entity returning to_jsonb(items.*) into result;
      elsif a.type = 'move_item' then
        target := (p->>'container_id')::uuid;
        perform 1 from public.containers where id = target and user_id = uid for update;
        if not found then raise exception 'Container access denied' using errcode = '42501'; end if;
        update public.items set container_id = target where id = entity returning to_jsonb(items.*) into result;
      else
        delete from public.items where id = entity returning to_jsonb(items.*) into result;
      end if;
    when 'create_container' then
      insert into public.containers(user_id,name,location_id,cover_media_id) values(uid,p->>'name',(p->>'location_id')::uuid,(p->>'cover_media_id')::uuid) returning to_jsonb(containers.*) into result;
    when 'update_container' then
      update public.containers set name = p->>'name',location_id = (p->>'location_id')::uuid,cover_media_id = case when p ? 'cover_media_id' then (p->>'cover_media_id')::uuid else cover_media_id end,internal_photo_url = case when p ? 'cover_media_id' then null else internal_photo_url end where id = (p->>'container_id')::uuid and user_id = uid returning to_jsonb(containers.*) into result;
      if not found then raise exception 'Container access denied' using errcode = '42501'; end if;
    when 'delete_container' then
      -- contents_version was locked and compared above, including legacy writers.
      if not (a.expected_versions ? ('contents:' || (p->>'container_id'))) then raise exception 'Contents preview required' using errcode = '22023'; end if;
      delete from public.containers where id = (p->>'container_id')::uuid and user_id = uid returning to_jsonb(containers.*) into result;
      if not found then raise exception 'Container access denied' using errcode = '42501'; end if;
    when 'create_location' then
      insert into public.locations(user_id,name,description) values(uid,p->>'name',nullif(p->>'description','')) returning to_jsonb(locations.*) into result;
    when 'update_location' then
      update public.locations set name = p->>'name',description = nullif(p->>'description','') where id = (p->>'location_id')::uuid and user_id = uid returning to_jsonb(locations.*) into result;
      if not found then raise exception 'Location access denied' using errcode = '42501'; end if;
    when 'delete_location' then
      select coalesce(jsonb_agg(id order by id),'[]'::jsonb) into row_json from public.containers where location_id = (p->>'location_id')::uuid and user_id = uid;
      if row_json <> coalesce(a.preview->'before'->'container_ids','[]'::jsonb) then raise exception 'Location contents changed' using errcode = 'PT409'; end if;
      delete from public.locations where id = (p->>'location_id')::uuid and user_id = uid returning to_jsonb(locations.*) into result;
      if not found then raise exception 'Location access denied' using errcode = '42501'; end if;
    else raise exception 'Invalid action' using errcode = '22023';
  end case;
  update public.storage_actions set status = 'completed',updated_at = now(),receipt = jsonb_build_object('action_id',a.action_id,'type',a.type,'completed_at',now(),'result',result)
    where action_id = a.action_id returning * into a;
  return to_jsonb(a);
end;
$$;
revoke all on function public.confirm_storage_action(uuid,integer,text,uuid) from public,anon;
grant execute on function public.confirm_storage_action(uuid,integer,text,uuid) to authenticated;

create table public.media_deletion_queue (
  path text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.media_deletion_queue enable row level security;
revoke all on public.media_deletion_queue from anon,authenticated;
grant all on public.media_deletion_queue to service_role;

-- Claim garbage atomically with reference checks; service deletes storage bytes after this RPC.
-- Assets are locked, so confirmation cannot attach a concurrently claimed orphan.
create function public.claim_orphaned_media(p_user_id uuid)
returns table(path text) language plpgsql security invoker set search_path = '' as $$
declare asset public.media_assets%rowtype;
begin
  for asset in select m.* from public.media_assets m where m.user_id = p_user_id and m.updated_at < now() - interval '24 hours' order by m.id for update skip locked loop
    if not exists(select 1 from public.item_media where media_id = asset.id) and not exists(select 1 from public.containers where cover_media_id = asset.id) then
      insert into public.media_deletion_queue(path,user_id) values(asset.path,asset.user_id) on conflict do nothing;
      delete from public.media_assets where id = asset.id;
      path := asset.path; return next;
    end if;
  end loop;
end;
$$;
revoke all on function public.claim_orphaned_media(uuid) from public,anon,authenticated;
grant execute on function public.claim_orphaned_media(uuid) to service_role;

-- Legacy bulk registration takes the same writer lock before its first parent lock.
create or replace function public.register_items_once(p_request_id uuid, p_container_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); prior public.item_registration_requests%rowtype;
  created jsonb; entry jsonb;
begin
  if uid is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 7913));
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
