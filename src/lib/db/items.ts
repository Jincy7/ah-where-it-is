import { createClient } from '@/lib/supabase/server'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/supabase'

export type Item = Tables<'items'>
export type ItemInsert = TablesInsert<'items'>
export type ItemUpdate = TablesUpdate<'items'>

/**
 * Extended Item type that includes container information
 */
export interface ItemWithContainer extends Item {
  container_name: string
  container_id: string
}

/**
 * Filter options for querying items
 */
export interface ItemFilterOptions {
  /** Search query to match against item name and description (case-insensitive) */
  searchQuery?: string
  /** Array of container IDs to filter by (optional, overrides containerId parameter if provided) */
  containerIds?: string[]
  /** Filter items created on or after this date (ISO string) */
  dateFrom?: string
  /** Filter items created on or before this date (ISO string) */
  dateTo?: string
}

/**
 * Get all items in a container with optional search and filtering, ordered by most recently created.
 *
 * @param containerId - The container ID to filter items (can be overridden by options.containerIds)
 * @param options - Optional filter and search parameters
 * @returns Array of items matching the criteria
 * @throws Error if database query fails
 *
 * @example
 * ```ts
 * // Basic usage - get all items in a container
 * const items = await getItems(containerId)
 *
 * // Search items by name or description
 * const searchResults = await getItems(containerId, {
 *   searchQuery: 'winter jacket'
 * })
 *
 * // Filter by multiple containers
 * const multiContainerItems = await getItems('', {
 *   containerIds: [containerId1, containerId2]
 * })
 *
 * // Filter by date range
 * const recentItems = await getItems(containerId, {
 *   dateFrom: '2024-01-01',
 *   dateTo: '2024-12-31'
 * })
 *
 * // Combine multiple filters
 * const filteredItems = await getItems(containerId, {
 *   searchQuery: 'jacket',
 *   dateFrom: '2024-01-01'
 * })
 * ```
 */
export async function getItems(
  containerId: string,
  options?: ItemFilterOptions
): Promise<Item[]> {
  try {
    const supabase = await createClient()

    // Start building the query
    let query = supabase.from('items').select('*')

    // Apply container filter
    // If containerIds array is provided in options, use that; otherwise use the containerId parameter
    if (options?.containerIds && options.containerIds.length > 0) {
      query = query.in('container_id', options.containerIds)
    } else if (containerId) {
      query = query.eq('container_id', containerId)
    }

    // Apply search query to name and description using ILIKE for case-insensitive search
    if (options?.searchQuery && options.searchQuery.trim()) {
      const searchPattern = `%${options.searchQuery.trim()}%`
      query = query.or(`name.ilike.${searchPattern},description.ilike.${searchPattern}`)
    }

    // Apply date range filters
    if (options?.dateFrom) {
      query = query.gte('created_at', options.dateFrom)
    }
    if (options?.dateTo) {
      query = query.lte('created_at', options.dateTo)
    }

    // Order by most recently created
    query = query.order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to fetch items: ${error.message}`)
    }

    return data || []
  } catch (error) {
    console.error('Error in getItems:', error)
    throw error
  }
}

/**
 * Get a single item by ID.
 *
 * @param id - The item ID
 * @returns The item or null if not found
 * @throws Error if database query fails
 *
 * @example
 * ```ts
 * const item = await getItem(itemId)
 * if (!item) {
 *   console.log('Item not found')
 * }
 * ```
 */
export async function getItem(id: string): Promise<Item | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      throw new Error(`Failed to fetch item: ${error.message}`)
    }

    return data
  } catch (error) {
    console.error('Error in getItem:', error)
    throw error
  }
}

/**
 * Create a new item.
 *
 * @param data - The item data to insert
 * @returns The created item
 * @throws Error if database insert fails
 *
 * @example
 * ```ts
 * const newItem = await createItem({
 *   container_id: containerId,
 *   name: 'Winter Jacket',
 *   description: 'Black north face jacket, size M'
 * })
 * ```
 */
export async function createItem(
  data: Omit<ItemInsert, 'id' | 'created_at' | 'updated_at'>
): Promise<Item> {
  try {
    const supabase = await createClient()

    const { data: newItem, error } = await supabase
      .from('items')
      .insert(data)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create item: ${error.message}`)
    }

    if (!newItem) {
      throw new Error('Failed to create item: No data returned')
    }

    return newItem
  } catch (error) {
    console.error('Error in createItem:', error)
    throw error
  }
}

/**
 * Update an existing item.
 *
 * @param id - The item ID to update
 * @param data - The item data to update
 * @returns The updated item
 * @throws Error if database update fails
 *
 * @example
 * ```ts
 * const updatedItem = await updateItem(itemId, {
 *   name: 'Winter Coat',
 *   description: 'Black north face jacket, size L'
 * })
 * ```
 */
export async function updateItem(
  id: string,
  data: Omit<ItemUpdate, 'id' | 'container_id' | 'created_at' | 'updated_at'>
): Promise<Item> {
  try {
    const supabase = await createClient()

    const { data: updatedItem, error } = await supabase
      .from('items')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update item: ${error.message}`)
    }

    if (!updatedItem) {
      throw new Error('Failed to update item: No data returned')
    }

    return updatedItem
  } catch (error) {
    console.error('Error in updateItem:', error)
    throw error
  }
}

/**
 * Delete an item by ID.
 *
 * @param id - The item ID to delete
 * @throws Error if database delete fails
 *
 * @example
 * ```ts
 * await deleteItem(itemId)
 * ```
 */
export async function deleteItem(id: string): Promise<void> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from('items').delete().eq('id', id)

    if (error) {
      throw new Error(`Failed to delete item: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in deleteItem:', error)
    throw error
  }
}

/**
 * Search for items across all containers owned by the current user.
 * Searches in item name and description using case-insensitive matching.
 *
 * @param searchQuery - The search term to match against item name and description
 * @returns Array of items with container information, ordered by most recently created
 * @throws Error if database query fails
 *
 * @example
 * ```ts
 * // Search for items containing "winter" in name or description
 * const results = await searchAllItems('winter')
 * // Returns items with container_name included
 * ```
 */
export async function searchAllItems(
  searchQuery: string
): Promise<ItemWithContainer[]> {
  try {
    const supabase = await createClient()

    // Build query with JOIN to containers table to get container name
    const searchPattern = `%${searchQuery.trim()}%`

    const { data, error } = await supabase
      .from('items')
      .select(`
        *,
        container:containers!inner(
          id,
          name
        )
      `)
      .or(`name.ilike.${searchPattern},description.ilike.${searchPattern}`)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to search items: ${error.message}`)
    }

    // Transform the data to match ItemWithContainer interface
    const itemsWithContainer: ItemWithContainer[] = (data || []).map((item) => {
      // Extract container data and remove it from the item object
      const { container, ...itemData } = item

      return {
        ...itemData,
        container_id: container.id,
        container_name: container.name,
      } as ItemWithContainer
    })

    return itemsWithContainer
  } catch (error) {
    console.error('Error in searchAllItems:', error)
    throw error
  }
}
