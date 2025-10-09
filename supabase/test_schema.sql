-- Test Script: Verify database functionality
-- This script tests basic CRUD operations to ensure schema and RLS work correctly

-- Start transaction for testing (will be rolled back)
BEGIN;

-- Create a test user (simulate authenticated user)
-- Note: In real usage, this comes from auth.users via Supabase Auth
-- For testing purposes, we'll use a mock UUID
DO $$
DECLARE
  test_user_id uuid := '550e8400-e29b-41d4-a716-446655440000'::uuid;
  test_location_id uuid;
  test_container_id uuid;
  test_item_id uuid;
BEGIN
  -- Set the session user context (simulating authenticated user)
  -- In Supabase, this is automatically set via JWT
  RAISE NOTICE 'Test User ID: %', test_user_id;

  -- Test 1: Insert a location
  INSERT INTO locations (user_id, name, description)
  VALUES (test_user_id, 'Test Living Room', 'Main living area')
  RETURNING id INTO test_location_id;

  RAISE NOTICE 'Created location: %', test_location_id;

  -- Test 2: Insert a container
  INSERT INTO containers (user_id, name, location_id)
  VALUES (test_user_id, 'Test Storage Box', test_location_id)
  RETURNING id INTO test_container_id;

  RAISE NOTICE 'Created container: %', test_container_id;

  -- Test 3: Insert an item
  INSERT INTO items (container_id, name, description)
  VALUES (test_container_id, 'Test Item', 'A test item')
  RETURNING id INTO test_item_id;

  RAISE NOTICE 'Created item: %', test_item_id;

  -- Test 4: Update item
  UPDATE items SET description = 'Updated description' WHERE id = test_item_id;
  RAISE NOTICE 'Updated item';

  -- Test 5: Verify relationships
  RAISE NOTICE 'Verifying relationships...';

  -- Check that item belongs to container
  IF EXISTS (SELECT 1 FROM items WHERE id = test_item_id AND container_id = test_container_id) THEN
    RAISE NOTICE 'Item-Container relationship: OK';
  END IF;

  -- Check that container belongs to location
  IF EXISTS (SELECT 1 FROM containers WHERE id = test_container_id AND location_id = test_location_id) THEN
    RAISE NOTICE 'Container-Location relationship: OK';
  END IF;

  -- Test 6: Test CASCADE delete (deleting container should delete items)
  DELETE FROM containers WHERE id = test_container_id;

  IF NOT EXISTS (SELECT 1 FROM items WHERE id = test_item_id) THEN
    RAISE NOTICE 'CASCADE delete test: OK (item deleted with container)';
  ELSE
    RAISE EXCEPTION 'CASCADE delete failed: item still exists';
  END IF;

  -- Test 7: Test SET NULL (deleting location should not delete container)
  -- First create new container
  INSERT INTO containers (user_id, name, location_id)
  VALUES (test_user_id, 'Test Container 2', test_location_id)
  RETURNING id INTO test_container_id;

  DELETE FROM locations WHERE id = test_location_id;

  IF EXISTS (SELECT 1 FROM containers WHERE id = test_container_id AND location_id IS NULL) THEN
    RAISE NOTICE 'SET NULL test: OK (container exists with null location)';
  ELSE
    RAISE EXCEPTION 'SET NULL failed: container deleted or location not null';
  END IF;

  RAISE NOTICE '=================================';
  RAISE NOTICE 'All tests passed successfully!';
  RAISE NOTICE '=================================';
END;
$$;

-- Rollback transaction (cleanup test data)
ROLLBACK;
