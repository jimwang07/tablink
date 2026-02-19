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
    PostgrestVersion: "13.0.5"
  }
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
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
      item_claims: {
        Row: {
          amount_cents: number
          confirmation_method: string | null
          created_at: string
          id: string
          item_id: string
          note: string | null
          paid_at: string | null
          participant_id: string
          portion: number
          requested_at: string | null
          status: Database["public"]["Enums"]["claim_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          confirmation_method?: string | null
          created_at?: string
          id?: string
          item_id: string
          note?: string | null
          paid_at?: string | null
          participant_id: string
          portion?: number
          requested_at?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          confirmation_method?: string | null
          created_at?: string
          id?: string
          item_id?: string
          note?: string | null
          paid_at?: string | null
          participant_id?: string
          portion?: number
          requested_at?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_claims_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "receipt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "receipt_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_settlements: {
        Row: {
          amount_due_cents: number
          amount_paid_cents: number
          created_at: string
          id: string
          last_reminded_at: string | null
          note: string | null
          participant_id: string
          receipt_id: string
          reminder_count: number
          status: Database["public"]["Enums"]["settlement_status"]
          updated_at: string
        }
        Insert: {
          amount_due_cents?: number
          amount_paid_cents?: number
          created_at?: string
          id?: string
          last_reminded_at?: string | null
          note?: string | null
          participant_id: string
          receipt_id: string
          reminder_count?: number
          status?: Database["public"]["Enums"]["settlement_status"]
          updated_at?: string
        }
        Update: {
          amount_due_cents?: number
          amount_paid_cents?: number
          created_at?: string
          id?: string
          last_reminded_at?: string | null
          note?: string | null
          participant_id?: string
          receipt_id?: string
          reminder_count?: number
          status?: Database["public"]["Enums"]["settlement_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_settlements_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "receipt_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_settlements_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_events: {
        Row: {
          actor_participant_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["receipt_event_type"]
          id: string
          payload: Json | null
          receipt_id: string
        }
        Insert: {
          actor_participant_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["receipt_event_type"]
          id?: string
          payload?: Json | null
          receipt_id: string
        }
        Update: {
          actor_participant_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["receipt_event_type"]
          id?: string
          payload?: Json | null
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_events_actor_participant_id_fkey"
            columns: ["actor_participant_id"]
            isOneToOne: false
            referencedRelation: "receipt_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_events_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_items: {
        Row: {
          created_at: string
          id: string
          label: string
          notes: string | null
          position: number | null
          price_cents: number
          quantity: number
          receipt_id: string
          source_tag: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          notes?: string | null
          position?: number | null
          price_cents: number
          quantity?: number
          receipt_id: string
          source_tag?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          notes?: string | null
          position?: number | null
          price_cents?: number
          quantity?: number
          receipt_id?: string
          source_tag?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_links: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_accessed_at: string | null
          receipt_id: string
          revoked_at: string | null
          secret_hash: string | null
          short_code: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          receipt_id: string
          revoked_at?: string | null
          secret_hash?: string | null
          short_code: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          receipt_id?: string
          revoked_at?: string | null
          secret_hash?: string | null
          short_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_links_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_participants: {
        Row: {
          cashapp_handle: string | null
          color_token: string | null
          created_at: string
          display_name: string
          email: string | null
          emoji: string | null
          id: string
          paid_at: string | null
          payment_amount_cents: number | null
          payment_method: string | null
          payment_status: string
          phone: string | null
          profile_id: string | null
          receipt_id: string
          role: Database["public"]["Enums"]["participant_role"]
          updated_at: string
          venmo_handle: string | null
          zelle_identifier: string | null
        }
        Insert: {
          cashapp_handle?: string | null
          color_token?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          emoji?: string | null
          id?: string
          paid_at?: string | null
          payment_amount_cents?: number | null
          payment_method?: string | null
          payment_status?: string
          phone?: string | null
          profile_id?: string | null
          receipt_id: string
          role?: Database["public"]["Enums"]["participant_role"]
          updated_at?: string
          venmo_handle?: string | null
          zelle_identifier?: string | null
        }
        Update: {
          cashapp_handle?: string | null
          color_token?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          emoji?: string | null
          id?: string
          paid_at?: string | null
          payment_amount_cents?: number | null
          payment_method?: string | null
          payment_status?: string
          phone?: string | null
          profile_id?: string | null
          receipt_id?: string
          role?: Database["public"]["Enums"]["participant_role"]
          updated_at?: string
          venmo_handle?: string | null
          zelle_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "receipt_participants_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          merchant_name: string | null
          ocr_version: string | null
          owner_id: string
          parse_confidence: number | null
          raw_payload: Json | null
          receipt_date: string | null
          status: Database["public"]["Enums"]["receipt_status"]
          subtotal_cents: number
          tax_cents: number
          thumb_path: string | null
          tip_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          merchant_name?: string | null
          ocr_version?: string | null
          owner_id: string
          parse_confidence?: number | null
          raw_payload?: Json | null
          receipt_date?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          subtotal_cents?: number
          tax_cents?: number
          thumb_path?: string | null
          tip_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          merchant_name?: string | null
          ocr_version?: string | null
          owner_id?: string
          parse_confidence?: number | null
          raw_payload?: Json | null
          receipt_date?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          subtotal_cents?: number
          tax_cents?: number
          thumb_path?: string | null
          tip_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          cashapp_handle: string | null
          created_at: string
          display_name: string | null
          onboarding_completed_at: string | null
          paypal_handle: string | null
          updated_at: string
          user_id: string
          venmo_handle: string | null
          zelle_identifier: string | null
        }
        Insert: {
          avatar_url?: string | null
          cashapp_handle?: string | null
          created_at?: string
          display_name?: string | null
          onboarding_completed_at?: string | null
          paypal_handle?: string | null
          updated_at?: string
          user_id: string
          venmo_handle?: string | null
          zelle_identifier?: string | null
        }
        Update: {
          avatar_url?: string | null
          cashapp_handle?: string | null
          created_at?: string
          display_name?: string | null
          onboarding_completed_at?: string | null
          paypal_handle?: string | null
          updated_at?: string
          user_id?: string
          venmo_handle?: string | null
          zelle_identifier?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_receipt: {
        Args: {
          p_image_path?: string
          p_merchant_name?: string
          p_owner_id: string
          p_raw_payload?: Json
          p_receipt_date?: string
          p_status?: Database["public"]["Enums"]["receipt_status"]
          p_subtotal_cents?: number
          p_tax_cents?: number
          p_tip_cents?: number
          p_total_cents?: number
        }
        Returns: string
      }
      get_my_uid: { Args: never; Returns: string }
      is_receipt_participant: {
        Args: { p_receipt_id: string }
        Returns: boolean
      }
      owns_receipt: { Args: { p_receipt_id: string }; Returns: boolean }
    }
    Enums: {
      claim_status: "unrequested" | "requested" | "paid"
      item_state: "unclaimed" | "claimed" | "settled"
      participant_role: "owner" | "guest"
      receipt_event_type:
        | "item_claimed"
        | "item_unclaimed"
        | "item_settled"
        | "receipt_status_changed"
        | "participant_added"
        | "participant_removed"
        | "payment_requested"
        | "payment_marked_paid"
      receipt_status:
        | "draft"
        | "ready"
        | "shared"
        | "partially_claimed"
        | "fully_claimed"
        | "settled"
      settlement_status: "open" | "requested" | "paid"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      claim_status: ["unrequested", "requested", "paid"],
      item_state: ["unclaimed", "claimed", "settled"],
      participant_role: ["owner", "guest"],
      receipt_event_type: [
        "item_claimed",
        "item_unclaimed",
        "item_settled",
        "receipt_status_changed",
        "participant_added",
        "participant_removed",
        "payment_requested",
        "payment_marked_paid",
      ],
      receipt_status: [
        "draft",
        "ready",
        "shared",
        "partially_claimed",
        "fully_claimed",
        "settled",
      ],
      settlement_status: ["open", "requested", "paid"],
    },
  },
} as const
