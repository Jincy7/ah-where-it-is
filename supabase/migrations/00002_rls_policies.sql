-- Migration: Row Level Security Policies
-- Description: Implements comprehensive RLS policies for all tables
-- Author: Database Architect Agent
-- Date: 2025-10-09

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- LOCATIONS TABLE POLICIES
-- ============================================================================

-- Policy: Users can view their own locations
CREATE POLICY "locations_select_own" ON locations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert locations with their own user_id
CREATE POLICY "locations_insert_own" ON locations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own locations
CREATE POLICY "locations_update_own" ON locations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own locations
CREATE POLICY "locations_delete_own" ON locations
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- CONTAINERS TABLE POLICIES
-- ============================================================================

-- Policy: Users can view their own containers
CREATE POLICY "containers_select_own" ON containers
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert containers with their own user_id
CREATE POLICY "containers_insert_own" ON containers
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own containers
CREATE POLICY "containers_update_own" ON containers
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own containers
CREATE POLICY "containers_delete_own" ON containers
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- ITEMS TABLE POLICIES
-- ============================================================================

-- Policy: Users can view items in their own containers
-- Note: This uses a subquery to verify ownership through the containers table
CREATE POLICY "items_select_own" ON items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM containers
      WHERE containers.id = items.container_id
      AND containers.user_id = auth.uid()
    )
  );

-- Policy: Users can insert items into their own containers
CREATE POLICY "items_insert_own" ON items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM containers
      WHERE containers.id = items.container_id
      AND containers.user_id = auth.uid()
    )
  );

-- Policy: Users can update items in their own containers
CREATE POLICY "items_update_own" ON items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM containers
      WHERE containers.id = items.container_id
      AND containers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM containers
      WHERE containers.id = items.container_id
      AND containers.user_id = auth.uid()
    )
  );

-- Policy: Users can delete items in their own containers
CREATE POLICY "items_delete_own" ON items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM containers
      WHERE containers.id = items.container_id
      AND containers.user_id = auth.uid()
    )
  );
