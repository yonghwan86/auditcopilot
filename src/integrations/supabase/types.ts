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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_findings: {
        Row: {
          created_at: string
          excerpt: string
          excerpt_position: number
          finding_type: string
          id: string
          improvement: string | null
          is_false_positive: boolean
          matched_clause_id: string | null
          matched_rule_id: string | null
          reason: string | null
          reviewed: boolean
          session_id: string
          severity: string
        }
        Insert: {
          created_at?: string
          excerpt: string
          excerpt_position?: number
          finding_type: string
          id?: string
          improvement?: string | null
          is_false_positive?: boolean
          matched_clause_id?: string | null
          matched_rule_id?: string | null
          reason?: string | null
          reviewed?: boolean
          session_id: string
          severity: string
        }
        Update: {
          created_at?: string
          excerpt?: string
          excerpt_position?: number
          finding_type?: string
          id?: string
          improvement?: string | null
          is_false_positive?: boolean
          matched_clause_id?: string | null
          matched_rule_id?: string | null
          reason?: string | null
          reviewed?: boolean
          session_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_findings_matched_clause_id_fkey"
            columns: ["matched_clause_id"]
            isOneToOne: false
            referencedRelation: "regulation_clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_findings_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "audit_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_findings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "audit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_rules: {
        Row: {
          condition_desc: string | null
          created_at: string
          false_positive_count: number
          id: string
          improvement_template: string | null
          is_active: boolean
          related_clause_ref: string | null
          rule_name: string
          severity: string
          trigger_type: string
          trigger_value: string
        }
        Insert: {
          condition_desc?: string | null
          created_at?: string
          false_positive_count?: number
          id?: string
          improvement_template?: string | null
          is_active?: boolean
          related_clause_ref?: string | null
          rule_name: string
          severity: string
          trigger_type: string
          trigger_value: string
        }
        Update: {
          condition_desc?: string | null
          created_at?: string
          false_positive_count?: number
          id?: string
          improvement_template?: string | null
          is_active?: boolean
          related_clause_ref?: string | null
          rule_name?: string
          severity?: string
          trigger_type?: string
          trigger_value?: string
        }
        Relationships: []
      }
      audit_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          progress_percent: number
          report_json: Json | null
          status: string
          status_message: string | null
          target_file_format: string
          target_file_name: string
          target_full_markdown: string | null
          target_storage_path: string
          total_findings: number
          total_sentences: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          progress_percent?: number
          report_json?: Json | null
          status?: string
          status_message?: string | null
          target_file_format: string
          target_file_name: string
          target_full_markdown?: string | null
          target_storage_path: string
          total_findings?: number
          total_sentences?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          progress_percent?: number
          report_json?: Json | null
          status?: string
          status_message?: string | null
          target_file_format?: string
          target_file_name?: string
          target_full_markdown?: string | null
          target_storage_path?: string
          total_findings?: number
          total_sentences?: number
        }
        Relationships: []
      }
      regulation_clauses: {
        Row: {
          clause_id: string
          content: string
          created_at: string
          id: string
          order_index: number
          regulation_id: string
          title: string | null
        }
        Insert: {
          clause_id: string
          content: string
          created_at?: string
          id?: string
          order_index?: number
          regulation_id: string
          title?: string | null
        }
        Update: {
          clause_id?: string
          content?: string
          created_at?: string
          id?: string
          order_index?: number
          regulation_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regulation_clauses_regulation_id_fkey"
            columns: ["regulation_id"]
            isOneToOne: false
            referencedRelation: "regulations"
            referencedColumns: ["id"]
          },
        ]
      }
      regulations: {
        Row: {
          category: string
          created_at: string
          effective_date: string | null
          file_format: string
          file_name: string
          full_markdown: string | null
          id: string
          is_image_based: boolean
          note: string | null
          parse_error: string | null
          parse_status: string
          storage_path: string
        }
        Insert: {
          category: string
          created_at?: string
          effective_date?: string | null
          file_format: string
          file_name: string
          full_markdown?: string | null
          id?: string
          is_image_based?: boolean
          note?: string | null
          parse_error?: string | null
          parse_status?: string
          storage_path: string
        }
        Update: {
          category?: string
          created_at?: string
          effective_date?: string | null
          file_format?: string
          file_name?: string
          full_markdown?: string | null
          id?: string
          is_image_based?: boolean
          note?: string | null
          parse_error?: string | null
          parse_status?: string
          storage_path?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
