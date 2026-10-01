export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string
          created_at: string
          id: string
          match_key: string
          mobile: string
          name: string
          seller: string
          updated_at: string
        }
        Insert: {
          address?: string
          created_at?: string
          id?: string
          match_key: string
          mobile?: string
          name?: string
          seller?: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          match_key?: string
          mobile?: string
          name?: string
          seller?: string
          updated_at?: string
        }
        Relationships: []
      }
      diamond_prices: {
        Row: {
          created_at: string
          id: number
          lgd_price_ct: number
          moiss_price_ct: number
          shape: string
          size_label: string
          size_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          lgd_price_ct?: number
          moiss_price_ct?: number
          shape: string
          size_label: string
          size_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          lgd_price_ct?: number
          moiss_price_ct?: number
          shape?: string
          size_label?: string
          size_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      metal_prices: {
        Row: {
          making_charge: number
          manual: boolean
          price: number
          purity: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          making_charge?: number
          manual?: boolean
          price?: number
          purity: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          making_charge?: number
          manual?: boolean
          price?: number
          purity?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      quotations: {
        Row: {
          applied_rates: Json
          category: string
          currency: string
          customer_address: string
          customer_id: string | null
          customer_mobile: string
          customer_name: string
          id: string
          id_sku: string
          images: Json
          items: Json
          margin_pct: number
          pdf_visibility: Json
          quotation_date: string
          seller: string
          show_summary: boolean
          totals: Json
          updated_at: string
        }
        Insert: {
          applied_rates?: Json
          category?: string
          currency?: string
          customer_address?: string
          customer_id?: string | null
          customer_mobile?: string
          customer_name?: string
          id: string
          id_sku?: string
          images?: Json
          items?: Json
          margin_pct?: number
          pdf_visibility?: Json
          quotation_date?: string
          seller?: string
          show_summary?: boolean
          totals?: Json
          updated_at?: string
        }
        Update: {
          applied_rates?: Json
          category?: string
          currency?: string
          customer_address?: string
          customer_id?: string | null
          customer_mobile?: string
          customer_name?: string
          id?: string
          id_sku?: string
          images?: Json
          items?: Json
          margin_pct?: number
          pdf_visibility?: Json
          quotation_date?: string
          seller?: string
          show_summary?: boolean
          totals?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      next_quotation_id: { Args: never; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
