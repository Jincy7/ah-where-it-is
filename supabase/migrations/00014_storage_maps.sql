-- One user-owned grid. Only the confirmed action can write geometry.
create table public.storage_maps (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 100), columns integer not null check(columns between 1 and 64), rows integer not null check(rows between 1 and 64),
  revision bigint not null default 1 check(revision > 0), schema_version integer not null default 1 check(schema_version = 1), updated_at timestamptz not null default now()
);
create table public.storage_map_regions (
  id uuid primary key, map_id uuid not null references public.storage_maps(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  color_key text not null check(color_key in ('green','yellow','blue','purple','pink','neutral')),
  unique(map_id,location_id), unique(map_id,id)
);
create table public.storage_map_cells (
  map_id uuid not null, region_id uuid not null, col integer not null check(col between 0 and 63), row integer not null check(row between 0 and 63),
  primary key(map_id,col,row), unique(map_id,region_id,col,row),
  foreign key(map_id,region_id) references public.storage_map_regions(map_id,id) on delete cascade
);
create table public.storage_map_anchors (
  map_id uuid not null, region_id uuid not null, container_id uuid not null references public.containers(id) on delete cascade,
  col integer not null, row integer not null, primary key(map_id,container_id),
  foreign key(map_id,region_id,col,row) references public.storage_map_cells(map_id,region_id,col,row) on delete cascade
);
create index storage_map_regions_location on public.storage_map_regions(location_id);
create index storage_map_anchors_container on public.storage_map_anchors(container_id);
alter table public.storage_maps enable row level security;
alter table public.storage_map_regions enable row level security;
alter table public.storage_map_cells enable row level security;
alter table public.storage_map_anchors enable row level security;
revoke all on public.storage_maps,public.storage_map_regions,public.storage_map_cells,public.storage_map_anchors from anon,authenticated;
grant select on public.storage_maps,public.storage_map_regions,public.storage_map_cells,public.storage_map_anchors to authenticated;
grant all on public.storage_maps,public.storage_map_regions,public.storage_map_cells,public.storage_map_anchors to service_role;
create policy storage_map_read on public.storage_maps for select to authenticated using(user_id=auth.uid());
create policy storage_map_regions_read on public.storage_map_regions for select to authenticated using(exists(select 1 from public.storage_maps m where m.id=map_id and m.user_id=auth.uid()));
create policy storage_map_cells_read on public.storage_map_cells for select to authenticated using(exists(select 1 from public.storage_maps m where m.id=map_id and m.user_id=auth.uid()));
create policy storage_map_anchors_read on public.storage_map_anchors for select to authenticated using(exists(select 1 from public.storage_maps m where m.id=map_id and m.user_id=auth.uid()));

-- Dirty maps are queued once per transaction. The queue has no client privileges;
-- unlike a session setting, callers cannot forge a "validated" flag.
create table public.storage_map_validation_queue (map_id uuid primary key);
alter table public.storage_map_validation_queue enable row level security;
revoke all on public.storage_map_validation_queue from public,anon,authenticated,service_role;
create function public.queue_storage_map_validation() returns trigger language plpgsql security definer set search_path='' as $$
declare old_id uuid; new_id uuid; mid uuid;
begin
  if tg_table_name='storage_maps' then
    old_id:=old.id; new_id:=new.id;
  else
    old_id:=old.map_id; new_id:=new.map_id;
  end if;
  for mid in select distinct id from unnest(array[old_id,new_id]) t(id) where id is not null order by id loop
    insert into public.storage_map_validation_queue(map_id) values(mid) on conflict do nothing;
  end loop;
  return null;
end;
$$;
-- Deferred final-state integrity also protects service-role writes.
create function public.validate_storage_map() returns trigger language plpgsql security definer set search_path='' as $$
declare mid uuid; m public.storage_maps%rowtype;
begin
  mid:=new.map_id;
  select * into m from public.storage_maps where id=mid;
  if not found then delete from public.storage_map_validation_queue where map_id=mid; return null; end if;
  if (select count(*) from public.storage_map_regions where map_id=mid)>64 then raise exception 'Too many regions' using errcode='22023'; end if;
  if exists(select 1 from public.storage_map_regions r join public.locations l on l.id=r.location_id where r.map_id=mid and l.user_id<>m.user_id) then raise exception 'Location owner mismatch' using errcode='42501'; end if;
  if exists(select 1 from public.storage_map_cells where map_id=mid and (col>=m.columns or row>=m.rows)) then raise exception 'Cell outside grid' using errcode='22023'; end if;
  if exists(select 1 from public.storage_map_regions r left join public.storage_map_cells c on c.map_id=r.map_id and c.region_id=r.id where r.map_id=mid group by r.id having count(c.col)=0 or count(c.col)<>(max(c.col)-min(c.col)+1)*(max(c.row)-min(c.row)+1)) then raise exception 'Regions must be filled rectangles' using errcode='22023'; end if;
  if exists(select 1 from public.storage_map_anchors a join public.storage_map_regions r on r.id=a.region_id join public.containers c on c.id=a.container_id where a.map_id=mid and (c.user_id<>m.user_id or c.location_id is distinct from r.location_id)) then raise exception 'Anchor location mismatch' using errcode='42501'; end if;
  delete from public.storage_map_validation_queue where map_id=mid;
  return null;
end;
$$;
create constraint trigger validate_map_once after insert on public.storage_map_validation_queue deferrable initially deferred for each row execute function public.validate_storage_map();
create trigger queue_map_validation after insert or update or delete on public.storage_maps for each row execute function public.queue_storage_map_validation();
create trigger queue_region_validation after insert or update or delete on public.storage_map_regions for each row execute function public.queue_storage_map_validation();
create trigger queue_cell_validation after insert or update or delete on public.storage_map_cells for each row execute function public.queue_storage_map_validation();
create trigger queue_anchor_validation after insert or update or delete on public.storage_map_anchors for each row execute function public.queue_storage_map_validation();

-- Every existing write path (legacy forms included) removes invalid map references.
create function public.clean_storage_map_references() returns trigger language plpgsql security definer set search_path='' as $$
declare mid uuid;
begin
  if tg_table_name='locations' then
    for mid in select map_id from public.storage_map_regions where location_id=old.id loop
      delete from public.storage_map_regions where map_id=mid and location_id=old.id;
      update public.storage_maps set revision=revision+1,updated_at=now() where id=mid;
    end loop;
  elsif tg_op='DELETE' or new.location_id is distinct from old.location_id or new.user_id is distinct from old.user_id then
    for mid in select map_id from public.storage_map_anchors where container_id=old.id loop
      delete from public.storage_map_anchors where map_id=mid and container_id=old.id;
      update public.storage_maps set revision=revision+1,updated_at=now() where id=mid;
    end loop;
  end if;
  return coalesce(new,old);
end;
$$;
create trigger clean_map_location before delete on public.locations for each row execute function public.clean_storage_map_references();
create trigger clean_map_container before delete or update of location_id,user_id on public.containers for each row execute function public.clean_storage_map_references();

-- A STABLE function uses one query snapshot for geometry, names, counts and target versions.
create function public.read_storage_map(p_kind text default null,p_id uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare scene jsonb; resolution jsonb:=null; target_item jsonb; target_container jsonb; target_location jsonb; target_region uuid; target_anchor jsonb; versions jsonb:='{}'; found_target boolean:=false;
begin
  if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  if (p_kind is null) <> (p_id is null) or (p_kind is not null and p_kind not in ('item','container','location')) then raise exception 'Invalid target' using errcode='22023'; end if;
  with m as (select * from public.storage_maps where user_id=auth.uid()),
  cs as (select c.id,c.name,c.location_id,c.version,(select count(*) from public.items i where i.container_id=c.id) item_count from public.containers c where c.user_id=auth.uid()),
  ls as (select l.id,l.name,l.version,(select count(*) from cs where location_id=l.id) container_count,(select coalesce(sum(item_count),0) from cs where location_id=l.id) item_count from public.locations l where l.user_id=auth.uid())
  select jsonb_build_object(
    'map',(select to_jsonb(m)-'user_id' from m),
    'regions',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'location_id',r.location_id,'client_location_key',null,'location_name',l.name,'color_key',r.color_key,'cells',(select jsonb_agg(jsonb_build_object('col',c.col,'row',c.row) order by c.row,c.col) from public.storage_map_cells c where c.map_id=r.map_id and c.region_id=r.id)) order by r.id) from public.storage_map_regions r join m on m.id=r.map_id join ls l on l.id=r.location_id),'[]'::jsonb),
    'anchors',coalesce((select jsonb_agg(to_jsonb(a)-'map_id' order by a.container_id) from public.storage_map_anchors a join m on m.id=a.map_id),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(to_jsonb(ls) order by name,id) from ls),'[]'::jsonb),
    'containers',coalesce((select jsonb_agg(to_jsonb(cs) order by name,id) from cs),'[]'::jsonb),
    'evidence_at',statement_timestamp(),'truncated',false,'resolution',null) into scene;
  if p_kind is not null then
    if p_kind='item' then
      select jsonb_build_object('id',i.id,'name',i.name,'quantity',i.quantity,'version',i.version,'container_id',i.container_id) into target_item from public.items i join public.containers c on c.id=i.container_id where i.id=p_id and c.user_id=auth.uid();
      found_target:=target_item is not null;
      select value into target_container from jsonb_array_elements(scene->'containers') where value->>'id'=target_item->>'container_id';
    elsif p_kind='container' then
      select value into target_container from jsonb_array_elements(scene->'containers') where value->>'id'=p_id::text;
      found_target:=target_container is not null;
    else
      select value into target_location from jsonb_array_elements(scene->'locations') where value->>'id'=p_id::text;
      found_target:=target_location is not null;
    end if;
    if target_container is not null then select value into target_location from jsonb_array_elements(scene->'locations') where value->>'id'=target_container->>'location_id'; end if;
    select (value->>'id')::uuid into target_region from jsonb_array_elements(scene->'regions') where value->>'location_id'=target_location->>'id';
    select value into target_anchor from jsonb_array_elements(scene->'anchors') where value->>'container_id'=target_container->>'id';
    if target_item is not null then versions:=versions||jsonb_build_object('items:'||(target_item->>'id'),(target_item->>'version')::bigint); end if;
    if target_container is not null then versions:=versions||jsonb_build_object('containers:'||(target_container->>'id'),(target_container->>'version')::bigint); end if;
    if target_location is not null then versions:=versions||jsonb_build_object('locations:'||(target_location->>'id'),(target_location->>'version')::bigint); end if;
    resolution:=jsonb_build_object('target',jsonb_build_object('kind',p_kind,'id',p_id),'status',case when found_target then 'found' else 'deleted' end,'region_id',target_region,'anchor',target_anchor,'versions',versions,'placement',case when not found_target then 'deleted' when target_location is null then 'no_location' when target_region is null then 'unmapped_location' when target_anchor is null then 'unplaced' else 'placed' end)
      ||case when target_item is null then '{}'::jsonb else jsonb_build_object('item',target_item) end
      ||case when target_container is null then '{}'::jsonb else jsonb_build_object('container',target_container) end
      ||case when target_location is null then '{}'::jsonb else jsonb_build_object('location',target_location) end;
  end if;
  return scene||jsonb_build_object('resolution',resolution);
