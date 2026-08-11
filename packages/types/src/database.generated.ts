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
        };
        Insert: {
          id: string;
          platform_role?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform_role?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          created_at?: string;
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
        };
        Insert: {
          id?: string;
          legal_name?: string | null;
          brand_name?: string | null;
          tax_id?: string | null;
          verification_status?: string;
          account_status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          legal_name?: string | null;
          brand_name?: string | null;
          tax_id?: string | null;
          verification_status?: string;
          account_status?: string;
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
    };
  };
}
