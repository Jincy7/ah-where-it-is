-- Migration: Make container-images bucket public
-- Description: Updates container-images bucket to be publicly accessible
-- This fixes 404 bucket not found errors when accessing images via public URLs

UPDATE storage.buckets
SET public = true
WHERE id = 'container-images';