end;
$$;
revoke all on function public.read_storage_map(text,uuid) from public,anon;
grant execute on function public.read_storage_map(text,uuid) to authenticated;

-- Internal mutation helper; caller has locked the action and owner writer lock.
create function public.apply_storage_map(p_uid uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.storage_maps%rowtype; entry jsonb; r jsonb; c jsonb; new_id uuid; lid uuid; keys jsonb:='{}'; mid uuid; cols integer; rs integer; base bigint;
begin
  cols:=(p->>'columns')::integer; rs:=(p->>'rows')::integer; base:=(p->>'base_map_revision')::bigint;
  if cols not between 1 and 64 or rs not between 1 and 64 or length(btrim(p->>'name')) not between 1 and 100 or jsonb_array_length(p->'regions')>64 or jsonb_array_length(p->'anchors')>1000 then raise exception 'Invalid map' using errcode='22023'; end if;
  select * into m from public.storage_maps where user_id=p_uid for update;
  if (m.id is null and base is not null) or (m.id is not null and m.revision is distinct from base) then raise exception 'Map changed; review again' using errcode='PT409'; end if;
  -- Reject unlinked or repeated pending locations before any writes.
  for entry in select value from jsonb_array_elements(p->'new_locations') loop
    if keys ? (entry->>'client_location_key') or length(btrim(entry->>'name')) not between 1 and 100 or not exists(select 1 from jsonb_array_elements(p->'regions') region where region->>'client_location_key'=entry->>'client_location_key') then raise exception 'Invalid pending location' using errcode='22023'; end if;
    if exists(select 1 from public.locations where user_id=p_uid and lower(btrim(name))=lower(btrim(entry->>'name'))) then raise exception 'Location name now exists; select the existing location' using errcode='PT409'; end if;
    if exists(select 1 from jsonb_array_elements(p->'new_locations') n where n->>'client_location_key'<>entry->>'client_location_key' and lower(btrim(n->>'name'))=lower(btrim(entry->>'name'))) then raise exception 'Duplicate pending location name' using errcode='22023'; end if;
    insert into public.locations(user_id,name,description) values(p_uid,btrim(entry->>'name'),nullif(entry->>'description','')) returning id into new_id;
    keys:=keys||jsonb_build_object(entry->>'client_location_key',new_id);
  end loop;
  if m.id is null then
    insert into public.storage_maps(user_id,name,columns,rows) values(p_uid,p->>'name',cols,rs) returning * into m;
  else
    update public.storage_maps set name=p->>'name',columns=cols,rows=rs,revision=revision+1,updated_at=now() where id=m.id returning * into m;
  end if;
  mid:=m.id;
  delete from public.storage_map_regions where map_id=mid;
  for r in select value from jsonb_array_elements(p->'regions') loop
    if ((r->>'location_id') is null)=((r->>'client_location_key') is null) then raise exception 'Exactly one location required' using errcode='22023'; end if;
    lid:=coalesce((r->>'location_id')::uuid,(keys->>(r->>'client_location_key'))::uuid);
    if not exists(select 1 from public.locations where id=lid and user_id=p_uid) then raise exception 'Location access denied' using errcode='42501'; end if;
    insert into public.storage_map_regions(id,map_id,location_id,color_key) values((r->>'id')::uuid,mid,lid,r->>'color_key');
    for c in select value from jsonb_array_elements(r->'cells') loop
      if (c->>'col')::numeric<>trunc((c->>'col')::numeric) or (c->>'row')::numeric<>trunc((c->>'row')::numeric) then raise exception 'Cell coordinates must be integers' using errcode='22023'; end if;
      insert into public.storage_map_cells(map_id,region_id,col,row) values(mid,(r->>'id')::uuid,(c->>'col')::integer,(c->>'row')::integer);
    end loop;
  end loop;
  for entry in select value from jsonb_array_elements(p->'anchors') loop
    if (entry->>'col')::numeric<>trunc((entry->>'col')::numeric) or (entry->>'row')::numeric<>trunc((entry->>'row')::numeric) then raise exception 'Anchor coordinates must be integers' using errcode='22023'; end if;
    insert into public.storage_map_anchors(map_id,region_id,container_id,col,row) values(mid,(entry->>'region_id')::uuid,(entry->>'container_id')::uuid,(entry->>'col')::integer,(entry->>'row')::integer);
  end loop;
  return jsonb_build_object('map_id',mid,'revision',m.revision,'map_draft_id',p->>'map_draft_id','draft_revision',(p->>'draft_revision')::integer,'created_locations',keys);
end;
$$;
revoke all on function public.apply_storage_map(uuid,jsonb) from public,anon,authenticated;
alter table public.storage_actions drop constraint storage_actions_type_check;
alter table public.storage_actions add constraint storage_actions_type_check check(type in ('register_items','update_item','move_item','move_items','delete_item','create_container','update_container','delete_container','create_location','update_location','delete_location','save_storage_map'));

-- Omitted optional update fields retain their current values, including in already prepared actions.
-- Explicit null locations and empty descriptions still clear the corresponding field.
create or replace function public.confirm_storage_action(p_action_id uuid,p_revision integer,p_payload_hash text,p_idempotency_key uuid)
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
      when 'storage_maps' then
        select revision into actual from public.storage_maps where id = entity and user_id = uid for update;
      when 'locations' then
        select version into actual from public.locations where id = entity and user_id = uid for update;
      else raise exception 'Invalid version key' using errcode = '22023';
    end case;
    if actual is null or actual <> e.value::bigint then raise exception 'Storage changed; review again' using errcode = 'PT409'; end if;
  end loop;
  p := a.payload;
  case a.type
    when 'save_storage_map' then
      result := public.apply_storage_map(uid,p);
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
    when 'move_items' then
      source := (p->>'source_container_id')::uuid;
      target := (p->>'container_id')::uuid;
      if source is null or target is null or source = target then raise exception 'Different source and destination required' using errcode = '22023'; end if;
      perform 1 from public.containers where id = source and user_id = uid for update;
      if not found then raise exception 'Source access denied' using errcode = '42501'; end if;
      perform 1 from public.containers where id = target and user_id = uid for update;
      if not found then raise exception 'Destination access denied' using errcode = '42501'; end if;
      if not (a.expected_versions ? ('contents:' || source::text))
         or not (a.expected_versions ? ('containers:' || source::text))
         or not (a.expected_versions ? ('containers:' || target::text)) then
        raise exception 'Complete container preview required' using errcode = '22023';
      end if;
      -- The source must contain exactly the reviewed IDs, not merely a matching count.
      select coalesce(jsonb_agg(i.id order by i.id),'[]'::jsonb) into row_json from public.items i where i.container_id = source;
      select coalesce(jsonb_agg((value->>'id')::uuid order by (value->>'id')::uuid),'[]'::jsonb) into result
        from jsonb_array_elements(a.preview->'affected_items');
      if jsonb_array_length(result) not between 1 and 10000 or row_json is distinct from result then
        raise exception 'Source contents changed; review again' using errcode = 'PT409';
      end if;
      if exists(select 1 from public.items i where i.container_id = source and not (a.expected_versions ? ('items:' || i.id::text))) then
        raise exception 'Complete item versions required' using errcode = '22023';
      end if;
      -- Single statement, same transaction as the version checks and saved receipt.
      -- IDs, quantities and media links remain unchanged.
      with moved as (
        update public.items set container_id = target where container_id = source returning *
      ) select jsonb_agg(to_jsonb(moved) order by moved.id) into result from moved;
    when 'update_item','move_item','delete_item' then
      entity := (p->>'item_id')::uuid;
      select i.container_id into source from public.items i join public.containers c on c.id = i.container_id where i.id = entity and c.user_id = uid for update of i;
      if not found then raise exception 'Item access denied' using errcode = '42501'; end if;
      if a.type = 'update_item' then
        update public.items set name = p->>'name',quantity = (p->>'quantity')::integer,description = case when p ? 'description' then nullif(p->>'description','') else description end where id = entity returning to_jsonb(items.*) into result;
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
      update public.containers set name = p->>'name',location_id = case when p ? 'location_id' then (p->>'location_id')::uuid else location_id end,cover_media_id = case when p ? 'cover_media_id' then (p->>'cover_media_id')::uuid else cover_media_id end,internal_photo_url = case when p ? 'cover_media_id' then null else internal_photo_url end where id = (p->>'container_id')::uuid and user_id = uid returning to_jsonb(containers.*) into result;
      if not found then raise exception 'Container access denied' using errcode = '42501'; end if;
    when 'delete_container' then
      -- contents_version was locked and compared above, including legacy writers.
      if not (a.expected_versions ? ('contents:' || (p->>'container_id'))) then raise exception 'Contents preview required' using errcode = '22023'; end if;
      delete from public.containers where id = (p->>'container_id')::uuid and user_id = uid returning to_jsonb(containers.*) into result;
      if not found then raise exception 'Container access denied' using errcode = '42501'; end if;
    when 'create_location' then
      insert into public.locations(user_id,name,description) values(uid,p->>'name',nullif(p->>'description','')) returning to_jsonb(locations.*) into result;
    when 'update_location' then
      update public.locations set name = p->>'name',description = case when p ? 'description' then nullif(p->>'description','') else description end where id = (p->>'location_id')::uuid and user_id = uid returning to_jsonb(locations.*) into result;
      if not found then raise exception 'Location access denied' using errcode = '42501'; end if;
    when 'delete_location' then
      select coalesce(jsonb_agg(r.id order by r.id),'[]'::jsonb) into row_json from public.storage_map_regions r join public.storage_maps m on m.id=r.map_id where r.location_id=(p->>'location_id')::uuid and m.user_id=uid;
      if row_json is distinct from coalesce(a.preview->'before'->'map_region_ids','[]'::jsonb) then raise exception 'Location map impact changed' using errcode='PT409'; end if;
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
