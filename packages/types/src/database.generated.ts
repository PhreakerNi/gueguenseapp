/* GENERATED FILE — DO NOT EDIT */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          platform_role: string;
          full_name: string | null;
          avatar_url: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          platform_role?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          platform_role?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      businesses: {
        Row: {
          id: string;
          legal_name: string | null;
          brand_name: string | null;
          tax_id: string | null;
          verification_status: string;
          account_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          legal_name?: string | null;
          brand_name?: string | null;
          tax_id?: string | null;
          verification_status?: string;
          account_status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          legal_name?: string | null;
          brand_name?: string | null;
          tax_id?: string | null;
          verification_status?: string;
          account_status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      business_members: {
        Row: {
          id: string;
          business_id: string;
          user_id: string;
          role: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_id: string;
          role?: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          user_id?: string;
          role?: string;
          status?: string;
          created_at?: string;
        };
      };
      business_locations: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          address_text: string;
          location: unknown;
          pickup_instructions: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          address_text: string;
          location: unknown;
          pickup_instructions?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          address_text?: string;
          location?: unknown;
          pickup_instructions?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
      };
      business_member_locations: {
        Row: {
          id: string;
          business_member_id: string;
          business_location_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_member_id: string;
          business_location_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_member_id?: string;
          business_location_id?: string;
          created_at?: string;
        };
      };
      drivers: {
        Row: {
          id: string;
          verification_status: string;
          account_status: string;
          national_id_number: string | null;
          license_number: string | null;
          rating_avg: number;
          total_deliveries: number;
          created_at: string;
        };
        Insert: {
          id: string;
          verification_status?: string;
          account_status?: string;
          national_id_number?: string | null;
          license_number?: string | null;
          rating_avg?: number;
          total_deliveries?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          verification_status?: string;
          account_status?: string;
          national_id_number?: string | null;
          license_number?: string | null;
          rating_avg?: number;
          total_deliveries?: number;
          created_at?: string;
        };
      };
      driver_documents: {
        Row: {
          id: string;
          driver_id: string;
          document_type: string;
          storage_path: string;
          verification_status: string;
          rejection_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          driver_id: string;
          document_type: string;
          storage_path: string;
          verification_status?: string;
          rejection_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          driver_id?: string;
          document_type?: string;
          storage_path?: string;
          verification_status?: string;
          rejection_reason?: string | null;
          created_at?: string;
        };
      };
      vehicles: {
        Row: {
          id: string;
          driver_id: string;
          make: string;
          model: string;
          year: number;
          color: string;
          license_plate: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          driver_id: string;
          make: string;
          model: string;
          year: number;
          color: string;
          license_plate: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          driver_id?: string;
          make?: string;
          model?: string;
          year?: number;
          color?: string;
          license_plate?: string;
          created_at?: string;
        };
      };
      driver_presence: {
        Row: {
          driver_id: string;
          operational_state: string;
          current_location: unknown | null;
          location_updated_at: string | null;
        };
        Insert: {
          driver_id: string;
          operational_state?: string;
          current_location?: unknown | null;
          location_updated_at?: string | null;
        };
        Update: {
          driver_id?: string;
          operational_state?: string;
          current_location?: unknown | null;
          location_updated_at?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
