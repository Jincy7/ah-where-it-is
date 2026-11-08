import type { Tables } from "@/types/supabase";

export type StorageLocation = Tables<"locations"> & { version: number };
export type StorageContainer = Tables<"containers"> & {
  version: number;
  contents_version: number;
  cover_media_id: string | null;
  location_name: string | null;
  item_count: number;
  cover_url?: string | null;
};
export type StorageItem = Tables<"items"> & {
  version: number;
  container_name: string;
  location_name: string | null;
  match_reason: string;
  media: { id: string; url: string | null }[];
};
export type WorkspaceItem = StorageItem;
export type WorkspaceContainer = StorageContainer;
export type WorkspaceLocation = StorageLocation;
export type WorkspaceData = {
  containers: StorageContainer[];
  locations: StorageLocation[];
  items: StorageItem[];
  truncated: boolean;
};
export type ChangeType =
  | "register_items" | "update_item" | "move_item" | "delete_item"
  | "create_container" | "update_container" | "delete_container"
  | "create_location" | "update_location" | "delete_location";
export type ActionPayload = Record<string, unknown>;
export type ActionReceipt = {
  action_id: string;
  type: ChangeType;
  completed_at: string;
  result: unknown;
};
export type StorageAction = {
  action_id: string;
  revision: number;
  type: ChangeType;
  payload: ActionPayload;
  payload_hash: string;
  expected_versions: Record<string, number>;
  idempotency_key: string;
  status: "prepared" | "completed" | "cancelled";
  preview: {
    title: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    affected_items: { id: string; name: string; quantity: number }[];
  };
  receipt: ActionReceipt | null;
};
export type ChangeInput = {
  type: ChangeType;
  payload: ActionPayload;
  action_id?: string;
  revision?: number;
  expected_versions?: Record<string, number>;
};
