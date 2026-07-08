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
      daily_briefs: {
        Row: {
          brief_date: string
          content: Json
          generated_at: string
          id: string
          manual_order: string[] | null
          user_id: string
        }
        Insert: {
          brief_date: string
          content: Json
          generated_at?: string
          id?: string
          manual_order?: string[] | null
          user_id: string
        }
        Update: {
          brief_date?: string
          content?: Json
          generated_at?: string
          id?: string
          manual_order?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      habit_checkins: {
        Row: {
          completed: boolean
          created_at: string
          date: string
          duration_minutes: number | null
          habit_id: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          date: string
          duration_minutes?: number | null
          habit_id: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          date?: string
          duration_minutes?: number | null
          habit_id?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_checkins_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      habits: {
        Row: {
          created_at: string
          frequency: Database["public"]["Enums"]["habit_frequency"]
          id: string
          name: string
          time_section: Database["public"]["Enums"]["time_section"] | null
          user_id: string
        }
        Insert: {
          created_at?: string
          frequency?: Database["public"]["Enums"]["habit_frequency"]
          id?: string
          name: string
          time_section?: Database["public"]["Enums"]["time_section"] | null
          user_id: string
        }
        Update: {
          created_at?: string
          frequency?: Database["public"]["Enums"]["habit_frequency"]
          id?: string
          name?: string
          time_section?: Database["public"]["Enums"]["time_section"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          cleaned_text: string | null
          created_at: string
          date: string
          id: string
          raw_transcript: string
          tags: string[]
          user_id: string
        }
        Insert: {
          cleaned_text?: string | null
          created_at?: string
          date: string
          id?: string
          raw_transcript: string
          tags?: string[]
          user_id: string
        }
        Update: {
          cleaned_text?: string | null
          created_at?: string
          date?: string
          id?: string
          raw_transcript?: string
          tags?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      memories: {
        Row: {
          content: string
          created_at: string
          date: string | null
          id: string
          tags: string[]
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          date?: string | null
          id?: string
          tags?: string[]
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          date?: string | null
          id?: string
          tags?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tasks: {
        Row: {
          category: Database["public"]["Enums"]["task_category"]
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          priority_weight: number
          scheduled_time: string | null
          status: Database["public"]["Enums"]["task_status"]
          time_section: Database["public"]["Enums"]["time_section"] | null
          title: string
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["task_category"]
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          priority_weight?: number
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          time_section?: Database["public"]["Enums"]["time_section"] | null
          title: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["task_category"]
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          priority_weight?: number
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          time_section?: Database["public"]["Enums"]["time_section"] | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      app_user: {
        Row: {
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_anthropic_key: { Args: never; Returns: string }
      get_cron_secret: { Args: never; Returns: string }
    }
    Enums: {
      habit_frequency: "daily" | "weekly"
      task_category: "personal" | "powerplay" | "alberta_premium"
      task_status: "open" | "completed"
      time_section: "morning" | "midday" | "afternoon" | "evening" | "anytime"
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
    Enums: {
      habit_frequency: ["daily", "weekly"],
      task_category: ["personal", "powerplay", "alberta_premium"],
      task_status: ["open", "completed"],
      time_section: ["morning", "midday", "afternoon", "evening", "anytime"],
    },
  },
} as const
