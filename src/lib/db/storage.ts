import { createClient } from '@/lib/supabase/server'

/**
 * Result of a successful image upload.
 */
export interface UploadImageResult {
  path: string
  publicUrl: string
}

/**
 * Allowed image file types for upload.
 */
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]

/**
 * Maximum file size in bytes (10MB).
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/**
 * Storage bucket name for container images.
 */
const BUCKET_NAME = 'container-images'

/**
 * Validate an image file before upload.
 *
 * @param file - The file to validate
 * @throws Error if file is invalid
 */
function validateImageFile(file: File): void {
  // Check file type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      `Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`
    )
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`
    )
  }

  // Check if file is empty
  if (file.size === 0) {
    throw new Error('File is empty')
  }
}

/**
 * Generate a unique file name for storage.
 *
 * @param userId - The user ID
 * @param containerId - The container ID
 * @param originalFileName - The original file name
 * @returns A unique file path
 *
 * @example
 * ```ts
 * const path = generateFilePath('user123', 'container456', 'photo.jpg')
 * // Returns: 'user123/container456-1704067200000.jpg'
 * ```
 */
function generateFilePath(
  userId: string,
  containerId: string,
  originalFileName: string
): string {
  const timestamp = Date.now()
  const extension = originalFileName.split('.').pop() || 'jpg'
  return `${userId}/${containerId}-${timestamp}.${extension}`
}

/**
 * Upload an image to the container-images storage bucket.
 *
 * @param file - The file to upload
 * @param userId - The user ID
 * @param containerId - The container ID
 * @returns The storage path and public URL
 * @throws Error if upload fails or file is invalid
 *
 * @example
 * ```ts
 * const file = await fetch('/path/to/image.jpg').then(r => r.blob())
 * const result = await uploadContainerImage(file, userId, containerId)
 * console.log('Uploaded to:', result.publicUrl)
 * ```
 */
export async function uploadContainerImage(
  file: File,
  userId: string,
  containerId: string
): Promise<UploadImageResult> {
  try {
    // Validate file
    validateImageFile(file)

    const supabase = await createClient()

    // Generate unique file path
    const filePath = generateFilePath(userId, containerId, file.name)

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer()

    // Upload to storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false, // Don't overwrite existing files
      })

    if (error) {
      throw new Error(`Failed to upload image: ${error.message}`)
    }

    if (!data) {
      throw new Error('Failed to upload image: No data returned')
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(data.path)

    return {
      path: data.path,
      publicUrl,
    }
  } catch (error) {
    console.error('Error in uploadContainerImage:', error)
    throw error
  }
}

/**
 * Delete an image from the container-images storage bucket.
 *
 * @param path - The storage path of the image to delete
 * @throws Error if deletion fails
 *
 * @example
 * ```ts
 * await deleteContainerImage('user123/container456-1704067200000.jpg')
 * ```
 */
export async function deleteContainerImage(path: string): Promise<void> {
  try {
    if (!path) {
      throw new Error('Image path is required')
    }

    const supabase = await createClient()

    const { error } = await supabase.storage.from(BUCKET_NAME).remove([path])

    if (error) {
      throw new Error(`Failed to delete image: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in deleteContainerImage:', error)
    throw error
  }
}

/**
 * Get the public URL for an image in the storage bucket.
 *
 * @param path - The storage path of the image
 * @returns The public URL
 * @throws Error if path is invalid
 *
 * @example
 * ```ts
 * const url = await getContainerImageUrl('user123/container456-1704067200000.jpg')
 * ```
 */
export async function getContainerImageUrl(path: string): Promise<string> {
  try {
    if (!path) {
      throw new Error('Image path is required')
    }

    const supabase = await createClient()

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path)

    return publicUrl
  } catch (error) {
    console.error('Error in getContainerImageUrl:', error)
    throw error
  }
}

/**
 * Replace an existing container image with a new one.
 * Deletes the old image and uploads the new one.
 *
 * @param file - The new file to upload
 * @param userId - The user ID
 * @param containerId - The container ID
 * @param oldPath - The old image path to delete (optional)
 * @returns The storage path and public URL of the new image
 * @throws Error if upload fails
 *
 * @example
 * ```ts
 * const result = await replaceContainerImage(
 *   newFile,
 *   userId,
 *   containerId,
 *   'user123/container456-1704067200000.jpg'
 * )
 * ```
 */
export async function replaceContainerImage(
  file: File,
  userId: string,
  containerId: string,
  oldPath?: string | null
): Promise<UploadImageResult> {
  try {
    // Upload new image first
    const result = await uploadContainerImage(file, userId, containerId)

    // Delete old image if it exists
    if (oldPath) {
      try {
        await deleteContainerImage(oldPath)
      } catch (error) {
        // Log error but don't fail the operation
        console.error('Failed to delete old image:', error)
      }
    }

    return result
  } catch (error) {
    console.error('Error in replaceContainerImage:', error)
    throw error
  }
}
