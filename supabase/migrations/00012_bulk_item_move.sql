-- Move a whole container only after reviewing its complete authoritative contents.
alter table public.storage_actions drop constraint storage_actions_type_check;
alter table public.storage_actions add constraint storage_actions_type_check check (
  type in ('register_items','update_item','move_item','move_items','delete_item','create_container','update_container','delete_container','create_location','update_location','delete_location')
);

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
