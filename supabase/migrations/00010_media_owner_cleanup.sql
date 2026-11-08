-- An account deletion cascades through media_assets and containers/items in
-- separate FK branches. RESTRICT checks the first branch immediately, before
-- the other branch has removed its references, so deleting an owner can fail.
-- Check live references at transaction commit instead. Standalone removal of
-- a still-referenced asset continues to fail with a foreign-key violation.
alter table public.item_media
  drop constraint item_media_media_id_fkey,
  add constraint item_media_media_id_fkey
    foreign key (media_id) references public.media_assets(id)
    on delete no action deferrable initially deferred;

alter table public.containers
  drop constraint containers_cover_media_id_fkey,
  add constraint containers_cover_media_id_fkey
    foreign key (cover_media_id) references public.media_assets(id)
    on delete no action deferrable initially deferred;

-- This migration fixes database ownership cascades only. Administrative
-- account deletion must remove the owner's private storage objects before
-- deleting auth.users; SQL foreign keys do not delete Storage object bytes.
