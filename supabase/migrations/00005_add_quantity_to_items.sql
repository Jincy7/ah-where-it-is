-- Migration: Add quantity field to items table
-- Description: Adds a quantity column to track item counts and migrates existing data
-- Date: 2025-10-13

-- Add quantity column with default value of 1
ALTER TABLE items
ADD COLUMN quantity integer NOT NULL DEFAULT 1;

-- Add constraint to ensure quantity is positive
ALTER TABLE items
ADD CONSTRAINT quantity_positive CHECK (quantity > 0);

-- Update existing items to have quantity of 1
UPDATE items
SET quantity = 1
WHERE quantity IS NULL;

-- Add comment
COMMENT ON COLUMN items.quantity IS 'Number of this item in the container (must be positive)';
