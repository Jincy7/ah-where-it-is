import { createClient } from '@/lib/supabase/server'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/supabase'

export type Location = Tables<'locations'>
export type LocationInsert = TablesInsert<'locations'>
export type LocationUpdate = TablesUpdate<'locations'>

/**
 * Get all locations for a user, ordered by name.
 *
 * @param userId - The user ID to filter locations
 * @returns Array of locations
 * @throws Error if database query fails
 *
 * @example
 * ```ts
 * const locations = await getLocations(userId)
 * ```
 */
export async function getLocations(userId: string): Promise<Location[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true })

    if (error) {
      throw new Error(`Failed to fetch locations: ${error.message}`)
    }

    return data || []
  } catch (error) {
    console.error('Error in getLocations:', error)
    throw error
  }
}

/**
 * Get a single location by ID.
 *
 * @param id - The location ID
 * @returns The location or null if not found
 * @throws Error if database query fails
 *
 * @example
 * ```ts
 * const location = await getLocation(locationId)
 * if (!location) {
 *   console.log('Location not found')
 * }
 * ```
 */
export async function getLocation(id: string): Promise<Location | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      throw new Error(`Failed to fetch location: ${error.message}`)
    }

    return data
  } catch (error) {
    console.error('Error in getLocation:', error)
    throw error
  }
}

/**
 * Create a new location.
 *
 * @param data - The location data to insert
 * @returns The created location
 * @throws Error if database insert fails
 *
 * @example
 * ```ts
 * const newLocation = await createLocation({
 *   user_id: userId,
 *   name: 'Kitchen Cabinet',
 *   description: 'Upper left cabinet'
 * })
 * ```
 */
export async function createLocation(
  data: Omit<LocationInsert, 'id' | 'created_at' | 'updated_at'>
): Promise<Location> {
  try {
    const supabase = await createClient()

    const { data: newLocation, error } = await supabase
      .from('locations')
      .insert(data)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create location: ${error.message}`)
    }

    if (!newLocation) {
      throw new Error('Failed to create location: No data returned')
    }

    return newLocation
  } catch (error) {
    console.error('Error in createLocation:', error)
    throw error
  }
}

/**
 * Update an existing location.
 *
 * @param id - The location ID to update
 * @param data - The location data to update
 * @returns The updated location
 * @throws Error if database update fails
 *
 * @example
 * ```ts
 * const updatedLocation = await updateLocation(locationId, {
 *   name: 'Living Room Cabinet',
 *   description: 'TV stand cabinet'
 * })
 * ```
 */
export async function updateLocation(
  id: string,
  data: Omit<LocationUpdate, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<Location> {
  try {
    const supabase = await createClient()

    const { data: updatedLocation, error } = await supabase
      .from('locations')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update location: ${error.message}`)
    }

    if (!updatedLocation) {
      throw new Error('Failed to update location: No data returned')
    }

    return updatedLocation
  } catch (error) {
    console.error('Error in updateLocation:', error)
    throw error
  }
}

/**
 * Delete a location by ID.
 * Note: Containers' location_id will be set to null due to ON DELETE SET NULL constraint.
 *
 * @param id - The location ID to delete
 * @throws Error if database delete fails
 *
 * @example
 * ```ts
 * await deleteLocation(locationId)
 * ```
 */
export async function deleteLocation(id: string): Promise<void> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete location: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in deleteLocation:', error)
    throw error
  }
}
