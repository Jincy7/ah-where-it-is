import { createClient } from '@/lib/supabase/server'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/supabase'

export type Container = Tables<'containers'>
export type ContainerInsert = TablesInsert<'containers'>
export type ContainerUpdate = TablesUpdate<'containers'>

/**
 * Extended container type with location details and items count.
 */
export type ContainerWithDetails = Container & {
  location: {
    id: string
    name: string
  } | null
  items_count: number
}

/**
 * Get all containers for a user, optionally filtered by location.
 * Includes location name and items count.
 *
 * @param userId - The user ID to filter containers
 * @param locationId - Optional location ID to filter containers
 * @returns Array of containers with details
 * @throws Error if database query fails
 *
 * @example
 * ```ts
 * // Get all containers for a user
 * const containers = await getContainers(userId)
 *
 * // Get containers in a specific location
 * const containers = await getContainers(userId, locationId)
 * ```
 */
export async function getContainers(
  userId: string,
  locationId?: string
): Promise<ContainerWithDetails[]> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('containers')
      .select(
        `
        *,
        location:locations(id, name)
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (locationId) {
      query = query.eq('location_id', locationId)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to fetch containers: ${error.message}`)
    }

    // Fetch items count for each container
    const containersWithCount: ContainerWithDetails[] = await Promise.all(
      (data || []).map(async (container) => {
        const { count } = await supabase
          .from('items')
          .select('*', { count: 'exact', head: true })
          .eq('container_id', container.id)

        return {
          ...container,
          items_count: count || 0,
        }
      })
    )

    return containersWithCount
  } catch (error) {
    console.error('Error in getContainers:', error)
    throw error
  }
}

/**
 * Get a single container by ID with location and items count.
 *
 * @param id - The container ID
 * @returns The container with details or null if not found
 * @throws Error if database query fails
 *
 * @example
 * ```ts
 * const container = await getContainer(containerId)
 * if (!container) {
 *   console.log('Container not found')
 * }
 * ```
 */
export async function getContainer(
  id: string
): Promise<ContainerWithDetails | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('containers')
      .select(
        `
        *,
        location:locations(id, name)
      `
      )
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      throw new Error(`Failed to fetch container: ${error.message}`)
    }

    // Fetch items count
    const { count } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('container_id', id)

    return {
      ...data,
      items_count: count || 0,
    }
  } catch (error) {
    console.error('Error in getContainer:', error)
    throw error
  }
}

/**
 * Create a new container.
 *
 * @param data - The container data to insert
 * @returns The created container
 * @throws Error if database insert fails
 *
 * @example
 * ```ts
 * const newContainer = await createContainer({
 *   user_id: userId,
 *   name: 'Storage Box A',
 *   location_id: locationId,
 *   internal_photo_url: 'path/to/photo.jpg'
 * })
 * ```
 */
export async function createContainer(
  data: Omit<ContainerInsert, 'id' | 'created_at' | 'updated_at'>
): Promise<Container> {
  try {
    const supabase = await createClient()

    const { data: newContainer, error } = await supabase
      .from('containers')
      .insert(data)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create container: ${error.message}`)
    }

    if (!newContainer) {
      throw new Error('Failed to create container: No data returned')
    }

    return newContainer
  } catch (error) {
    console.error('Error in createContainer:', error)
    throw error
  }
}

/**
 * Update an existing container.
 *
 * @param id - The container ID to update
 * @param data - The container data to update
 * @returns The updated container
 * @throws Error if database update fails
 *
 * @example
 * ```ts
 * const updatedContainer = await updateContainer(containerId, {
 *   name: 'Storage Box B',
 *   location_id: newLocationId
 * })
 * ```
 */
export async function updateContainer(
  id: string,
  data: Omit<ContainerUpdate, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<Container> {
  try {
    const supabase = await createClient()

    const { data: updatedContainer, error } = await supabase
      .from('containers')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update container: ${error.message}`)
    }

    if (!updatedContainer) {
      throw new Error('Failed to update container: No data returned')
    }

    return updatedContainer
  } catch (error) {
    console.error('Error in updateContainer:', error)
    throw error
  }
}

/**
 * Delete a container by ID.
 * Note: All items in this container will be deleted due to CASCADE constraint.
 *
 * @param id - The container ID to delete
 * @throws Error if database delete fails
 *
 * @example
 * ```ts
 * await deleteContainer(containerId)
 * ```
 */
export async function deleteContainer(id: string): Promise<void> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('containers')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete container: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in deleteContainer:', error)
    throw error
  }
}
