/**
 * Database operations exports.
 * Central export point for all database CRUD operations.
 */

// Locations
export {
  getLocations,
  getLocation,
  createLocation,
  updateLocation,
  deleteLocation,
  type Location,
  type LocationInsert,
  type LocationUpdate,
} from './locations'

// Containers
export {
  getContainers,
  getContainer,
  createContainer,
  updateContainer,
  deleteContainer,
  type Container,
  type ContainerInsert,
  type ContainerUpdate,
  type ContainerWithDetails,
} from './containers'

// Items
export {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  searchAllItems,
  getAllContainersForMove,
  moveItemToContainer,
  type Item,
  type ItemInsert,
  type ItemUpdate,
  type ItemFilterOptions,
  type ItemWithContainer,
  type ContainerSummary,
} from './items'

// Storage
export {
  uploadContainerImage,
  deleteContainerImage,
  getContainerImageUrl,
  replaceContainerImage,
  type UploadImageResult,
} from './storage'
