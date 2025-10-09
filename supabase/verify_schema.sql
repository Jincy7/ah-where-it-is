-- Verification Script: Check database schema and policies

-- Check tables exist
SELECT 'Tables Check' as check_type;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('locations', 'containers', 'items');

-- Check columns for locations
SELECT 'Locations Columns' as check_type;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'locations'
ORDER BY ordinal_position;

-- Check columns for containers
SELECT 'Containers Columns' as check_type;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'containers'
ORDER BY ordinal_position;

-- Check columns for items
SELECT 'Items Columns' as check_type;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'items'
ORDER BY ordinal_position;

-- Check RLS is enabled
SELECT 'RLS Status' as check_type;
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('locations', 'containers', 'items');

-- Check policies exist
SELECT 'RLS Policies' as check_type;
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('locations', 'containers', 'items')
ORDER BY tablename, policyname;

-- Check indexes
SELECT 'Indexes' as check_type;
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('locations', 'containers', 'items')
ORDER BY tablename, indexname;

-- Check storage bucket
SELECT 'Storage Bucket' as check_type;
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'container-images';

-- Check storage policies
SELECT 'Storage Policies' as check_type;
SELECT policyname
FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects'
AND policyname LIKE 'storage_%_own'
ORDER BY policyname;
