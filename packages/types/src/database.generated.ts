export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: number
          ip_address: string | null
          reason: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: never
          ip_address?: string | null
          reason: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: never
          ip_address?: string | null
          reason?: string
        }
        Relationships: []
      }
      business_locations: {
        Row: {
          address_text: string
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          location: unknown
          name: string
          pickup_instructions: string | null
        }
        Insert: {
          address_text: string
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          location: unknown
          name: string
          pickup_instructions?: string | null
        }
        Update: {
          address_text?: string
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location?: unknown
          name?: string
          pickup_instructions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_member_locations: {
        Row: {
          business_location_id: string
          business_member_id: string
          created_at: string
          id: string
        }
        Insert: {
          business_location_id: string
          business_member_id: string
          created_at?: string
          id?: string
        }
        Update: {
          business_location_id?: string
          business_member_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_member_locations_business_location_id_fkey"
            columns: ["business_location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_member_locations_business_member_id_fkey"
            columns: ["business_member_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          account_status: string
          brand_name: string | null
          created_at: string
          id: string
          legal_name: string | null
          tax_id: string | null
          updated_at: string
          verification_status: string
        }
        Insert: {
          account_status?: string
          brand_name?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          tax_id?: string | null
          updated_at?: string
          verification_status?: string
        }
        Update: {
          account_status?: string
          brand_name?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          tax_id?: string | null
          updated_at?: string
          verification_status?: string
        }
        Relationships: []
      }
      driver_documents: {
        Row: {
          created_at: string
          document_type: string
          driver_id: string
          id: string
          rejection_reason: string | null
          storage_path: string
          verification_status: string
        }
        Insert: {
          created_at?: string
          document_type: string
          driver_id: string
          id?: string
          rejection_reason?: string | null
          storage_path: string
          verification_status?: string
        }
        Update: {
          created_at?: string
          document_type?: string
          driver_id?: string
          id?: string
          rejection_reason?: string | null
          storage_path?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_documents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_presence: {
        Row: {
          current_location: unknown
          driver_id: string
          location_updated_at: string | null
          operational_state: string
        }
        Insert: {
          current_location?: unknown
          driver_id: string
          location_updated_at?: string | null
          operational_state?: string
        }
        Update: {
          current_location?: unknown
          driver_id?: string
          location_updated_at?: string | null
          operational_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_presence_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          account_status: string
          created_at: string
          id: string
          license_number: string | null
          national_id_number: string | null
          rating_avg: number
          total_deliveries: number
          verification_status: string
        }
        Insert: {
          account_status?: string
          created_at?: string
          id: string
          license_number?: string | null
          national_id_number?: string | null
          rating_avg?: number
          total_deliveries?: number
          verification_status?: string
        }
        Update: {
          account_status?: string
          created_at?: string
          id?: string
          license_number?: string | null
          national_id_number?: string | null
          rating_avg?: number
          total_deliveries?: number
          verification_status?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          created_at: string
          expires_at: string
          external_actor_key: string | null
          id: string
          key: string
          request_fingerprint: string
          response_body_ref: string | null
          response_status: number
          scope: string
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          expires_at: string
          external_actor_key?: string | null
          id?: string
          key: string
          request_fingerprint: string
          response_body_ref?: string | null
          response_status: number
          scope: string
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          expires_at?: string
          external_actor_key?: string | null
          id?: string
          key?: string
          request_fingerprint?: string
          response_body_ref?: string | null
          response_status?: number
          scope?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          base_fee: number
          created_at: string
          id: string
          min_fare: number
          per_km_rate: number
          per_minute_rate: number
          pricing_version_id: string
        }
        Insert: {
          base_fee: number
          created_at?: string
          id?: string
          min_fare: number
          per_km_rate: number
          per_minute_rate: number
          pricing_version_id: string
        }
        Update: {
          base_fee?: number
          created_at?: string
          id?: string
          min_fare?: number
          per_km_rate?: number
          per_minute_rate?: number
          pricing_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_pricing_version_id_fkey"
            columns: ["pricing_version_id"]
            isOneToOne: true
            referencedRelation: "pricing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_versions: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          name: string
          quote_ttl_seconds: number
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name: string
          quote_ttl_seconds?: number
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name?: string
          quote_ttl_seconds?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          platform_role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          platform_role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          platform_role?: string
          updated_at?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          color: string
          created_at: string
          driver_id: string
          id: string
          license_plate: string
          make: string
          model: string
          year: number
        }
        Insert: {
          color: string
          created_at?: string
          driver_id: string
          id?: string
          license_plate: string
          make: string
          model: string
          year: number
        }
        Update: {
          color?: string
          created_at?: string
          driver_id?: string
          id?: string
          license_plate?: string
          make?: string
          model?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_business_member: {
        Args: {
          p_actor_id: string
          p_business_id: string
          p_location_ids?: string[]
          p_role: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_verify_driver: {
        Args: {
          p_actor_aal?: string
          p_actor_id: string
          p_decision: string
          p_driver_id: string
          p_rejection_reason?: string
        }
        Returns: Json
      }
      authorize_driver_document_upload: {
        Args: {
          p_actor_id: string
          p_document_type: string
          p_file_size: number
          p_mime_type: string
        }
        Returns: Json
      }
      cancel_delivery_quote: {
        Args: {
          p_actor_id: string
          p_quote_id: string
        }
        Returns: Json
      }
      commit_driver_document: {
        Args: {
          p_actor_id: string
          p_document_type: string
          p_file_size?: number
          p_mime_type?: string
          p_upload_id: string
        }
        Returns: Json
      }
      create_business: {
        Args: {
          p_actor_id: string
          p_brand_name?: string
          p_legal_name: string
          p_tax_id?: string
        }
        Returns: Json
      }
      create_business_location: {
        Args: {
          p_actor_id: string
          p_address_text: string
          p_business_id: string
          p_latitude: number
          p_location_name: string
          p_longitude: number
          p_pickup_instructions?: string
        }
        Returns: Json
      }
      create_delivery_quote: {
        Args: {
          p_actor_id: string
          p_cash_to_collect?: number
          p_distance_meters: number
          p_dropoff_address_text: string
          p_dropoff_lat: number
          p_dropoff_lng: number
          p_duration_seconds: number
          p_location_id: string
          p_package_type: string
          p_recipient_name: string
          p_recipient_phone: string
          p_route_calculated_at?: string
        }
        Returns: Json
      }
      create_delivery_requote: {
        Args: {
          p_actor_id: string
          p_distance_meters: number
          p_duration_seconds: number
          p_quote_id: string
          p_route_calculated_at?: string
        }
        Returns: Json
      }
      execute_idempotent_operation: {
        Args: {
          p_actor_user_id: string
          p_key: string
          p_operation_fn: string
          p_operation_params: Json
          p_request_fingerprint: string
          p_scope: string
        }
        Returns: Json
      }
      get_admin_driver_verification_detail: {
        Args: { p_driver_id: string }
        Returns: Json
      }
      get_admin_driver_verification_queue: { Args: never; Returns: Json }
      get_driver_document_storage_path: {
        Args: { p_document_id: string }
        Returns: Json
      }
      get_quote_for_actor: {
        Args: {
          p_actor_id: string
          p_quote_id: string
        }
        Returns: Json
      }
      get_user_platform_role: { Args: { p_user_id: string }; Returns: string }
      register_driver: {
        Args: {
          p_actor_id: string
          p_license_number: string
          p_national_id_number: string
        }
        Returns: Json
      }
      register_vehicle: {
        Args: {
          p_actor_id: string
          p_color: string
          p_license_plate: string
          p_make: string
          p_model: string
          p_year: number
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
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

