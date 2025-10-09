-- Migration: Storage Bucket Configuration
-- Description: Creates storage bucket for container images with RLS policies
-- Author: Database Architect Agent
-- Date: 2025-10-09

-- ============================================================================
-- CREATE STORAGE BUCKET
-- ============================================================================

-- Create the container-images bucket for storing container internal photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'container-images',
  'container-images',
  false, -- private bucket, requires authentication
  5242880, -- 5MB max file size (5 * 1024 * 1024)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================

-- Policy: Users can upload images to their own folder
-- Path structure: container-images/{user_id}/{filename}
CREATE POLICY "storage_insert_own" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'container-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can view their own images
CREATE POLICY "storage_select_own" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'container-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can update their own images
CREATE POLICY "storage_update_own" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'container-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'container-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can delete their own images
CREATE POLICY "storage_delete_own" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'container-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- NOTES
-- ============================================================================

-- File path structure: container-images/{user_id}/{filename}
-- Example: container-images/550e8400-e29b-41d4-a716-446655440000/my-container-photo.jpg
--
-- Max file size: 5MB
-- Allowed types: JPEG, PNG, WebP
-- Access: Private (authenticated users only, own files only)
--
-- To upload from client:
-- const { data, error } = await supabase.storage
--   .from('container-images')
--   .upload(`${userId}/${fileName}`, file)
--
-- To get public URL (with auth):
-- const { data } = supabase.storage
--   .from('container-images')
--   .getPublicUrl(`${userId}/${fileName}`)
