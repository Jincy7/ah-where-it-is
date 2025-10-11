/**
 * Import verification test.
 * Ensures all exports are correctly typed and importable.
 *
 * This file is for type checking only - not meant to be run as an actual test.
 * Run `npx tsc --noEmit` to verify all imports are valid.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

// Test: Import all database operations
import {
  // Locations
  getLocations,
  getLocation,
  createLocation,
  updateLocation,
  deleteLocation,
  type Location,
  type LocationInsert,
  type LocationUpdate,

  // Containers
  getContainers,
  getContainer,
  createContainer,
  updateContainer,
  deleteContainer,
  type Container,
  type ContainerInsert,
  type ContainerUpdate,
  type ContainerWithDetails,

  // Items
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  type Item,
  type ItemInsert,
  type ItemUpdate,

  // Storage
  uploadContainerImage,
  deleteContainerImage,
  getContainerImageUrl,
  replaceContainerImage,
  type UploadImageResult,
} from '@/lib/db'

// Test: Import Supabase clients
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { updateSession } from '@/lib/supabase/middleware'

// Test: Import generated types
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/supabase'

// Type assertions to ensure everything compiles correctly
type _TestLocationFunction = (userId: string) => Promise<Location[]>
const _testGetLocations: _TestLocationFunction = getLocations

type _TestContainerFunction = (userId: string, locationId?: string) => Promise<ContainerWithDetails[]>
const _testGetContainers: _TestContainerFunction = getContainers

type _TestItemFunction = (containerId: string) => Promise<Item[]>
const _testGetItems: _TestItemFunction = getItems

type _TestUploadFunction = (file: File, userId: string, containerId: string) => Promise<UploadImageResult>
const _testUploadImage: _TestUploadFunction = uploadContainerImage

// Verify types are correctly exported
type _LocationRow = Tables<'locations'>
type _ContainerRow = Tables<'containers'>
type _ItemRow = Tables<'items'>

type _LocationInsertType = TablesInsert<'locations'>
type _ContainerInsertType = TablesInsert<'containers'>
type _ItemInsertType = TablesInsert<'items'>

type _LocationUpdateType = TablesUpdate<'locations'>
type _ContainerUpdateType = TablesUpdate<'containers'>
type _ItemUpdateType = TablesUpdate<'items'>

// Export to prevent unused variable warnings
export type {
  _TestLocationFunction,
  _TestContainerFunction,
  _TestItemFunction,
  _TestUploadFunction,
  _LocationRow,
  _ContainerRow,
  _ItemRow,
  _LocationInsertType,
  _ContainerInsertType,
  _ItemInsertType,
  _LocationUpdateType,
  _ContainerUpdateType,
  _ItemUpdateType,
}

export {
  _testGetLocations,
  _testGetContainers,
  _testGetItems,
  _testUploadImage,
}

console.log('✅ All imports verified successfully!')
