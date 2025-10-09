import { createClient } from '@/lib/supabase/server'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/supabase'

export type Item = Tables<'items'>
export type ItemInsert = TablesInsert<'items'>
export type ItemUpdate = TablesUpdate<'items'>

/**
 * Get all items in a container, ordered by most recently created.
 *
 * @param containerId - The container ID to filter items
 * @returns Array of items
 * @throws Error if database query fails
 *
 * @example
 * ```ts
 * const items = await getItems(containerId)
 * ```
 */
export async function getItems(containerId: string): Promise<Item[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('container_id', containerId)
      .order('created_at', { ascending: false })

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
