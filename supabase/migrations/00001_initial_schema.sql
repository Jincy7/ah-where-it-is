-- Migration: Initial Schema for Storage Management System
-- Description: Creates locations, containers, and items tables with proper relationships and indexes
-- Author: Database Architect Agent
-- Date: 2025-10-09

-- ============================================================================
-- TABLES
-- ============================================================================

-- Locations table: Stores physical locations where containers can be placed
CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT name_not_empty CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE locations IS 'Physical locations where storage containers can be placed';
COMMENT ON COLUMN locations.user_id IS 'Owner of this location';
COMMENT ON COLUMN locations.name IS 'Display name for the location (e.g., "Living Room", "Garage")';

-- Containers table: Storage boxes/containers that hold items
CREATE TABLE containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  internal_photo_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT name_not_empty CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE containers IS 'Storage containers that hold items';
COMMENT ON COLUMN containers.user_id IS 'Owner of this container';
COMMENT ON COLUMN containers.location_id IS 'Current location of container (nullable, SET NULL on location delete)';
COMMENT ON COLUMN containers.internal_photo_url IS 'Photo of container contents for quick visual reference';

-- Items table: Individual items stored within containers
CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id uuid REFERENCES containers(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT name_not_empty CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE items IS 'Individual items stored within containers';
COMMENT ON COLUMN items.container_id IS 'Container holding this item (CASCADE delete when container deleted)';
COMMENT ON COLUMN items.name IS 'Display name of the item';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Locations indexes
CREATE INDEX idx_locations_user_id ON locations(user_id);
CREATE INDEX idx_locations_created_at ON locations(created_at DESC);

-- Containers indexes
CREATE INDEX idx_containers_user_id ON containers(user_id);
CREATE INDEX idx_containers_location_id ON containers(location_id);
CREATE INDEX idx_containers_created_at ON containers(created_at DESC);

-- Items indexes
CREATE INDEX idx_items_container_id ON items(container_id);
CREATE INDEX idx_items_created_at ON items(created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS 'Automatically updates updated_at timestamp on row modification';

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_containers_updated_at
  BEFORE UPDATE ON containers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
