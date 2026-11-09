export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      storage_maps: {
        Row: { id: string; user_id: string; name: string; columns: number; rows: number; revision: number; schema_version: number; updated_at: string }
        Insert: { id?: string; user_id: string; name: string; columns: number; rows: number; revision?: number; schema_version?: number; updated_at?: string }
        Update: { name?: string; columns?: number; rows?: number; revision?: number; updated_at?: string }
        Relationships: []
      }
      storage_map_regions: {
        Row: { id: string; map_id: string; location_id: string; color_key: string }
        Insert: { id: string; map_id: string; location_id: string; color_key: string }
        Update: { location_id?: string; color_key?: string }
        Relationships: []
      }
      storage_map_cells: {
        Row: { map_id: string; region_id: string; col: number; row: number }
        Insert: { map_id: string; region_id: string; col: number; row: number }
        Update: { col?: number; row?: number }
        Relationships: []
      }
      storage_map_anchors: {
        Row: { map_id: string; region_id: string; container_id: string; col: number; row: number }
        Insert: { map_id: string; region_id: string; container_id: string; col: number; row: number }
        Update: { region_id?: string; col?: number; row?: number }
        Relationships: []
      }
      user_ai_credentials: {
        Row: {
          user_id: string
          provider: "openai" | "gemini"
          encrypted_key: string
          updated_at: string
        }
        Insert: {
          user_id: string
          provider: "openai" | "gemini"
          encrypted_key: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          provider?: "openai" | "gemini"
          encrypted_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_deletion_queue: {
        Row: { path: string; user_id: string; created_at: string }
        Insert: { path: string; user_id: string; created_at?: string }
        Update: { path?: string; user_id?: string; created_at?: string }
        Relationships: []
      }
      media_assets: {
        Row: {
          id: string
          user_id: string
          path: string
          status: "pending" | "uploaded" | "attached"
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          path: string
          status?: "pending" | "uploaded" | "attached"
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          path?: string
          status?: "pending" | "uploaded" | "attached"
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      item_media: {
        Row: {
          item_id: string
          media_id: string
        }
        Insert: {
          item_id: string
          media_id: string
        }
        Update: {
          item_id?: string
          media_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_actions: {
        Row: {
          action_id: string
          user_id: string
          revision: number
          type: string
          payload: Json
          expected_versions: Json
          payload_hash: string
          idempotency_key: string
          preview: Json
          status: string
          receipt: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          action_id?: string
          user_id: string
          revision?: number
          type: string
          payload: Json
          expected_versions: Json
          payload_hash: string
          idempotency_key: string
          preview: Json
          status?: string
          receipt?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          action_id?: string
          user_id?: string
          revision?: number
          type?: string
          payload?: Json
          expected_versions?: Json
          payload_hash?: string
          idempotency_key?: string
          preview?: Json
          status?: string
          receipt?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_limits: {
        Row: {
          calls: number
          scope: string
          user_id: string
          window_start: string
        }
        Insert: {
          calls: number
          scope: string
          user_id: string
          window_start: string
        }
        Update: {
          calls?: number
          scope?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      containers: {
        Row: {
          version: number
          contents_version: number
          cover_media_id: string | null
          created_at: string
          id: string
          internal_photo_url: string | null
          location_id: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          version?: number
          contents_version?: number
          cover_media_id?: string | null
          created_at?: string
          id?: string
          internal_photo_url?: string | null
          location_id?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          version?: number
          contents_version?: number
          cover_media_id?: string | null
          created_at?: string
          id?: string
          internal_photo_url?: string | null
          location_id?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "containers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_favorites: {
        Row: {
          body_part: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body_part: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body_part?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      item_registration_requests: {
        Row: {
          container_id: string
          created_at: string
          payload: Json
          request_id: string
          result: Json
          user_id: string
        }
        Insert: {
          container_id: string
          created_at?: string
          payload: Json
          request_id: string
          result?: Json
          user_id: string
        }
        Update: {
          container_id?: string
          created_at?: string
          payload?: Json
          request_id?: string
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_registration_requests_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          version: number
          container_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          quantity: number
          updated_at: string
        }
        Insert: {
          version?: number
          container_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          version?: number
          container_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          version: number
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          version?: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          version?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_gemini_keys: {
        Row: {
          encrypted_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          encrypted_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          encrypted_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_cardio_entries: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          name: string
          session_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          id?: string
          name: string
          session_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          name?: string
          session_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_cardio_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercises: {
        Row: {
          body_part: string
          created_at: string
          exercise_favorite_id: string | null
          id: string
          name: string
          session_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          body_part: string
          created_at?: string
          exercise_favorite_id?: string | null
          id?: string
          name: string
          session_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          body_part?: string
          created_at?: string
          exercise_favorite_id?: string | null
          id?: string
          name?: string
          session_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_favorite_id_fkey"
            columns: ["exercise_favorite_id"]
            isOneToOne: false
            referencedRelation: "exercise_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          session_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          session_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          session_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_sets: {
        Row: {
          created_at: string
          id: string
          reps: number
          sort_order: number
          updated_at: string
          weight: number
          workout_exercise_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reps: number
          sort_order?: number
          updated_at?: string
          weight: number
          workout_exercise_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reps?: number
          sort_order?: number
          updated_at?: string
          weight?: number
          workout_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      read_storage_map: { Args: { p_kind?: string; p_id?: string }; Returns: Json }
      confirm_storage_action: {
        Args: { p_action_id: string; p_revision: number; p_payload_hash: string; p_idempotency_key: string }
        Returns: Json
      }
      claim_orphaned_media: {
        Args: { p_user_id: string }
        Returns: { path: string }[]
      }

      consume_ai_quota: {
        Args: { p_user_id: string; p_scope: string }
        Returns: boolean
      }
      register_items_once: {
        Args: { p_request_id: string; p_container_id: string; p_items: Json }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

