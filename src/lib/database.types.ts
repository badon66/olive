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
      active_jobs: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          sheet_row_ref: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          sheet_row_ref?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          sheet_row_ref?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_jobs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      app_settings: {
        Row: {
          reminders_globally_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          reminders_globally_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          reminders_globally_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
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
      daily_schedule_setup: {
        Row: {
          bedtime: string | null
          blocked_windows: Json
          created_at: string
          date: string
          going_selling: boolean
          id: string
          raw_blurb: string | null
          user_id: string
          wake_time: string
        }
        Insert: {
          bedtime?: string | null
          blocked_windows?: Json
          created_at?: string
          date: string
          going_selling?: boolean
          id?: string
          raw_blurb?: string | null
          user_id: string
          wake_time?: string
        }
        Update: {
          bedtime?: string | null
          blocked_windows?: Json
          created_at?: string
          date?: string
          going_selling?: boolean
          id?: string
          raw_blurb?: string | null
          user_id?: string
          wake_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_schedule_setup_user_id_fkey"
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
      reminder_fires: {
        Row: {
          dismissed: boolean
          fired_at: string
          id: string
          occurrence_at: string
          reminder_id: string
          repeat_count: number
          user_id: string
        }
        Insert: {
          dismissed?: boolean
          fired_at?: string
          id?: string
          occurrence_at: string
          reminder_id: string
          repeat_count?: number
          user_id: string
        }
        Update: {
          dismissed?: boolean
          fired_at?: string
          id?: string
          occurrence_at?: string
          reminder_id?: string
          repeat_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_fires_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "reminders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_fires_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      reminders: {
        Row: {
          active: boolean
          created_at: string
          day_of_month: number | null
          days_of_week: number[] | null
          fire_at: string | null
          id: string
          interval_minutes: number | null
          last_fired_at: string | null
          max_repeats: number
          message: string | null
          name: string
          recurrence_type: Database["public"]["Enums"]["reminder_recurrence"]
          repeat_interval_seconds: number
          sound_id: string
          time_of_day: string | null
          user_id: string
          volume: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          day_of_month?: number | null
          days_of_week?: number[] | null
          fire_at?: string | null
          id?: string
          interval_minutes?: number | null
          last_fired_at?: string | null
          max_repeats?: number
          message?: string | null
          name: string
          recurrence_type: Database["public"]["Enums"]["reminder_recurrence"]
          repeat_interval_seconds?: number
          sound_id?: string
          time_of_day?: string | null
          user_id: string
          volume?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          day_of_month?: number | null
          days_of_week?: number[] | null
          fire_at?: string | null
          id?: string
          interval_minutes?: number | null
          last_fired_at?: string | null
          max_repeats?: number
          message?: string | null
          name?: string
          recurrence_type?: Database["public"]["Enums"]["reminder_recurrence"]
          repeat_interval_seconds?: number
          sound_id?: string
          time_of_day?: string | null
          user_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tasks: {
        Row: {
          auto_carry_forward: boolean
          candidate_dates: string[] | null
          placed_date: string | null
          window_end: string | null
          window_start: string | null
          category_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          duration_minutes: number | null
          id: string
          job_id: string | null
          priority_weight: number
          scheduled_time: string | null
          sort_order: number | null
          status: Database["public"]["Enums"]["task_status"]
          time_section: Database["public"]["Enums"]["time_section"] | null
          title: string
          user_id: string
        }
        Insert: {
          auto_carry_forward?: boolean
          candidate_dates?: string[] | null
          placed_date?: string | null
          window_end?: string | null
          window_start?: string | null
          category_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          job_id?: string | null
          priority_weight?: number
          scheduled_time?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"]
          time_section?: Database["public"]["Enums"]["time_section"] | null
          title: string
          user_id: string
        }
        Update: {
          auto_carry_forward?: boolean
          candidate_dates?: string[] | null
          placed_date?: string | null
          window_end?: string | null
          window_start?: string | null
          category_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          job_id?: string | null
          priority_weight?: number
          scheduled_time?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"]
          time_section?: Database["public"]["Enums"]["time_section"] | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "active_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      weekly_task_checkins: {
        Row: {
          created_at: string
          date: string
          duration_minutes: number | null
          id: string
          note: string | null
          status: Database["public"]["Enums"]["checkin_status"]
          user_id: string
          weekly_task_id: string
        }
        Insert: {
          created_at?: string
          date: string
          duration_minutes?: number | null
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["checkin_status"]
          user_id: string
          weekly_task_id: string
        }
        Update: {
          created_at?: string
          date?: string
          duration_minutes?: number | null
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["checkin_status"]
          user_id?: string
          weekly_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_checkins_habit_id_fkey"
            columns: ["weekly_task_id"]
            isOneToOne: false
            referencedRelation: "weekly_tasks"
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
      weekly_tasks: {
        Row: {
          created_at: string
          id: string
          name: string
          recurrence_mode: Database["public"]["Enums"]["recurrence_mode"]
          scheduled_days: number[] | null
          sort_order: number | null
          target_per_week: number | null
          time_section: Database["public"]["Enums"]["time_section"] | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          recurrence_mode?: Database["public"]["Enums"]["recurrence_mode"]
          scheduled_days?: number[] | null
          sort_order?: number | null
          target_per_week?: number | null
          time_section?: Database["public"]["Enums"]["time_section"] | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          recurrence_mode?: Database["public"]["Enums"]["recurrence_mode"]
          scheduled_days?: number[] | null
          sort_order?: number | null
          target_per_week?: number | null
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
      checkin_status: "planned" | "completed" | "skipped"
      job_status: "quoted" | "sold" | "in_progress" | "paid"
      recurrence_mode: "count" | "fixed_days"
      reminder_recurrence: "one_time" | "interval" | "daily" | "weekly" | "monthly"
      task_status: "open" | "completed"
      time_section:
        | "morning"
        | "midday"
        | "afternoon"
        | "evening"
        | "anytime"
        | "night"
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
      checkin_status: ["planned", "completed", "skipped"],
      job_status: ["quoted", "sold", "in_progress", "paid"],
      recurrence_mode: ["count", "fixed_days"],
      reminder_recurrence: ["one_time", "interval", "daily", "weekly", "monthly"],
      task_status: ["open", "completed"],
      time_section: [
        "morning",
        "midday",
        "afternoon",
        "evening",
        "anytime",
        "night",
      ],
    },
  },
} as const
