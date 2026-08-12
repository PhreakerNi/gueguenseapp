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
          current_location: unknown | null
          driver_id: string
          location_updated_at: string | null
          operational_state: string
        }
        Insert: {
          current_location?: unknown | null
          driver_id: string
          location_updated_at?: string | null
          operational_state?: string
        }
        Update: {
          current_location?: unknown | null
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
      handle_new_user: {
        Args: Record<PropertyKey, never>
        Returns: unknown
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
